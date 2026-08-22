import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import {
  appendAttachment,
  countCardsForUser,
  createCard,
  findCardIdByMediaGroup,
  getCountsForUser,
  updateCard,
  type AttachmentInput,
} from "@/lib/db/cards";
import { getOrCreateProfileByTelegramId } from "@/lib/db/profiles";
import { track } from "@/lib/analytics";

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

  type InlineButton = { text: string; url?: string; callback_data?: string };

  const sendMessage = async (
    toChatId: number,
    text: string,
    buttons?: InlineButton[][]
  ) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return;
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: toChatId,
          text,
          ...(buttons && buttons.length > 0
            ? { reply_markup: { inline_keyboard: buttons } }
            : {}),
        }),
      });
    } catch (e) {
      console.error("Reply error:", e);
    }
  };

  // Кнопки стартового меню (callback).
  const callbackQuery = body.callback_query as
    | {
        id?: string;
        data?: string;
        message?: { chat?: { id?: number } };
      }
    | undefined;
  if (callbackQuery?.id && callbackQuery.data) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (token) {
      void fetch(
        `https://api.telegram.org/bot${token}/answerCallbackQuery`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            callback_query_id: callbackQuery.id,
          }),
        }
      ).catch(() => {});
    }
    const cbChatId = callbackQuery.message?.chat?.id;
    if (cbChatId) {
      if (callbackQuery.data === "how") {
        await sendMessage(cbChatId, HOW_TO_TEXT);
      } else if (callbackQuery.data === "help") {
        await sendMessage(cbChatId, HELP_TEXT);
      }
    }
    return NextResponse.json({ ok: true });
  }

  const message = body.message as TelegramMessage | undefined;
  if (!message || !message.chat?.id) {
    return NextResponse.json({ ok: true });
  }

  const fromId = message.from?.id;
  if (!fromId) return NextResponse.json({ ok: true });

  const chatId = message.chat.id;

  const reply = (text: string, buttons?: InlineButton[][]) =>
    sendMessage(chatId, text, buttons);

  try {
    const text0 = (message.text || "").trim();

    // Админ-вход по QR: /start admin_<CODE> — обрабатываем до обычной привязки
    const startMatch = text0.match(/^\/start(?:\s+(\S+))?$/i);
    if (startMatch) {
      const rawCode = startMatch[1] ?? null;
      if (rawCode && rawCode.startsWith("admin_")) {
        await handleAdminLogin(fromId, rawCode, reply);
        return NextResponse.json({ ok: true });
      }
      const code = rawCode && /^[A-Z0-9]{8}$/i.test(rawCode) ? rawCode : null;
      // если код есть но формат неверный — покажем welcome как для пустого
      if (rawCode && !code && !rawCode.startsWith("admin_")) {
        await handleStart(fromId, null, reply);
        return NextResponse.json({ ok: true });
      }
      await handleStart(fromId, code, reply);
      return NextResponse.json({ ok: true });
    }

    // Открыть SwipeMark
    if (text0.toLowerCase() === "/open") {
      await reply("Открываем SwipeMark ⚡", [
        [{ text: "⚡ Открыть SwipeMark", url: APP_URL }],
      ]);
      return NextResponse.json({ ok: true });
    }

    // Справка
    if (text0.toLowerCase() === "/help") {
      await reply(HELP_TEXT);
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
        kickMediaCache(userId, existingId);
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
        await sendSavedReply(userId, reply);
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
      kickMediaCache(userId, albumCardId);
      await trackCapture(userId, primaryType, "telegram_bot");
      await sendSavedReply(userId, reply);
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
      kickMediaCache(userId, cardId);
      if (links.length > 0) kickMetaEnrich(userId, cardId);
      await trackCapture(userId, primaryType, "telegram_bot");
      await sendSavedReply(userId, reply);
    }
  } catch (e) {
    console.error("Webhook logic error:", e);
    await reply("❌ Ошибка сохранения, попробуй еще раз.");
  }

  return NextResponse.json({ ok: true });
}

/**
 * Аналитика захвата: item_received + first_capture (первая карточка пользователя).
 * Fire-and-forget, никогда не роняет webhook.
 */
