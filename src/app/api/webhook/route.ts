import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import {
  appendAttachment,
  createCard,
  findCardIdByMediaGroup,
  updateCard,
  type AttachmentInput,
} from "@/lib/db/cards";
import { getOrCreateProfileByTelegramId } from "@/lib/db/profiles";

export const runtime = "nodejs";

type TelegramMessage = {
  chat?: { id?: number };
  from?: { id?: number };
  photo?: { file_id: string }[];
  video?: {
    file_id: string;
    file_name?: string;
    duration?: number;
    width?: number;
    height?: number;
    mime_type?: string;
    file_size?: number;
    thumb?: { file_id?: string };
  };
  animation?: {
    file_id: string;
    file_name?: string;
    duration?: number;
    width?: number;
    height?: number;
    mime_type?: string;
    file_size?: number;
    thumb?: { file_id?: string };
  };
  document?: {
    file_id: string;
    file_name?: string;
    mime_type?: string;
    file_size?: number;
    thumb?: { file_id?: string };
  };
  caption?: string;
  text?: string;
  media_group_id?: string;
  message_id?: number;
  forward_origin?: {
    message_id?: number;
    chat?: { id?: number; username?: string; title?: string; type?: string };
    sender_chat?: { id?: number; username?: string; title?: string };
  };
  forward_from_chat?: { id?: number; username?: string; title?: string };
  forward_from_message_id?: number;
};

export async function POST(req: NextRequest) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const message = body.message as TelegramMessage | undefined;
  if (!message || !message.chat?.id) {
    return NextResponse.json({ ok: true });
  }

  const fromId = message.from?.id;
  if (!fromId) return NextResponse.json({ ok: true });

  const chatId = message.chat.id;

  const reply = async (text: string) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return;
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }),
      });
    } catch (e) {
      console.error("Reply error:", e);
    }
  };

  try {
    const text0 = (message.text || "").trim();

    // Привязка Telegram-аккаунта: /start <code>
    const startMatch = text0.match(/^\/start(?:\s+([A-Z0-9]{8}))?$/i);
    if (startMatch) {
      await handleStart(fromId, startMatch[1] ?? null, reply);
      return NextResponse.json({ ok: true });
    }

    // Отвязка: /unlink
    if (text0.toLowerCase() === "/unlink") {
      await handleUnlink(fromId, reply);
      return NextResponse.json({ ok: true });
    }

    const profile = await getOrCreateProfileByTelegramId(fromId);
    const userId = profile.id;

    const caption = message.caption || "";
    const text = message.text || "";
    const urls = extractUrls(caption || text);

    let sourceType = "note";
    let primaryType = "note";
    let sourceUrl: string | null = urls[0] || null;
    const titleText = caption || text;

    // forwards
    let sourceChatId: number | null = null;
    let sourceMessageId: number | null = null;
    if (message.forward_origin || message.forward_from_chat) {
      sourceType = "forwarded";
      primaryType = "forwarded";
      const chat =
        message.forward_origin?.chat ??
        message.forward_origin?.sender_chat ??
        message.forward_from_chat;
      const fwdMsgId =
        message.forward_origin?.message_id ?? message.forward_from_message_id ?? null;
      sourceChatId = typeof chat?.id === "number" ? chat.id : null;
      sourceMessageId = typeof fwdMsgId === "number" ? fwdMsgId : null;
      if (chat?.username && fwdMsgId) {
        sourceUrl = `https://t.me/${chat.username}/${fwdMsgId}`;
      } else if (chat?.id && fwdMsgId) {
        const id = String(chat.id).replace(/^-?100/, "");
        sourceUrl = `https://t.me/c/${id}/${fwdMsgId}`;
      }
    }

    const attachment = buildAttachment(message);

    if (attachment) {
      if (attachment.type === "photo") {
        sourceType = "photo";
        primaryType = "photo";
      } else if (attachment.type === "video" || attachment.type === "animation") {
        sourceType = message.video ? "video" : "photo";
        primaryType = message.video ? "video" : "animation";
      } else {
        sourceType = "note";
        primaryType = "document";
      }
    } else if (urls.length > 0) {
      sourceType = "link";
      primaryType = "link";
    }

    const title = deriveTitle({ caption, text, type: primaryType });
    const mediaGroupId = message.media_group_id || null;

    // Альбом: находим существующую карточку по media_group_id и дописываем вложение.
    if (mediaGroupId && attachment) {
      const existingId = await findCardIdByMediaGroup(userId, mediaGroupId);
      if (existingId) {
        await appendAttachment(existingId, attachment);
        if (caption) {
          const existing = await getCardForUpdate(existingId);
          if (existing && !existing.title) {
            await updateCard(existingId, { title, text: caption });
          } else if (existing && existing.text !== caption) {
            await updateCard(existingId, {
              title: existing.title || title,
              text: caption,
            });
          }
        }
        await reply(`Сохранено ✅ (#${existingId})`);
        return NextResponse.json({ ok: true });
      }
      const albumCardId = await createCard(
        userId,
        {
          source_type: "photo",
          primary_type: primaryType,
          source_url: sourceUrl,
          source_chat_id: sourceChatId,
          source_message_id: sourceMessageId,
          domain: urls.length > 0 ? domainOf(urls[0]) : null,
          telegram_message_id: message.message_id ?? null,
          media_group_id: mediaGroupId,
          title,
          text: caption || null,
        },
        [attachment]
      );
      kickEnrich(userId, albumCardId);
      await reply(`Сохранено ✅ (#${albumCardId})`);
      return NextResponse.json({ ok: true });
    }

    const links = urls.length > 0
      ? [{ url: urls[0] }]
      : [];

    const cardId = await createCard(
      userId,
      {
        source_type: sourceType,
        primary_type: primaryType,
        source_url: sourceUrl,
        source_chat_id: sourceChatId,
        source_message_id: sourceMessageId,
        domain: urls.length > 0 ? domainOf(urls[0]) : null,
        telegram_message_id: message.message_id ?? null,
        title,
        text: titleText || null,
      },
      attachment ? [attachment] : [],
      links
    );
    if (cardId) {
      kickEnrich(userId, cardId);
      await reply(`Сохранено ✅ (#${cardId})`);
    }
  } catch (e) {
    console.error("Webhook logic error:", e);
    await reply("❌ Ошибка сохранения, попробуй еще раз.");
  }

  return NextResponse.json({ ok: true });
}

