import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

type MediaItem = {
  type: string;
  fileId?: string;
  imageUrl?: string;
  videoUrl?: string;
  fileName?: string | null;
};

type BookmarkData = {
  userId: string;
  createdAt: string;
  title?: string;
  url: string | null;
  type: string;
  status: string;
  sourceType?: string;
  mediaGroupId?: string;
  swipedCount: number;
  readTimeMin: number;
  domain?: string;
  fileId?: string;
  fileName?: string | null;
  imageUrl?: string;
  videoUrl?: string;
  forwardUrl?: string;
  description?: string;
  deferUntil?: string | null;
  previousStatus?: string | null;
  sourceChatId?: string | null;
  sourceMessageId?: string | null;
  sourceChatUsername?: string | null;
  sourceChatTitle?: string | null;
  sourceUrl?: string | null;
  mediaItems?: MediaItem[];
};

export async function POST(req: NextRequest) {
  let body;
  try {
    body = await req.json();
  } catch (e) {
    return NextResponse.json({ ok: true });
  }

  const message = body.message;
  if (!message || !message.chat?.id) {
    return NextResponse.json({ ok: true });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = message.chat.id;
  const fromId = message.from?.id;

  const reply = async (text: string) => {
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

  if (!fromId) return NextResponse.json({ ok: true });

  try {
    const adminDb = getAdminDb();

    const caption = message.caption || "";
    const text = message.text || "";
    const content = caption || text;
    const urls = extractUrls(content);

    // Создаем "чистый" объект без undefined
    const data: BookmarkData = {
      userId: `tg:${fromId}`,
      createdAt: new Date().toISOString(),
      url: urls[0] || null,
      type: "text",
      status: "new",
      sourceType: "direct",
      swipedCount: 0,
      readTimeMin: 1,
    };

    if (urls.length > 0) {
      data.domain = new URL(urls[0]).hostname;
    }

    let ogTitle: string | undefined;
    let fileName: string | undefined;

    if (message.forward_from || message.forward_origin) {
      data.type = "forward";
      data.sourceType = "forward";
      const source = await parseForwardSource(message);
      if (source) {
        data.sourceChatId = source.chatId;
        data.sourceMessageId = source.messageId;
        data.sourceChatUsername = source.username;
        data.sourceChatTitle = source.title;
        data.sourceUrl = source.url;
        if (source.url) data.forwardUrl = source.url;
      }
    }

    const mediaItem = await buildMediaItem(message, token);
    if (mediaItem) {
      data.fileId = mediaItem.fileId;
      if (mediaItem.imageUrl) data.imageUrl = mediaItem.imageUrl;
      if (mediaItem.videoUrl) data.videoUrl = mediaItem.videoUrl;
      fileName = mediaItem.fileName || undefined;
      if (data.type !== "forward") data.type = mediaItem.type;
    } else if (urls.length > 0) {
      if (data.type !== "forward") data.type = "link";
      const ytThumb = getYouTubeThumbnail(urls[0]);
      if (ytThumb) {
        // YouTube отдаёт боту JS-шелл без OG-тегов, а заставку можно собрать
        // детерминированно по ID видео — это надёжнее парсинга страницы.
        data.imageUrl = ytThumb;
      } else {
        const preview = await fetchLinkPreview(urls[0]);
        if (preview?.imageUrl) data.imageUrl = preview.imageUrl;
        ogTitle = preview?.title;
        if (preview?.description) {
          data.description = preview.description.slice(0, 500);
        }
      }
    }

    data.title = deriveTitle({ caption, text, ogTitle, fileName, type: data.type });

    if (mediaItem && message.media_group_id) {
      data.mediaGroupId = message.media_group_id;
      const docId = `album_${`tg:${fromId}`.replace(/[^\w-]/g, "_")}_${message.media_group_id}`;
      const ref = adminDb.collection("bookmarks").doc(docId);
      let isNew = false;

      await adminDb.runTransaction(async (t) => {
        const snap = await t.get(ref);
        if (snap.exists) {
          const existing = snap.data() as Record<string, unknown>;
          const items = (existing.mediaItems as MediaItem[]) || [];
          items.push(mediaItem);
          const updates: Record<string, unknown> = { mediaItems: items };
          if (caption && !existing.caption) {
            updates.caption = caption;
            updates.title = deriveTitle({
              caption,
              text,
              ogTitle,
              fileName,
              type: typeof existing.type === "string" ? existing.type : "photo",
            });
          }
          t.update(ref, updates);
          return;
        }
        isNew = true;
        data.mediaItems = [mediaItem];
        t.set(ref, data);
      });

      if (isNew) {
        await reply(`✅ Сохранено: ${data.title.slice(0, 30)}...`);
      }
      return NextResponse.json({ ok: true });
    }

    await adminDb.collection("bookmarks").add(data);
    await reply(`✅ Сохранено: ${data.title.slice(0, 30)}...`);
  } catch (e) {
    console.error("Webhook logic error:", e);
    await reply("❌ Ошибка сохранения, попробуй еще раз.");
  }
  
  return NextResponse.json({ ok: true });
}

async function resolveFileUrl(
  fileId: string | undefined,
  token: string | undefined
): Promise<string | null> {
  if (!fileId || !token) return null;
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`
    );
    const json = await res.json();
    if (!json.ok || !json.result?.file_path) return null;
    return `/api/file?path=${encodeURIComponent(json.result.file_path)}`;
  } catch (e) {
    console.error("getFile error:", e);
    return null;
  }
}

async function fetchLinkPreview(
  url: string
): Promise<{ imageUrl?: string; title?: string; description?: string } | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; SwipeMarkBot/1.0; +https://t.me/SwipeMarkBot)",
        Accept: "text/html",
      },
    });
    clearTimeout(timeout);

    const contentType = res.headers.get("content-type") || "";
    if (!/text\/html|application\/xhtml/.test(contentType)) return null;

    const html = (await res.text()).slice(0, 500_000);
    const base = res.url || url;

    const image = extractMeta(html, ["og:image", "twitter:image", "image_src"]);
    const title = extractMeta(html, ["og:title", "twitter:title"]);
    const description = extractMeta(html, [
      "og:description",
      "twitter:description",
    ]);

    const result: { imageUrl?: string; title?: string; description?: string } = {};
    if (image) result.imageUrl = resolveUrl(image, base);
    if (title) result.title = decodeEntities(title);
    if (description) result.description = decodeEntities(description);
    return Object.keys(result).length > 0 ? result : null;
  } catch (e) {
    console.error("Link preview error:", e);
    return null;
  }
}

function extractMeta(html: string, keys: string[]): string | undefined {
  const tags = html.match(/<meta[^>]*>/gi) || [];
  for (const tag of tags) {
    const key = tag.match(/(?:property|name)=["']([^"']+)["']/i)?.[1];
    if (key && keys.includes(key)) {
      const content = tag.match(/content=["'](.*?)["']/i)?.[1];
      if (content) return decodeEntities(content.trim());
    }
  }
  const links = html.match(/<link[^>]*>/gi) || [];
  for (const tag of links) {
    if (/rel=["']image_src["']/i.test(tag)) {
      const href = tag.match(/href=["'](.*?)["']/i)?.[1];
      if (href) return decodeEntities(href.trim());
    }
  }
  return undefined;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function resolveUrl(src: string, base: string): string {
  try {
    return new URL(src, base).href;
  } catch (e) {
    return "";
  }
}

type ForwardChat = {
  id?: number;
  type?: string;
  title?: string;
  username?: string;
};

type ForwardOrigin = {
  type?: string;
  message_id?: number;
  chat?: ForwardChat;
  sender_chat?: ForwardChat;
  sender_user?: { id?: number; username?: string; first_name?: string };
  sender_user_name?: string;
};

type ForwardSource = {
  chatId: string | null;
  messageId: string | null;
  username: string | null;
  title: string | null;
  url: string | null;
};

function buildForwardUrl(
  chat: ForwardChat | undefined,
  messageId: number | null
): string | null {
  if (!messageId || !chat) return null;
  if (chat.username) {
    return `https://t.me/${chat.username}/${messageId}`;
  }
  if (chat.id && (chat.type === "channel" || chat.type === "supergroup")) {
    const id = String(chat.id).replace(/^-?100/, "");
    return `https://t.me/c/${id}/${messageId}`;
  }
  return null;
}

async function parseForwardSource(
  message: {
    forward_origin?: ForwardOrigin;
    forward_from_message_id?: number;
    forward_from_chat?: ForwardChat;
  }
): Promise<ForwardSource | null> {
  const origin = message.forward_origin;
  if (!origin && !message.forward_from_chat) return null;

  const type = origin?.type;
  const messageId = origin?.message_id ?? message.forward_from_message_id ?? null;
  const chat =
    type === "channel"
      ? origin?.chat
      : type === "chat"
      ? origin?.sender_chat
      : message.forward_from_chat;

  return {
    chatId:
      chat?.id != null
        ? String(chat.id)
        : origin?.sender_user?.id != null
        ? String(origin.sender_user.id)
        : null,
    messageId: messageId != null ? String(messageId) : null,
    username:
      chat?.username ?? origin?.sender_user?.username ?? null,
    title:
      chat?.title ??
      origin?.sender_user?.first_name ??
      origin?.sender_user_name ??
      null,
    url: buildForwardUrl(chat, messageId),
  };
}

type PhotoSize = { file_id: string };
type VideoLike = {
  file_id: string;
  file_name?: string;
  thumb?: { file_id?: string };
};
type DocumentLike = {
  file_id: string;
  file_name?: string;
  thumb?: { file_id?: string };
};

type TelegramMessage = {
  photo?: PhotoSize[];
  video?: VideoLike;
  animation?: VideoLike;
  document?: DocumentLike;
};

async function buildMediaItem(
  message: TelegramMessage,
  token: string | undefined
): Promise<MediaItem | null> {
  if (message.photo) {
    const fileId = message.photo[message.photo.length - 1].file_id;
    const imageUrl = await resolveFileUrl(fileId, token);
    if (!imageUrl) return null;
    return { type: "photo", fileId, imageUrl };
  }
  const video = message.video;
  const animation = message.animation;
  if (video || animation) {
    const media: VideoLike = (video || animation)!;
    const fileId = media.file_id;
    const [fileUrl, thumbUrl] = await Promise.all([
      resolveFileUrl(fileId, token),
      resolveFileUrl(media.thumb?.file_id, token),
    ]);
    const item: MediaItem = {
      type: message.video ? "video" : "animation",
      fileId,
    };
    if (message.video && fileUrl) item.videoUrl = fileUrl;
    if (thumbUrl) item.imageUrl = thumbUrl;
    if (message.animation?.file_name) item.fileName = message.animation.file_name;
    return item;
  }
  if (message.document) {
    const fileId = message.document.file_id;
    const thumbUrl = await resolveFileUrl(
      message.document.thumb?.file_id,
      token
    );
    const item: MediaItem = {
      type: "document",
      fileId,
      fileName: message.document.file_name || null,
    };
    if (thumbUrl) item.imageUrl = thumbUrl;
    return item;
  }
  return null;
}

const TITLE_MAX_LENGTH = 120;

function deriveTitle(opts: {
  caption: string;
  text: string;
  ogTitle?: string;
  fileName?: string;
  type: string;
}): string {
  const content = opts.caption || opts.text;
  const firstLine = content.split(/\r?\n/)[0]?.trim() || "";
  const isOnlyUrl = /^https?:\/\/\S+$/.test(firstLine);
  if (firstLine && !isOnlyUrl) {
    return firstLine.slice(0, TITLE_MAX_LENGTH);
  }

  if (opts.ogTitle) return opts.ogTitle.slice(0, TITLE_MAX_LENGTH);
  if (opts.fileName) return opts.fileName.slice(0, TITLE_MAX_LENGTH);

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
    case "forward":
      return "Сохранённое сообщение";
    default:
      return "Сохранённое сообщение";
  }
}

function extractUrls(text: string): string[] {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.match(urlRegex) || [];
}

function getYouTubeThumbnail(url: string): string | null {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) return null;
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/maxresdefault.jpg`;
}

function extractYouTubeVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
    if (host === "youtu.be") {
      const id = u.pathname.split("/")[1] || "";
      return id || null;
    }
    if (host !== "youtube.com" && host !== "youtube-nocookie.com") return null;
    if (u.pathname === "/watch" || u.pathname.startsWith("/watch/")) {
      return u.searchParams.get("v");
    }
    for (const prefix of ["/shorts/", "/embed/", "/live/", "/v/"]) {
      if (u.pathname.startsWith(prefix)) {
        const id = u.pathname.slice(prefix.length).split("/")[0] || "";
        return id || null;
      }
    }
    return null;
  } catch (e) {
    return null;
  }
}