async function trackCapture(userId: string, contentType: string, source: string): Promise<void> {
  const hadCards = (await countCardsForUser(userId)) > 1;
  void track("item_received", userId, { source, content_type: contentType });
  if (!hadCards) {
    void track("first_capture", userId, { source, content_type: contentType });
  }
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
    case "link": {
      const host = domainOf(opts.text);
      return host ?? "Ссылка";
    }
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

const BOT_USERNAME = process.env.BOT_USERNAME || "SwipeMarkBot";
const APP_URL = `https://t.me/${BOT_USERNAME}/app`;

const START_TEXT = [
  "Привет, я SwipeMark ⚡",
  "",
  "Отправляй мне ссылки, видео, посты или сообщения из Telegram.",
  "Я сохраню их, а потом ты разберёшь всё свайпами в одном месте.",
].join("\n");

const HOW_TO_TEXT = [
  "Просто перешли мне сообщение или отправь ссылку.",
  "",
  "Подойдут:",
  "• статьи и сайты;",
  "• YouTube-видео;",
  "• посты из Telegram;",
  "• Instagram и TikTok;",
  "• фото, документы и обычные сообщения.",
  "",
  "Когда захочешь разобрать сохранёнки — нажми «Открыть SwipeMark».",
].join("\n");

const HELP_TEXT = [
  "Как пользоваться SwipeMark ⚡",
  "",
  "• Отправь сюда ссылку, видео или пост — я сохраню.",
  "• Нажми «Открыть SwipeMark», чтобы разобрать сохранёнки.",
  "• Свайп влево — в архив, вправо — «почитать потом», вверх — открыть.",
  "• AI сам разложит по папкам и проставит теги.",
  "",
  "Команды:",
  "/open — открыть SwipeMark",
  "/help — эта справка",
  "/unlink — отвязать Telegram от аккаунта",
].join("\n");

/** Склонение слова «сохранёнка» после числа (аккузатив для кнопки, номинатив для текста). */
function pluralSave(n: number): string {
  const abs = Math.abs(n) % 100;
  const d = Math.abs(n) % 10;
  if (abs >= 11 && abs <= 14) return "сохранёнок";
  if (d === 1) return "сохранёнку";
  if (d >= 2 && d <= 4) return "сохранёнки";
  return "сохранёнок";
}

function pluralUnsorted(n: number): string {
  const abs = Math.abs(n) % 100;
  const d = Math.abs(n) % 10;
  if (abs >= 11 && abs <= 14) return "неразобранных сохранёнок";
  if (d === 1) return "неразобранная сохранёнка";
  if (d >= 2 && d <= 4) return "неразобранные сохранёнки";
  return "неразобранных сохранёнок";
}

/**
 * Ответ после сохранения: дружелюбный текст с числом неразобранных карточек
 * и кнопкой, которая открывает Mini App сразу в колоде.
 */
async function sendSavedReply(
  userId: string,
  reply: (
    text: string,
    buttons?: { text: string; url?: string; callback_data?: string }[][]
  ) => Promise<void>
): Promise<void> {
  let n: number;
  try {
    const counts = await getCountsForUser(userId);
    n = counts.unsorted;
  } catch (e) {
    console.error("Counts error:", e);
    n = 1;
  }

  if (n < 1) {
    await reply("Сохранил ✅");
    return;
  }

  let text: string;
  if (n === 1) {
    text = "Сохранил ✅\nВ очереди: 1 неразобранная сохранёнка.";
  } else if (n <= 29) {
    text = `Сохранил ✅\nТеперь в очереди ${n} ${pluralUnsorted(n)}.`;
  } else {
    text = `Сохранил ✅\nВ очереди уже ${n} сохранёнок. Самое время разобрать первые 10.`;
  }

  await reply(text, [
    [{ text: `Разобрать ${n} ${pluralSave(n)}`, url: `${APP_URL}?startapp=deck` }],
  ]);
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
 * Фоновый кэш медиа (фото/превью) в Supabase Storage.
 * Никогда не роняет карточку.
 */
function kickMediaCache(userId: string, cardId: string): void {
  after(async () => {
    try {
      const { cacheCardMedia } = await import("@/lib/db/media");
      await cacheCardMedia(userId, cardId);
    } catch (e) {
      console.error(`Media cache error for card ${cardId}:`, e);
    }
  });
}

/**
 * Фоновое извлечение метаданных по ссылкам карточки (parsers + meta_cache).
 * Один авто-ретрай failed через ~60 с.
 */
function kickMetaEnrich(userId: string, cardId: string): void {
  const run = async () => {
    try {
      const { enrichCardMeta } = await import("@/lib/meta/enrich");
      const outcome = await enrichCardMeta(userId, cardId);
      if (outcome.status === "failed") {
        console.warn(`Meta enrich failed for card ${cardId}: ${outcome.reason}; retry in 60s`);
        setTimeout(run, 60_000);
      }
    } catch (e) {
      console.error(`Meta enrich error for card ${cardId}:`, e);
    }
  };
  after(run);
}

/**
 * Обрабатывает /start admin_<CODE> — QR-вход в админку (только для OWNER_TELEGRAM_ID).
 */
async function handleAdminLogin(
  fromId: number,
  code: string,
  reply: (text: string, buttons?: { text: string; url?: string; callback_data?: string }[][]) => Promise<void>
): Promise<void> {
  const ownerTgId = Number(process.env.OWNER_TELEGRAM_ID || 0);
  if (!ownerTgId || fromId !== ownerTgId) {
    await reply("⛔ Этот код только для владельца SwipeMark.");
    return;
  }
  const { consumeAdminLoginCode, markAdminCodeUsed } = await import("@/lib/db/adminLogin");
  const row = await consumeAdminLoginCode(code);
  if (!row) {
    await reply("❌ Код недействителен или истёк. Сгенерируй новый в /admin → Войти по QR.");
    return;
  }
  await markAdminCodeUsed(code, fromId);
  await reply("✅ Админ-вход подтверждён — вернись в браузер, он уже авторизован. Обнови страницу /admin.");
}

/**
 * Обрабатывает /start <code> — привязка Telegram-аккаунта к профилю SwipeMark.
 * Все проверки с дружелюбными ответами; ничего не падает в 500.
 */
async function handleStart(
  fromId: number,
  code: string | null,
  reply: (
    text: string,
    buttons?: { text: string; url?: string; callback_data?: string }[][]
  ) => Promise<void>
): Promise<void> {
  const { consumePairingCode, markCodeUsed, linkTelegram } = await import(
    "@/lib/db/pairing"
  );
  const { getOrCreateProfileByTelegramId } = await import(
    "@/lib/db/profiles"
  );

  if (!code) {
    await reply(START_TEXT, [
      [{ text: "⚡ Открыть SwipeMark", url: APP_URL }],
      [
        { text: "📥 Как сохранять", callback_data: "how" },
        { text: "❓ Помощь", callback_data: "help" },
      ],
    ]);
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