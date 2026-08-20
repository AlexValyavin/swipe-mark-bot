import { getAdminDb } from "@/lib/db/supabase";
import { getAiSettings } from "@/lib/db/settings";
import { getFolderByName, listFolders } from "@/lib/db/folders";
import { decryptSecret } from "@/lib/crypto";
import {
  chatCompletion,
  PROVIDER_DEFAULT_MODELS,
  type AiProvider,
} from "@/lib/ai/adapter";
import { findOrCreateTag, addCardTags } from "@/lib/db/tags";

export type AiSuggestion = {
  title: string | null;
  summary: string | null;
  tags: string[];
  folder: string | null;
  confidence: number;
};

export type EnrichOutcome =
  | { status: "done"; suggestion: AiSuggestion; applied: boolean }
  | { status: "failed"; reason: string };

export type EnrichMode = "off" | "suggest" | "auto";

const PROMPT_MAX_CHARS = 4000;

/**
 * Собирает промпт для распределения одной карточки.
 * Папки — только существующие у пользователя.
 */
export async function buildPrompt(
  userId: string,
  card: {
    source_type: string;
    title: string | null;
    text: string | null;
    url?: string | null;
    urls?: string[];
  }
): Promise<string> {
  const folders = await listFolders(userId);
  const folderLine =
    folders.length > 0
      ? folders.map((f) => `${f.emoji ?? "📁"} ${f.name}`).join(", ")
      : "папок нет";

  const title = (card.title ?? "").slice(0, PROMPT_MAX_CHARS);
  const text = (card.text ?? "").slice(0, PROMPT_MAX_CHARS);
  const urls = card.urls ?? (card.url ? [card.url] : []);

  return [
    `Папки пользователя: ${folderLine}`,
    `Тип: ${card.source_type}. Заголовок/текст: ${title}${text ? ` ${text}` : ""}`,
    `Ссылки: ${urls.join(", ") || "нет"}`,
    'Верни строго JSON: {"title": string|null, "summary": string|null, "tags": string[](≤3), "folder": string|null, "confidence": 0..1}',
  ].join("\n");
}

function extractJson(text: string): string | null {
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) return text.slice(first, last + 1);
  return null;
}

/** Лёгкий парсер JSON с fallback: вырезаем первый {...} и пробуем распарсить. */
export function parseAiJson(text: string): AiSuggestion {
  let raw: string | null = text.trim();
  if (!raw.startsWith("{")) raw = extractJson(raw);
  if (!raw) throw new Error("No JSON object in response");

  const data = JSON.parse(raw) as {
    title?: unknown;
    summary?: unknown;
    tags?: unknown;
    folder?: unknown;
    confidence?: unknown;
  };

  const confidence = Number(data.confidence);
  const tags = Array.isArray(data.tags)
    ? data.tags
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 3)
    : [];

  const suggestion: AiSuggestion = {
    title: typeof data.title === "string" && data.title.trim() ? data.title.trim().slice(0, 120) : null,
    summary:
      typeof data.summary === "string" && data.summary.trim()
        ? data.summary.trim().slice(0, 2000)
        : null,
    tags,
    folder: typeof data.folder === "string" && data.folder.trim() ? data.folder.trim() : null,
    confidence: Number.isFinite(confidence) ? Math.min(Math.max(confidence, 0), 1) : 0,
  };
  return suggestion;
}

async function resolveAiContext(userId: string): Promise<{
  mode: EnrichMode;
  provider: AiProvider;
  apiKey: string;
  model: string;
  baseUrl?: string;
} | null> {
  // Глобальный ключ владельца (env) — основной источник для всех пользователей.
  const globalKey = process.env.OPENROUTER_API_KEY?.trim();
  if (globalKey) {
    return {
      mode: "auto",
      provider: "openrouter",
      apiKey: globalKey,
      model: process.env.AI_MODEL?.trim() || "deepseek/deepseek-v4-flash-0731",
    };
  }

  // Fallback: BYOK-настройки пользователя (для локальной разработки).
  const s = await getAiSettings(userId);
  if (!s) return null;
  const mode = (s.ai_mode as EnrichMode) ?? "off";
  if (mode === "off") return null;
  if (!s.ai_key_enc) return null;

  let apiKey: string;
  try {
    apiKey = decryptSecret(s.ai_key_enc);
  } catch (e) {
    console.error("AI key decrypt failed:", e);
    return null;
  }
  if (!apiKey) return null;

  const provider = (s.provider as AiProvider) ?? "openrouter";
  return {
    mode,
    provider,
    apiKey,
    model: s.ai_model ?? PROVIDER_DEFAULT_MODELS[provider],
    baseUrl: s.ai_custom_base_url ?? undefined,
  };
}

