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