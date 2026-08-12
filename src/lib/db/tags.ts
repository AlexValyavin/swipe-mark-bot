import { getAdminDb } from "@/lib/db/supabase";
import type { TagRow } from "@/lib/db/types";

export type TagWithCount = Pick<TagRow, "id" | "user_id" | "name" | "source"> & {
  count: number;
};

export function normalizeTagName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

export async function listTagsByUser(
  userId: string,
  q?: string
): Promise<TagWithCount[]> {
  const db = getAdminDb();
  let query = db
    .from("tags")
    .select("id, user_id, name, source")
    .eq("user_id", userId)
    .order("name", { ascending: true });
  if (q) query = query.ilike("name", `%${q.trim()}%`);

  const { data: tags, error } = await query.limit(200);
  if (error) throw error;

  const ids = (tags ?? []).map((t) => t.id);
  if (ids.length === 0) return [];
  const { data: links, error: linkErr } = await db
    .from("card_tags")
    .select("tag_id")
    .in("tag_id", ids);
  if (linkErr) throw linkErr;

  const counts = new Map<string, number>();
  for (const row of links ?? []) {
    counts.set(row.tag_id, (counts.get(row.tag_id) ?? 0) + 1);
  }

  return (tags ?? [])
    .map((t) => ({ ...t, count: counts.get(t.id) ?? 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 50);
}

async function findTag(userId: string, name: string): Promise<TagRow | null> {
  const { data } = await getAdminDb()
    .from("tags")
    .select("*")
    .eq("user_id", userId)
    .eq("name", name)
    .maybeSingle();
  return data ?? null;
}

export async function findOrCreateTag(
  userId: string,
  rawName: string,
  source: "manual" | "ai" = "manual"
): Promise<TagRow> {
  const name = normalizeTagName(rawName);
  const existing = await findTag(userId, name);
  if (existing) return existing;
  const { data, error } = await getAdminDb()
    .from("tags")
    .insert({ user_id: userId, name, source })
    .select("*")
    .single();
  if (error && error.code === "23505") {
    const again = await findTag(userId, name);
    if (again) return again;
    throw error;
  }
  if (error) throw error;
  return data as TagRow;
}

export async function addCardTags(
  userId: string,
  cardId: string,
  rawNames: string[],
  source: "manual" | "ai" = "manual"
): Promise<void> {
  const db = getAdminDb();
  for (const raw of rawNames) {
    const tag = await findOrCreateTag(userId, raw, source);
    const { error } = await db
      .from("card_tags")
      .upsert({ card_id: cardId, tag_id: tag.id, source })
      .select("tag_id")
      .single();
    if (error) throw error;
  }
}

/**
 * Полная замена набора тегов карточки: удаляет старые связи и добавляет новые.
 */
export async function setCardTags(
  userId: string,
  cardId: string,
  rawNames: string[],
  source: "manual" | "ai" = "manual"
): Promise<void> {
  const db = getAdminDb();
  const { data: existing, error: delErr } = await db
    .from("card_tags")
    .delete()
    .eq("card_id", cardId)
    .select("tag_id");
  if (delErr) throw delErr;

  // Теги, которые всё ещё используются другими карточками, не удаляем полностью.
  const names = rawNames
    .map((n) => normalizeTagName(n))
    .filter((n) => n.length > 0);

  for (const name of names) {
    const tag = await findOrCreateTag(userId, name, source);
    const { error } = await db
      .from("card_tags")
      .upsert({ card_id: cardId, tag_id: tag.id, source })
      .select("tag_id")
      .single();
    if (error) throw error;
  }

  // Чистим осиротевшие теги (без связей ни с одной карточкой пользователя).
  if ((existing ?? []).length > 0) {
    const orphanIds: string[] = [];
    for (const row of existing ?? []) {
      const { data: still } = await db
        .from("card_tags")
        .select("tag_id")
        .eq("tag_id", row.tag_id)
        .limit(1);
      if ((still ?? []).length === 0) orphanIds.push(row.tag_id);
    }
    if (orphanIds.length > 0) {
      await db
        .from("tags")
        .delete()
        .eq("user_id", userId)
        .in("id", orphanIds);
    }
  }
}

export async function removeCardTag(cardId: string, tagId: string): Promise<void> {
  const { error } = await getAdminDb()
    .from("card_tags")
    .delete()
    .eq("card_id", cardId)
    .eq("tag_id", tagId);
  if (error) throw error;
}

export async function getCardTagIds(cardId: string): Promise<string[]> {
  const { data, error } = await getAdminDb()
    .from("card_tags")
    .select("tag_id")
    .eq("card_id", cardId);
  if (error) throw error;
  return (data ?? []).map((r) => r.tag_id);
}

export async function getTagsForCardIds(
  cardIds: string[]
): Promise<Map<string, { id: string; name: string }[]>> {
  const out = new Map<string, { id: string; name: string }[]>();
  if (cardIds.length === 0) return out;

  const db = getAdminDb();
  const [ctRes, tagsRes] = await Promise.all([
    db.from("card_tags").select("card_id, tag_id").in("card_id", cardIds),
    db.from("tags").select("id, user_id, name"),
  ]);
  if (ctRes.error) throw ctRes.error;
  if (tagsRes.error) throw tagsRes.error;

  const names = new Map<string, string>();
  for (const t of (tagsRes.data ?? []) as Array<{ id: string; name: string }>) {
    names.set(t.id, t.name);
  }

  for (const ct of (ctRes.data ?? []) as Array<{ card_id: string; tag_id: string }>) {
    const name = names.get(ct.tag_id);
    if (!name) continue;
    const list = out.get(ct.card_id) ?? [];
    list.push({ id: ct.tag_id, name });
    out.set(ct.card_id, list);
  }
  return out;
}

export async function getCardTagIdsMap(cardIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (cardIds.length === 0) return out;
  const { data, error } = await getAdminDb()
    .from("card_tags")
    .select("card_id, tag_id")
    .in("card_id", cardIds);
  if (error) throw error;
  for (const r of (data ?? []) as Array<{ card_id: string; tag_id: string }>) {
    const list = out.get(r.card_id) ?? [];
    list.push(r.tag_id);
    out.set(r.card_id, list);
  }
  return out;
}