/**
 * Запускает AI-обогащение карточки. Все ошибки перехватываются:
 * карточка остаётся живой, ai_status=failed.
 * Возвращает outcome для логов/тестов.
 */
export async function enrichCard(userId: string, cardId: string): Promise<EnrichOutcome> {
  const db = getAdminDb();

  const ctx = await resolveAiContext(userId);
  if (!ctx) {
    return { status: "failed", reason: "ai off or no key" };
  }

  // Пометим processing (не пишем в лог, только в БД).
  await db
    .from("cards")
    .update({ ai_status: "processing", updated_at: new Date().toISOString() })
    .eq("id", cardId)
    .eq("user_id", userId);

  const { data: card } = await db
    .from("cards")
    .select("id, source_type, title, text, source_url, ai_status, ai_folder_id")
    .eq("id", cardId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!card) return { status: "failed", reason: "card not found" };

  const { data: links } = await db
    .from("card_links")
    .select("url")
    .eq("card_id", cardId);
  const urls = (links ?? []).map((l) => l.url);

  let suggestion: AiSuggestion;
  try {
    const prompt = await buildPrompt(userId, {
      source_type: card.source_type,
      title: card.title,
      text: card.text,
      url: card.source_url,
      urls,
    });

    const result = await chatCompletion({
      provider: ctx.provider,
      apiKey: ctx.apiKey,
      model: ctx.model,
      baseUrl: ctx.baseUrl,
      messages: [
        { role: "system", content: "Ты помощник для сортировки сохранённых ссылок." },
        { role: "user", content: prompt },
      ],
      maxTokens: 600,
      timeoutMs: 10000,
    });

    suggestion = parseAiJson(result.content);
  } catch (e) {
    const reason = e instanceof Error ? e.message : "unknown error";
    await db
      .from("cards")
      .update({ ai_status: "failed", updated_at: new Date().toISOString() })
      .eq("id", cardId);
    return { status: "failed", reason };
  }

  // Папка: только подсказка (ai_folder_id) — применяется вручную через ai-accept.
  // Авто-перемещение отключено: теги добавляются автоматически, папка не трогается.
  let aiFolderId: string | null = null;
  const applied = false;
  if (suggestion.folder) {
    try {
      // Модель может вернуть "💼 win" (эмодзи из промпта) — нормализуем к чистому имени.
      const folderName = normalizeFolderName(suggestion.folder);
      const folder = await getFolderByName(userId, folderName);
      if (folder) {
        aiFolderId = folder.id;
      }
      // Папки нет — не создаём (по ТЗ «авто-создание запрещено»), suggestion не пишем.
    } catch (e) {
      console.error("Folder resolve failed:", e);
    }
  }

  // Апсерт результатов.
  const patch: Record<string, unknown> = {
    ai_title: suggestion.title,
    ai_summary: suggestion.summary,
    ai_folder_id: aiFolderId,
    ai_confidence: suggestion.confidence,
    ai_status: "done",
    updated_at: new Date().toISOString(),
  };
  const { error } = await db.from("cards").update(patch).eq("id", cardId).eq("user_id", userId);
  if (error) throw error;

  // Теги: апсерт в tags(source=ai) + связи.
  if (suggestion.tags.length > 0) {
    try {
      for (const name of suggestion.tags) {
        await findOrCreateTag(userId, name, "ai");
      }
      await addCardTags(userId, cardId, suggestion.tags, "ai");
    } catch (e) {
      console.error("AI tags save failed:", e);
    }
  }

  // Саммари должно быть всегда: промпт сортировки может вернуть summary: null.
  // В таком случае генерируем его отдельным вызовом (специализированный промпт).
  if (!suggestion.summary) {
    const summaryOutcome = await generateCardSummary(userId, cardId);
    if (summaryOutcome.status === "failed") {
      await db
        .from("cards")
        .update({ ai_status: "failed", updated_at: new Date().toISOString() })
        .eq("id", cardId)
        .eq("user_id", userId);
      return { status: "failed", reason: summaryOutcome.reason };
    }
  }

  return { status: "done", suggestion, applied };
}

