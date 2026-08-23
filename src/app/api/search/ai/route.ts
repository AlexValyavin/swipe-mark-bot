import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getAdminDb } from "@/lib/db/supabase";
import { getByIds } from "@/lib/db/cards";
import { embed, AiError, EMBEDDING_DIMENSIONS, chatCompletion } from "@/lib/ai/adapter";
import { resolveAiContext } from "@/lib/ai/enrich";
import { checkAiAllowed, recordAiUsage } from "@/lib/ai/quota";

export const runtime = "nodejs";

const VECTOR_CANDIDATES = 20;
const FTS_CANDIDATES = 50;
const FINAL_LIMIT = 20;
const RRF_K = 60;
const CONTEXT_SNIPPET = 400;

type ScoredId = { id: string; score: number };

function rrfMerge(lists: string[][]): ScoredId[] {
  const scores = new Map<string, number>();
  for (const list of lists) {
    list.forEach((id, i) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (RRF_K + i + 1));
    });
  }
  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, FINAL_LIMIT);
}

/** LLM-ответ по top-5 результатов. Возвращает null при отказе/ошибке (результаты всё равно показываем). */
async function answerWithLlm(
  userId: string,
  q: string,
  results: Awaited<ReturnType<typeof getByIds>>
): Promise<{ answer: string | null; quotaExhausted: boolean }> {
  if (results.length === 0) return { answer: null, quotaExhausted: false };

  const check = await checkAiAllowed(userId, "search");
  if (!check.ok) return { answer: null, quotaExhausted: check.reason === "quota" };

  const ctx = await resolveAiContext(userId);
  if (!ctx) return { answer: null, quotaExhausted: false };

  const context = results
    .slice(0, 5)
    .map(
      (b, i) =>
        `${i + 1}. ${b.title || "(без заголовка)"} — ${(b.aiSummary || b.description || "").slice(0, CONTEXT_SNIPPET)}`
    )
    .join("\n");

  try {
    const result = await chatCompletion({
      provider: ctx.provider,
      apiKey: ctx.apiKey,
      model: ctx.model,
      baseUrl: ctx.baseUrl,
      messages: [
        {
          role: "system",
          content:
            "Ты помогаешь пользователю ориентироваться в его личной библиотеке сохранённых ссылок и заметок SwipeMark. Отвечай кратко (до 120 слов), на русском языке, опираясь только на список сохранений. Если по вопросу ничего релевантного — так и скажи.",
        },
        { role: "user", content: `Вопрос: ${q}\n\nСохранения пользователя:\n${context}` },
      ],
      maxTokens: 300,
      timeoutMs: 15000,
    });
    await recordAiUsage(userId, "search", null, "success", ctx.model);
    return { answer: result.content.trim(), quotaExhausted: false };
  } catch (e) {
    console.error("Search LLM error:", e instanceof Error ? e.message : e);
    await recordAiUsage(userId, "search", null, "failed", ctx.model);
    return { answer: null, quotaExhausted: false };
  }
}

/**
 * AI-поиск: embed(запроса) → cosine top-N через RPC match_cards
 * + FTS top-M → RRF-слияние → top-20 карточек.
 * ask=true → LLM-ответ поверх top-5 (квота kind='search', free 20/мес).
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await getSessionUser(req);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as { q?: unknown; ask?: unknown };
    const q = typeof body.q === "string" ? body.q.trim().slice(0, 300) : "";
    const ask = body.ask === true;
    if (!q) return NextResponse.json({ error: "Bad request" }, { status: 400 });

    const db = getAdminDb();
    const lists: string[][] = [];

    // 1) Векторный поиск: RPC match_cards (миграция 0009)
    try {
      const queryVec = await embed(q);
      if (queryVec.length !== EMBEDDING_DIMENSIONS) {
        throw new AiError("parse", `dims mismatch ${queryVec.length}`);
      }
      const { data: matches, error: rpcError } = await db.rpc("match_cards", {
        p_user_id: userId,
        p_query_embedding: `[${queryVec.join(",")}]`,
        p_match_count: VECTOR_CANDIDATES,
      });
      if (!rpcError && Array.isArray(matches)) {
        lists.push((matches as { id: string }[]).map((m) => m.id));
      }
    } catch (e) {
      // нет embedding-ключа или миграции — векторная ветка просто не даёт кандидатов
      console.error("Vector search skipped:", e instanceof Error ? e.message : e);
    }

    // 2) FTS (миграция 0008)
    {
      const { data: ftsRows, error: ftsError } = await db
        .from("cards")
        .select("id")
        .eq("user_id", userId)
        .textSearch("search_vector", q, { type: "websearch", config: "russian" })
        .limit(FTS_CANDIDATES);
      if (!ftsError && ftsRows) lists.push(ftsRows.map((r) => r.id));
    }

    // 3) Fallback: если обе ветки пусты (нет ключей/миграций) — ILIKE как последний шанс
    let merged = rrfMerge(lists);
    if (merged.length === 0) {
      const { data: fallbackRows } = await db
        .from("cards")
        .select("id")
        .eq("user_id", userId)
        .or(`title.ilike.%${q}%,text.ilike.%${q}%`)
        .limit(FINAL_LIMIT);
      merged = (fallbackRows ?? []).map((r) => ({ id: r.id, score: 1 }));
    }

    const results = await getByIds(userId, merged.map((m) => m.id));

    // Проставляем score по порядку merged
    const scoreById = new Map(merged.map((m) => [m.id, m.score]));
    const scores = Object.fromEntries(results.map((r) => [r.id, scoreById.get(r.id) ?? 0]));

    // Этап 3: LLM-ответ только при ask=true
    let answer: string | null = null;
    let quotaExhausted = false;
    let blocked = false;
    if (ask) {
      const blockedCheck = await checkAiAllowed(userId, "search");
      if (!blockedCheck.ok && blockedCheck.reason === "blocked") blocked = true;
      else {
        const res2 = await answerWithLlm(userId, q, results);
        answer = res2.answer;
        quotaExhausted = res2.quotaExhausted;
      }
    }

    return NextResponse.json({
      q,
      results,
      scores,
      total: results.length,
      answer,
      quotaExhausted: ask ? quotaExhausted : false,
      blocked,
    });
  } catch (e) {
    console.error("AI search error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

