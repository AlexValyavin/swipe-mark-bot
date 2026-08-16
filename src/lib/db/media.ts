import { getAdminDb } from "@/lib/db/supabase";
import type { AttachmentRow } from "@/lib/db/types";
import { setCardMetaStatus } from "@/lib/db/meta";

export const MEDIA_BUCKET = "swipemark-media";
const MAX_MEDIA_BYTES = 8 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 10_000;

let bucketReady: boolean | null = null;

/** Идемпотентно создаёт публичный бакет для кэша медиа. */
export async function ensureMediaBucket(): Promise<void> {
  if (bucketReady) return;
  const db = getAdminDb();
  const { error: getErr } = await db.storage.getBucket(MEDIA_BUCKET);
  if (!getErr) {
    bucketReady = true;
    return;
  }
  const { error } = await db.storage.createBucket(MEDIA_BUCKET, { public: true });
  if (error && !String(error.message).toLowerCase().includes("already exists")) {
    throw error;
  }
  bucketReady = true;
}

async function downloadTelegramFile(fileId: string): Promise<Buffer | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  try {
    const getFileRes = await fetch(
      `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`,
      { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) }
    );
    const meta = (await getFileRes.json()) as {
      ok?: boolean;
      result?: { file_path?: string; file_size?: number };
    };
    if (!meta.ok || !meta.result?.file_path) return null;
    if (meta.result.file_size && meta.result.file_size > MAX_MEDIA_BYTES) return null;

    const res = await fetch(
      `https://api.telegram.org/file/bot${token}/${meta.result.file_path}`,
      { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) }
    );
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_MEDIA_BYTES) return null;
    return buf;
  } catch {
    return null;
  }
}

/**
 * Кэширует фото/превью из Telegram в Supabase Storage.
 * - photo → загружаем само фото
 * - video/animation/document → загружаем thumbnail (тело никогда не проксируем)
 * Возвращает публичный URL или null при сбое.
 */
export async function cacheAttachmentMedia(
  userId: string,
  attachment: AttachmentRow
): Promise<string | null> {
  await ensureMediaBucket();

  const isPhoto = attachment.type === "photo";
  const sourceFileId = isPhoto
    ? attachment.telegram_file_id
    : attachment.thumbnail_file_id;
  if (!sourceFileId) return null;

  const buf = await downloadTelegramFile(sourceFileId);
  if (!buf) return null;

  const path = `u/${userId}/${attachment.id}.jpg`;
  const db = getAdminDb();
  const { error } = await db.storage.from(MEDIA_BUCKET).upload(path, buf, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (error) return null;

  const publicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/${MEDIA_BUCKET}/${path}`;
  await db.from("attachments").update({ storage_url: publicUrl }).eq("id", attachment.id);
  return publicUrl;
}

/**
 * Фоновый кэш медиа карточки. Никогда не роняет карточку.
 * - фото/превью → storage_url
 * - мета-статус: done при полном кэше, failed при полном сбое (ошибка кратко)
 */
export async function cacheCardMedia(userId: string, cardId: string): Promise<void> {
  try {
    const db = getAdminDb();
    const { data } = await db
      .from("attachments")
      .select("*")
      .eq("card_id", cardId);
    const attachments = (data ?? []) as AttachmentRow[];
    if (attachments.length === 0) return;

    let cached = 0;
    for (const att of attachments) {
      const url = await cacheAttachmentMedia(userId, att);
      if (url) cached++;
    }

    if (cached === attachments.length) {
      await setCardMetaStatus(cardId, "done");
    } else if (cached === 0) {
      await setCardMetaStatus(cardId, "failed", "network");
    }
  } catch (e) {
    console.error(`Media cache error for card ${cardId}:`, e);
  }
}