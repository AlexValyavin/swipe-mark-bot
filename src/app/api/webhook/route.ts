import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";

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

    if (message.media_group_id) {
      data.mediaGroupId = message.media_group_id;
    }

    if (urls.length > 0) {
      data.domain = new URL(urls[0]).hostname;
    }

    let ogTitle: string | undefined;
    let fileName: string | undefined;

    if (message.forward_from || message.forward_origin) {
      data.type = "forward";
      data.sourceType = "forward";
      const source = parseForwardSource(message);
      if (source) {
        data.sourceChatId = source.chatId;
        data.sourceMessageId = source.messageId;
        data.sourceChatUsername = source.username;
        data.sourceChatTitle = source.title;
        data.sourceUrl = source.url;
        if (source.url) data.forwardUrl = source.url;
      }
      if (message.photo) {
        data.fileId = message.photo[message.photo.length - 1].file_id;
        const imageUrl = await resolveFileUrl(data.fileId, token);
        if (imageUrl) data.imageUrl = imageUrl;
      } else if (message.video || message.animation) {
        const media = message.video || message.animation;
        data.fileId = media.file_id;
        fileName = message.animation?.file_name;
        const [fileUrl, thumbUrl] = await Promise.all([
          resolveFileUrl(media.file_id, token),
          resolveFileUrl(media.thumb?.file_id, token),
        ]);
        if (message.video && fileUrl) data.videoUrl = fileUrl;
        if (thumbUrl) data.imageUrl = thumbUrl;
      } else if (message.document) {
        data.fileId = message.document.file_id;
        fileName = message.document.file_name;
        const thumbUrl = await resolveFileUrl(message.document.thumb?.file_id, token);
        if (thumbUrl) data.imageUrl = thumbUrl;
      }
    } else if (message.photo) {
      data.type = "photo";
      data.fileId = message.photo[message.photo.length - 1].file_id;
      const imageUrl = await resolveFileUrl(data.fileId, token);
      if (imageUrl) data.imageUrl = imageUrl;
    } else if (message.video || message.animation) {
      const media = message.video || message.animation;
      data.type = message.animation ? "animation" : "video";
      data.fileId = media.file_id;
      fileName = message.animation?.file_name;
      const [fileUrl, thumbUrl] = await Promise.all([
        resolveFileUrl(media.file_id, token),
        resolveFileUrl(media.thumb?.file_id, token),
      ]);
      if (message.video && fileUrl) data.videoUrl = fileUrl;
      if (thumbUrl) data.imageUrl = thumbUrl;
    } else if (message.document) {
      data.type = "document";
      data.fileId = message.document.file_id;
      fileName = message.document.file_name;
      const thumbUrl = await resolveFileUrl(message.document.thumb?.file_id, token);
      if (thumbUrl) data.imageUrl = thumbUrl;
    } else if (urls.length > 0) {
      data.type = "link";
      const preview = await fetchLinkPreview(urls[0]);
      if (preview?.imageUrl) data.imageUrl = preview.imageUrl;
      ogTitle = preview?.title;
      if (preview?.description) {
        data.description = preview.description.slice(0, 500);
      }
    }

    data.title = deriveTitle({ caption, text, ogTitle, fileName, type: data.type });

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
  message_id?: number;
  chat?: ForwardChat;
};

type ForwardSource = {
  chatId: string | null;
  messageId: string | null;
  username: string | null;
  title: string | null;
  url: string | null;
};

function parseForwardSource(message: {
  forward_origin?: ForwardOrigin;
  forward_from_message_id?: number;
  forward_from_chat?: ForwardChat;
}): ForwardSource | null {
  const origin = message.forward_origin;
  const messageId = origin?.message_id || message.forward_from_message_id;
  const chat = origin?.chat || message.forward_from_chat;
  if (!chat) return null;

  let url: string | null = null;
  if (messageId && chat.username) {
    url = `https://t.me/${chat.username}/${messageId}`;
  } else if (messageId && typeof chat.id === "number" && chat.id < 0) {
    const stripped = String(chat.id).replace(/^-100/, "").replace(/^-/, "");
    url = `https://t.me/c/${stripped}/${messageId}`;
  }

  return {
    chatId: chat.id != null ? String(chat.id) : null,
    messageId: messageId != null ? String(messageId) : null,
    username: chat.username || null,
    title: chat.title || null,
    url,
  };
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
