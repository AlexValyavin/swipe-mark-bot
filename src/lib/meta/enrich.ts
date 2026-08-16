import { getAdminDb } from "@/lib/db/supabase";
import type { CardLinkRow, CardRow } from "@/lib/db/types";
import { setCardMetaStatus } from "@/lib/db/meta";
import { parseUrl, type ParsedMeta, type Provider } from "./parsers";
import { getMetaFromCache, putMetaToCache } from "./cache";

export type MetaEnrichOutcome =
  | { status: "done"; updated: boolean; cached: boolean; provider: Provider }
  | { status: "failed"; reason: string };

const PROVIDERS: Provider[] = ["youtube", "instagram", "tiktok", "twitter", "telegram", "generic"];

function toProvider(value: unknown): Provider {
  return typeof value === "string" && (PROVIDERS as string[]).includes(value)
    ? (value as Provider)
    : "generic";
}

/**
 * Обогащает карточку метаданными по её ссылкам (card_links).
 * Порядок:
 *   1. Кэш (sha256 canonical_url) — если есть, берём оттуда.
 *   2. Иначе сеть: парсер по домену.
 *   3. Записываем og_* в card_links + card.title/image_url/duration_seconds (если пустые).
 *   4. meta_status = done | failed (с краткой ошибкой).
 */
export async function enrichCardMeta(userId: string, cardId: string): Promise<MetaEnrichOutcome> {
  const db = getAdminDb();

  const { data: card, error: cardErr } = await db
    .from("cards")
    .select("*")
    .eq("id", cardId)
    .eq("user_id", userId)
    .maybeSingle();
  if (cardErr || !card) return { status: "failed", reason: "not_found" };

  const { data: links, error: linkErr } = await db
    .from("card_links")
    .select("*")
    .eq("card_id", cardId)
    .order("created_at", { ascending: true });
  if (linkErr) return { status: "failed", reason: "db" };
  const cardLinks = (links ?? []) as CardLinkRow[];

  const targetUrl = card.canonical_url ?? cardLinks[0]?.url ?? null;
  if (!targetUrl) {
    // Нет ссылок — меты не извлекаем, статус done (нечего парсить).
    await setCardMetaStatus(cardId, "done", null);
    return { status: "done", updated: false, cached: false, provider: "generic" };
  }

  // 1. Кэш.
  const cached = await getMetaFromCache(targetUrl);
  if (cached) {
    await applyMeta(card as CardRow, cardLinks, cached);
    await setCardMetaStatus(cardId, "done", null);
    return { status: "done", updated: true, cached: true, provider: toProvider(cached.provider) };
  }

  // 2. Сеть.
  try {
    const { provider, meta } = await parseUrl(targetUrl);
    if (!meta) {
      await setCardMetaStatus(cardId, "failed", "parse");
      return { status: "failed", reason: "parse" };
    }
    await applyMeta(card as CardRow, cardLinks, { ...meta, provider });
    await putMetaToCache(targetUrl, provider, meta);
    await setCardMetaStatus(cardId, "done", null);
    return { status: "done", updated: true, cached: false, provider };
  } catch (e) {
    const reason = String(e);
    const kind = reason.includes("403")
      ? "403"
      : reason.includes("timeout")
        ? "timeout"
        : "network";
    await setCardMetaStatus(cardId, "failed", kind);
    return { status: "failed", reason: kind };
  }
}

/** Применяет мету к card_links (og_*) и к карточке (если поля пустые). */
async function applyMeta(
  card: CardRow,
  cardLinks: CardLinkRow[],
  meta: ParsedMeta & { provider?: string }
): Promise<void> {
  const db = getAdminDb();

  // 1. Обновляем og_* первой ссылки.
  const target = cardLinks[0];
  if (target) {
    const patch: Partial<CardLinkRow> = {};
    if (meta.title) patch.og_title = meta.title;
    if (meta.description) patch.og_description = meta.description;
    if (meta.image_url) patch.og_image_url = meta.image_url;
    if (Object.keys(patch).length > 0) {
      await db.from("card_links").update(patch).eq("id", target.id);
    }
  }

  // 2. Дублируем в карточку, только если поля пустые.
  const cardPatch: Partial<CardRow> = {};
  if (!card.title && meta.title) cardPatch.title = meta.title;
  if (!card.image_url && meta.image_url) cardPatch.image_url = meta.image_url;
  if (card.duration_seconds == null && meta.duration_seconds != null) {
    cardPatch.duration_seconds = meta.duration_seconds;
  }
  if (Object.keys(cardPatch).length > 0) {
    await db.from("cards").update(cardPatch).eq("id", card.id);
  }
}