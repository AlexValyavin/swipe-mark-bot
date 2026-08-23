import { getAdminDb } from "@/lib/db/supabase";
import { embed, EMBEDDING_DIMENSIONS, AiError } from "@/lib/ai/adapter";
import type { CardRow, AttachmentRow, CardLinkRow } from "@/lib/db/types";

/** Максимальная длина текста для эмбеддинга (символы). */
const MAX_TEXT = 8000;

/**
 * Собирает семантический текст карточки: title + text + og_title/description.
 * Возвращает null если содержимого нет (фото без подписи — нечего искать).
 */
async function buildCardText(card: CardRow): Promise<string | null> {
  const db = getAdminDb();
  const [attRes, linkRes] = await Promise.all([
    db.from("attachments").select("file_name").eq("card_id", card.id),
    db.from("card_links").select("og_title, og_description").eq("card_id", card.id).order("created_at", { ascending: true }),
  ]);

  const parts: string[] = [];
  if (card.title) parts.push(card.title);
  if (card.text) parts.push(card.text);
  for (const l of (linkRes.data ?? []) as CardLinkRow[]) {
    if (l.og_title) parts.push(l.og_title);
    if (l.og_description) parts.push(l.og_description);
  }
  // имена файлов документов могут нести смысл ("договор_2026.pdf")
  for (const a of (attRes.data ?? []) as AttachmentRow[]) {
    if (a.file_name) parts.push(a.file_name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " "));
  }

  const text = parts.join("\n").replace(/\s+/g, " ").trim();
  if (!text || text.length < 3) return null;
  return text.slice(0, MAX_TEXT);
}

/**
 * Считает embedding карточки и пишет в cards.embedding.
 * Идемпотентно: пропускает, если уже есть вектор (принудительно — через backfill-скрипт).
 * Никогда не бросает наверх — ошибки логируются (эмбеддинг не критичен).
 */
export async function embedCard(userId: string, cardId: string, force = false): Promise<boolean> {
  try {
    const db = getAdminDb();
    const { data: card } = await db
      .from("cards")
      .select("id, user_id, title, text, embedding")
      .eq("id", cardId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!card) return false;
    if (!force && card.embedding) return true; // уже проиндексировано

    const text = await buildCardText(card as CardRow);
    if (!text) {
      // нечего эмбеддить (фото без подписи) — помечаем нулевым маркером не будем,
      // просто оставляем NULL, поиск FTS всё равно найдёт по title
      return false;
    }

    const vector = await embed(text);
    if (vector.length !== EMBEDDING_DIMENSIONS) {
      console.error(`Embedding dims mismatch: got ${vector.length}, expected ${EMBEDDING_DIMENSIONS}`);
      return false;
    }

    const { error } = await db
      .from("cards")
      .update({ embedding: `[${vector.join(",")}]` })
      .eq("id", cardId)
      .eq("user_id", userId);
    if (error) throw error;
    return true;
  } catch (e) {
    if (e instanceof AiError && e.kind === "auth") {
      // ключ не настроен — молча пропускаем (эмбеддинги опциональны)
      return false;
    }
    console.error(`Embedding failed for card ${cardId}:`, e);
    return false;
  }
}