function buildAttachment(message: TelegramMessage): AttachmentInput | null {
  if (message.photo) {
    const photo = message.photo[message.photo.length - 1];
    return { type: "photo", telegram_file_id: photo.file_id };
  }
  const video = message.video;
  if (video) {
    return {
      type: "video",
      telegram_file_id: video.file_id,
      thumbnail_file_id: video.thumb?.file_id ?? null,
      file_name: video.file_name ?? null,
      mime_type: video.mime_type ?? null,
      file_size: video.file_size ?? null,
      duration: video.duration ?? null,
      width: video.width ?? null,
      height: video.height ?? null,
    };
  }
  const animation = message.animation;
  if (animation) {
    return {
      type: "animation",
      telegram_file_id: animation.file_id,
      thumbnail_file_id: animation.thumb?.file_id ?? null,
      file_name: animation.file_name ?? null,
      mime_type: animation.mime_type ?? null,
      file_size: animation.file_size ?? null,
      duration: animation.duration ?? null,
      width: animation.width ?? null,
      height: animation.height ?? null,
    };
  }
  const document = message.document;
  if (document) {
    return {
      type: "document",
      telegram_file_id: document.file_id,
      thumbnail_file_id: document.thumb?.file_id ?? null,
      file_name: document.file_name ?? null,
      mime_type: document.mime_type ?? null,
      file_size: document.file_size ?? null,
    };
  }
  return null;
}

