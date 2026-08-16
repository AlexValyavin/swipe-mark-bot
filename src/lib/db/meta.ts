import { getAdminDb } from "@/lib/db/supabase";
import type { CardRow } from "@/lib/db/types";

export type MetaStatus = "pending" | "processing" | "done" | "failed";

export const META_ERROR_KINDS = ["timeout", "403", "parse", "network"] as const;
export type MetaErrorKind = (typeof META_ERROR_KINDS)[number];

/**
 * Краткая таксономия ошибок метаданных. Любой другой текст приводим к "parse".
 */
export function normalizeMetaError(error: unknown): string {
  if (typeof error !== "string") return "parse";
  const text = error.toLowerCase();
  if (META_ERROR_KINDS.some((k) => text.includes(k))) return text;
  return "parse";
}

/** Устанавливает статус и (опционально) ошибку метаданных карточки. */
export async function setCardMetaStatus(
  cardId: string,
  status: MetaStatus,
  error?: string | null
): Promise<void> {
  const patch: Partial<CardRow> = { meta_status: status };
  if (error !== undefined) patch.meta_error = error ? normalizeMetaError(error) : null;
  await getAdminDb().from("cards").update(patch).eq("id", cardId);
}

/** Последние N карточек с meta_status='failed' для диагностики. */
export async function listFailedCards(limit = 20): Promise<
  Array<{
    id: string;
    url: string | null;
    error: string | null;
    createdAt: string;
  }>
> {
  const { data } = await getAdminDb()
    .from("cards")
    .select("id, meta_error, created_at, card_links(url)")
    .eq("meta_status", "failed")
    .order("updated_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((row) => {
    const links = (row.card_links as Array<{ url: string } | null> | null) ?? [];
    return {
      id: row.id as string,
      url: links[0]?.url ?? null,
      error: (row.meta_error as string | null) ?? null,
      createdAt: row.created_at as string,
    };
  });
}
