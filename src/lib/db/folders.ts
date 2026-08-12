import { getAdminDb } from "@/lib/db/supabase";
import type { FolderRow } from "@/lib/db/types";

export type FolderWithCount = Pick<
  FolderRow,
  "id" | "user_id" | "name" | "emoji" | "sort_order"
> & { count: number };

export async function listFolders(userId: string): Promise<FolderWithCount[]> {
  const db = getAdminDb();
  const { data: folders, error } = await db
    .from("folders")
    .select("id, user_id, name, emoji, sort_order")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;

  const counts = await getCardCountsByFolder(userId);
  return (folders ?? []).map((f) => ({ ...f, count: counts.get(f.id) ?? 0 }));
}

export async function getFolder(
  userId: string,
  folderId: string
): Promise<FolderRow | null> {
  const { data } = await getAdminDb()
    .from("folders")
    .select("*")
    .eq("id", folderId)
    .eq("user_id", userId)
    .maybeSingle();
  return data ?? null;
}

export async function getFolderByName(
  userId: string,
  name: string
): Promise<FolderRow | null> {
  // expression-index unique ищем через lower у себя (индекс применится в PG >= 10 только
  // если сравнить так же; проще сделать выборку в коде по точному имени)
  const { data } = await getAdminDb()
    .from("folders")
    .select("*")
    .eq("user_id", userId)
    .ilike("name", name)
    .maybeSingle();
  return data ?? null;
}

async function getCardCountsByFolder(userId: string): Promise<Map<string, number>> {
  const { data, error } = await getAdminDb()
    .from("card_folders")
    .select("folder_id, card_id")
    .in(
      "card_id",
      (
        await getAdminDb()
          .from("cards")
          .select("id")
          .eq("user_id", userId)
      ).data?.map((c) => c.id) ?? []
    );
  if (error) throw error;
  const acc = new Map<string, number>();
  for (const row of data ?? []) {
    acc.set(row.folder_id, (acc.get(row.folder_id) ?? 0) + 1);
  }
  return acc;
}

export async function createFolder(
  userId: string,
  input: { name: string; emoji?: string | null; sort_order?: number }
): Promise<FolderRow> {
  const dupe = await getFolderByName(userId, input.name);
  if (dupe) {
    const err = new Error("Folder already exists") as Error & { code?: string };
    err.code = "23505";
    throw err;
  }
  const { data, error } = await getAdminDb()
    .from("folders")
    .insert({
      user_id: userId,
      name: input.name,
      emoji: input.emoji ?? null,
      sort_order: input.sort_order ?? 0,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as FolderRow;
}

export async function updateFolder(
  userId: string,
  folderId: string,
  patch: { name?: string; emoji?: string | null; sort_order?: number }
): Promise<FolderRow> {
  const { data, error } = await getAdminDb()
    .from("folders")
    .update(patch)
    .eq("id", folderId)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw error;
  return data as FolderRow;
}

export async function deleteAndArrangeCards(
  userId: string,
  folderId: string,
  cardsTo: "none" | "archive",
  archiveTtlDays = 0
): Promise<void> {
  const db = getAdminDb();
  const links = await db
    .from("card_folders")
    .select("card_id")
    .eq("folder_id", folderId);
  if (links.error) throw links.error;
  const cardIds = (links.data ?? []).map((r) => r.card_id);

  await db.from("card_folders").delete().eq("folder_id", folderId);
  if (cardsTo === "archive" && cardIds.length > 0) {
    await db
      .from("cards")
      .update({ status: "archived", archived_at: new Date().toISOString() })
      .in("id", cardIds)
      .eq("user_id", userId);
  }
  void archiveTtlDays;
  await db.from("folders").delete().eq("id", folderId).eq("user_id", userId);
}

export async function setCardFolders(
  cardId: string,
  folderIds: string[]
): Promise<void> {
  const db = getAdminDb();
  await db.from("card_folders").delete().eq("card_id", cardId);
  if (folderIds.length > 0) {
    await db
      .from("card_folders")
      .insert(folderIds.map((folder_id) => ({ card_id: cardId, folder_id })));
  }
}

export async function hasAnyCardInFolders(
  userId: string,
  folderIds: string[]
): Promise<boolean> {
  const { data } = await getAdminDb()
    .from("card_folders")
    .select("card_id")
    .in("folder_id", folderIds)
    .limit(1);
  return (data ?? []).length > 0;
}