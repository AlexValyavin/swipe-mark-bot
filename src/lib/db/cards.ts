import { getAdminDb } from "@/lib/db/supabase";
import type { AttachmentRow, CardLinkRow, CardRow } from "@/lib/db/types";
import type { PostgrestError } from "@supabase/supabase-js";
import { cardToBookmark, type Bookmark } from "@/lib/db/mappers";

export type CardInput = {
  source_type: string;
  primary_type: string;
  source_url?: string | null;
  canonical_url?: string | null;
  domain?: string | null;
  source_chat_id?: number | null;
  source_message_id?: number | null;
  telegram_message_id?: number | null;
  media_group_id?: string | null;
  title?: string | null;
  text?: string | null;
  image_url?: string | null;
  duration_seconds?: number | null;
  estimated_minutes?: number | null;
  status?: string;
  defer_until?: string | null;
};

export type AttachmentInput = {
  type: string;
  telegram_file_id?: string | null;
  thumbnail_file_id?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
  file_size?: number | null;
  duration?: number | null;
  width?: number | null;
  height?: number | null;
};

export type CardLinkInput = {
  url: string;
  og_title?: string | null;
  og_description?: string | null;
  og_image_url?: string | null;
};

async function loadBookmark(card: CardRow): Promise<Bookmark> {
  const [attRes, linkRes] = await Promise.all([
    getAdminDb()
      .from("attachments")
      .select("*")
      .eq("card_id", card.id)
      .order("created_at", { ascending: true }),
    getAdminDb()
      .from("card_links")
      .select("*")
      .eq("card_id", card.id)
      .order("created_at", { ascending: true }),
  ]);
  return cardToBookmark(card, (attRes.data ?? []) as AttachmentRow[], (linkRes.data ?? []) as CardLinkRow[]);
}

function assertNoError(error: PostgrestError | null): void {
  if (error) throw new Error(error.message);
}

export async function listForUser(userId: string): Promise<Bookmark[]> {
  const db = getAdminDb();
  const { data: cards, error } = await db
    .from("cards")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  assertNoError(error);
  if (!cards) return [];

  const cardsList = cards as CardRow[];
  const cardIds = cardsList.map((c) => c.id);
  const [attRes, linkRes] = await Promise.all([
    db.from("attachments").select("*").in("card_id", cardIds),
    db.from("card_links").select("*").in("card_id", cardIds),
  ]);
  assertNoError(attRes.error);
  assertNoError(linkRes.error);

  const atts = new Map<string, AttachmentRow[]>();
  for (const a of (attRes.data ?? []) as AttachmentRow[]) {
    const list = atts.get(a.card_id) ?? [];
    list.push(a);
    atts.set(a.card_id, list);
  }
  const links = new Map<string, CardLinkRow[]>();
  for (const l of (linkRes.data ?? []) as CardLinkRow[]) {
    const list = links.get(l.card_id) ?? [];
    list.push(l);
    links.set(l.card_id, list);
  }

  return cardsList.map((c) =>
    cardToBookmark(c, atts.get(c.id) ?? [], links.get(c.id) ?? [])
  );
}

export async function getForUser(
  userId: string,
  cardId: string
): Promise<Bookmark | null> {
  const db = getAdminDb();
  const { data: card, error } = await db
    .from("cards")
    .select("*")
    .eq("id", cardId)
    .eq("user_id", userId)
    .maybeSingle();
  assertNoError(error);
  if (!card) return null;
  return loadBookmark(card as CardRow);
}

export async function findCardIdByMediaGroup(
  userId: string,
  mediaGroupId: string
): Promise<string | null> {
  const { data, error } = await getAdminDb()
    .from("cards")
    .select("id")
    .eq("user_id", userId)
    .eq("media_group_id", mediaGroupId)
    .maybeSingle();
  assertNoError(error);
  return data?.id ?? null;
}

export async function createCard(
  userId: string,
  input: CardInput,
  attachments: AttachmentInput[] = [],
  links: CardLinkInput[] = []
): Promise<string> {
  const db = getAdminDb();
  const { data, error } = await db
    .from("cards")
    .insert({
      user_id: userId,
      source_type: input.source_type,
      primary_type: input.primary_type,
      source_url: input.source_url ?? null,
      canonical_url: input.canonical_url ?? null,
      domain: input.domain ?? null,
      source_chat_id: input.source_chat_id ?? null,
      source_message_id: input.source_message_id ?? null,
      telegram_message_id: input.telegram_message_id ?? null,
      media_group_id: input.media_group_id ?? null,
      title: input.title ?? null,
      text: input.text ?? null,
      image_url: input.image_url ?? null,
      duration_seconds: input.duration_seconds ?? null,
      estimated_minutes: input.estimated_minutes ?? null,
      status: input.status ?? "new",
      defer_until: input.defer_until ?? null,
    })
    .select("id")
    .single();
  assertNoError(error);
  const cardId = (data as { id: string }).id;

  if (attachments.length > 0) {
    const { error: attErr } = await db.from("attachments").insert(
      attachments.map((a) => ({
        card_id: cardId,
        type: a.type,
        telegram_file_id: a.telegram_file_id ?? null,
        thumbnail_file_id: a.thumbnail_file_id ?? null,
        file_name: a.file_name ?? null,
        mime_type: a.mime_type ?? null,
        file_size: a.file_size ?? null,
        duration: a.duration ?? null,
        width: a.width ?? null,
        height: a.height ?? null,
      }))
    );
    assertNoError(attErr);
  }

  if (links.length > 0) {
    const { error: linkErr } = await db.from("card_links").insert(
      links.map((l) => ({
        card_id: cardId,
        url: l.url,
        og_title: l.og_title ?? null,
        og_description: l.og_description ?? null,
        og_image_url: l.og_image_url ?? null,
      }))
    );
    assertNoError(linkErr);
  }

  return cardId;
}

export async function appendAttachment(
  cardId: string,
  attachment: AttachmentInput
): Promise<void> {
  const { error } = await getAdminDb().from("attachments").insert({
    card_id: cardId,
    type: attachment.type,
    telegram_file_id: attachment.telegram_file_id ?? null,
    thumbnail_file_id: attachment.thumbnail_file_id ?? null,
    file_name: attachment.file_name ?? null,
    mime_type: attachment.mime_type ?? null,
    file_size: attachment.file_size ?? null,
    duration: attachment.duration ?? null,
    width: attachment.width ?? null,
    height: attachment.height ?? null,
  });
  assertNoError(error);
}

export async function updateCard(
  cardId: string,
  patch: Partial<CardRow>
): Promise<void> {
  const { error } = await getAdminDb()
    .from("cards")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", cardId);
  assertNoError(error);
}

export async function deleteArchivedForUser(userId: string): Promise<number> {
  const { data, error } = await getAdminDb()
    .from("cards")
    .delete()
    .eq("user_id", userId)
    .eq("status", "archived")
    .select("id");
  assertNoError(error);
  return (data ?? []).length;
}

export async function deleteOldArchivedForUser(
  userId: string,
  cutoff: Date
): Promise<number> {
  const { data, error } = await getAdminDb()
    .from("cards")
    .delete()
    .eq("user_id", userId)
    .eq("status", "archived")
    .lt("created_at", cutoff.toISOString())
    .select("id");
  assertNoError(error);
  return (data ?? []).length;
}