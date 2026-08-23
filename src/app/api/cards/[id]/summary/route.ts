import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getForUser } from "@/lib/db/cards";
import { generateCardSummary } from "@/lib/ai/enrich";
import { getAdminDb } from "@/lib/db/supabase";
import { track } from "@/lib/analytics";
import { checkAiAllowed, recordAiUsage, isGlobalAiActiveAsync } from "@/lib/ai/quota";

export const runtime = "nodejs";

/**
 * Генерирует саммари карточки на лету. Кнопка «✨ Кратко» на карточке колоды.
 * Без подключённого AI-ключа — 400, чтобы UI прятал кнопку.
 * Квота: 10/мес на free (только глобальный ключ; BYOK не ограничиваем).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getSessionUser(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;

    const card = await getForUser(userId, id);
    if (!card) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Квота до вызова AI
    if (await isGlobalAiActiveAsync()) {
      const check = await checkAiAllowed(userId, "summary");
      if (!check.ok) {
        if (check.reason === "blocked") {
          return NextResponse.json(
            { error: "AI отключён для этого аккаунта", code: "blocked" },
            { status: 403 }
          );
        }
        return NextResponse.json(
          {
            error: "Лимит саммари на этот месяц исчерпан",
            code: "quota",
            resetsAt: check.quota.resetsAt,
            used: check.quota.summary.used,
          },
          { status: 429 }
        );
      }
    }

    void track("ai_summary_requested", userId, {
      content_type: card.type || null,
    });

    const outcome = await generateCardSummary(userId, id);
    void track("ai_summary_completed", userId, {
      status: outcome.status,
      content_type: card.type || null,
    });
    switch (outcome.status) {
      case "ok":
        await recordAiUsage(userId, "summary", id, "success");
        await getAdminDb()
          .from("cards")
          .update({ ai_status: "done", updated_at: new Date().toISOString() })
          .eq("id", id)
          .eq("user_id", userId);
        return NextResponse.json({ ok: true, summary: outcome.summary });
      case "no_ai":
        return NextResponse.json({ error: "AI не подключён" }, { status: 400 });
      case "no_content":
        return NextResponse.json({ error: "Нечего саммарировать" }, { status: 422 });
      default:
        // failed не считаем в лимит
        await recordAiUsage(userId, "summary", id, "failed");
        return NextResponse.json({ error: outcome.reason }, { status: 502 });
    }
  } catch (e) {
    console.error("Summary error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