async function getCardForUpdate(cardId: string): Promise<{
  title: string | null;
  text: string | null;
} | null> {
  const { getAdminDb } = await import("@/lib/db/supabase");
  const { data } = await getAdminDb()
    .from("cards")
    .select("title, text")
    .eq("id", cardId)
    .maybeSingle();
  return (data as { title: string | null; text: string | null } | null) ?? null;
}

const TITLE_MAX_LENGTH = 120;

function deriveTitle(opts: { caption: string; text: string; type: string }): string {
  const content = opts.caption || opts.text;
  const firstLine = content.split(/\r?\n/)[0]?.trim() || "";
  const isOnlyUrl = /^https?:\/\/\S+$/.test(firstLine);
  if (firstLine && !isOnlyUrl) {
    return firstLine.slice(0, TITLE_MAX_LENGTH);
  }

  switch (opts.type) {
    case "photo":
      return "Фото";
    case "video":
    case "animation":
      return "Видео";
    case "document":
      return "Документ";
    case "link":
      return "Ссылка";
    case "forwarded":
      return "Сохранённое сообщение";
    default:
      return "Сохранённое сообщение";
  }
}

function extractUrls(text: string): string[] {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.match(urlRegex) || [];
}

function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Запускает AI-обогащение в фоне (после ответа Telegram).
 * Любые ошибки глотаем — карточка и так сохранена.
 */
function kickEnrich(userId: string, cardId: string): void {
  after(async () => {
    try {
      const { enrichCard } = await import("@/lib/ai/enrich");
      const outcome = await enrichCard(userId, cardId);
      if (outcome.status === "failed") {
        console.warn(`AI enrich failed for card ${cardId}: ${outcome.reason}`);
      }
    } catch (e) {
      console.error(`AI enrich error for card ${cardId}:`, e);
    }
  });
}

/**
 * Обрабатывает /start <code> — привязка Telegram-аккаунта к профилю SwipeMark.
 * Все проверки с дружелюбными ответами; ничего не падает в 500.
 */
async function handleStart(
  fromId: number,
  code: string | null,
  reply: (text: string) => Promise<void>
): Promise<void> {
  const { consumePairingCode, markCodeUsed, linkTelegram } = await import(
    "@/lib/db/pairing"
  );
  const { getOrCreateProfileByTelegramId } = await import(
    "@/lib/db/profiles"
  );

  if (!code) {
    await reply("Привет! Отправь код из приложения SwipeMark, например: /start ABCDEFGH");
    return;
  }

  const userId = await consumePairingCode(code);
  if (!userId) {
    await reply("❌ Код недействителен или истёк. Попробуй сгенерировать новый в приложении.");
    return;
  }

  const profile = await getOrCreateProfileByTelegramId(fromId);
  if (profile.telegram_id !== null) {
    await reply("ℹ️ Твой Telegram уже привязан к аккаунту SwipeMark. Для смены — сначала отвяжи в приложении.");
    return;
  }

  try {
    await linkTelegram(userId, fromId);
    await markCodeUsed(code);
    await reply("Готово ✅ Telegram привязан к твоему аккаунту SwipeMark!");
  } catch (e) {
    if ((e as { code?: string }).code === "23505") {
      await reply("❌ Этот Telegram уже привязан к другому аккаунту. Сначала отвяжи его там.");
    } else {
      console.error("Pairing /start error:", e);
      await reply("❌ Не удалось привязать аккаунт. Попробуй ещё раз.");
    }
  }
}

/**
 * Обрабатывает /unlink — отвязывает Telegram от текущего профиля.
 */
async function handleUnlink(
  fromId: number,
  reply: (text: string) => Promise<void>
): Promise<void> {
  const { unlinkTelegram } = await import("@/lib/db/pairing");
  const { getProfileByTelegramId } = await import("@/lib/db/profiles");

  const profile = await getProfileByTelegramId(fromId);
  if (!profile || profile.telegram_id === null) {
    await reply("ℹ️ Твой Telegram не привязан к SwipeMark.");
    return;
  }

  await unlinkTelegram(profile.id);
  await reply("Готово ✅ Отвязал Telegram от SwipeMark.");
}