async function addCardToFolder(cardId: string, folderId: string): Promise<void> {
  await getAdminDb().from("card_folders").upsert({ card_id: cardId, folder_id: folderId });
}

/**
 * Убирает эмодзи-префикс ("💼 win" → "win") и лишние пробелы из имени папки,
 * которое вернула модель.
 */
export function normalizeFolderName(raw: string): string {
  return raw
    .replace(/^\s*[\p{Extended_Pictographic}\p{Emoji_Component}\uFE0F\u200D]+\s*/u, "")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Применяет подсказку вручную (ai-accept): переносит карточку в папку и/или чистит чип.
 */
export async function acceptSuggestion(
  userId: string,
  cardId: string,
  kind: "folder" | "tags" | "all"
): Promise<void> {
  const db = getAdminDb();
  const { data: card } = await db
    .from("cards")
    .select("ai_folder_id, ai_status")
    .eq("id", cardId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!card) throw new Error("Card not found");

  if ((kind === "folder" || kind === "all") && card.ai_folder_id) {
    await addCardToFolder(cardId, card.ai_folder_id);
  }

  await db
    .from("cards")
    .update({ ai_folder_id: null, ai_status: "done", updated_at: new Date().toISOString() })
    .eq("id", cardId);
}

/**
 * Отменяет подсказку (ai-dismiss): чистим ai_folder_id/ai_confidence.
 */
export async function dismissSuggestion(userId: string, cardId: string): Promise<void> {
  await getAdminDb()
    .from("cards")
    .update({
      ai_folder_id: null,
      ai_confidence: null,
      ai_status: "done",
      updated_at: new Date().toISOString(),
    })
    .eq("id", cardId)
    .eq("user_id", userId);
}

export type SummaryOutcome =
  | { status: "ok"; summary: string }
  | { status: "no_ai" }
  | { status: "no_content" }
  | { status: "failed"; reason: string };

/**
 * Генерирует краткое саммари карточки (до ~90 слов) через BYOK-адаптер.
 * Пишет ai_summary в cards. Не требует ai_mode — работает при любом подключённом ключе.
 * Ошибки перехватываются: карточка не роняется.
 */
export async function generateCardSummary(
  userId: string,
  cardId: string
): Promise<SummaryOutcome> {
  const db = getAdminDb();

  const { data: card } = await db
    .from("cards")
    .select("id, source_type, title, text, source_url")
    .eq("id", cardId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!card) return { status: "no_content" };

  const { data: links } = await db
    .from("card_links")
    .select("og_description")
    .eq("card_id", cardId)
    .limit(1);
  const description = (links?.[0] as { og_description?: string | null } | undefined)
    ?.og_description;

  const content = [
    card.title,
    card.text,
    description,
    card.source_url ? `ссылка: ${card.source_url}` : null,
  ]
    .filter((x): x is string => Boolean(x && x.trim()))
    .join("\n")
    .slice(0, PROMPT_MAX_CHARS);
  if (!content.trim()) return { status: "no_content" };

  const ctx = await resolveAiContext(userId);
  if (!ctx) return { status: "no_ai" };

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
            "Ты кратко пересказываешь сохранённые ссылки. Верни только саммари без вступлений, 2–3 предложения, до 90 слов.",
        },
        { role: "user", content: `Кратко о чём это:\n${content}` },
      ],
      maxTokens: 200,
      timeoutMs: 15000,
    });

    const summary = result.content.trim().replace(/\s+/g, " ").slice(0, 500);
    if (!summary) return { status: "failed", reason: "empty response" };

    await db
      .from("cards")
      .update({ ai_summary: summary, updated_at: new Date().toISOString() })
      .eq("id", cardId)
      .eq("user_id", userId);

    return { status: "ok", summary };
  } catch (e) {
    return { status: "failed", reason: e instanceof Error ? e.message : "unknown" };
  }
}