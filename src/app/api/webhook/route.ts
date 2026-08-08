import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";

type BookmarkData = {
  userId: string;
  createdAt: string;
  title: string;
  url: string | null;
  type: string;
  status: string;
  swipedCount: number;
  readTimeMin: number;
  domain?: string;
  fileId?: string;
  imageUrl?: string;
  videoUrl?: string;
  forwardUrl?: string;
  description?: string;
  deferUntil?: string | null;
  previousStatus?: string | null;
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
    const content = caption || text || "Без текста";
    const urls = extractUrls(content);
    
    // Создаем "чистый" объект без undefined
    const data: BookmarkData = {
      userId: `tg:${fromId}`,
      createdAt: new Date().toISOString(),
      title: content.slice(0, 200),
      url: urls[0] || null,
      type: "text",
      status: "new",
      swipedCount: 0,
      readTimeMin: 1,
    };

    if (urls.length > 0) {
      data.domain = new URL(urls[0]).hostname;
    }

    if (message.forward_from || message.forward_origin) {
      data.type = "forward";
      const forwardUrl = buildForwardUrl(message);
      if (forwardUrl) data.forwardUrl = forwardUrl;
      if (message.photo) {
        data.fileId = message.photo[message.photo.length - 1].file_id;
        const imageUrl = await resolveFileUrl(data.fileId, token);
        if (imageUrl) data.imageUrl = imageUrl;
      } else if (message.video) {
        data.fileId = message.video.file_id;
        const [videoUrl, thumbUrl] = await Promise.all([
          resolveFileUrl(message.video.file_id, token),
          resolveFileUrl(message.video.thumb?.file_id || message.animation?.thumb?.file_id || message.document?.thumb?.file_id, token),
        ]);
        if (videoUrl) data.videoUrl = videoUrl;
        if (thumbUrl) data.imageUrl = thumbUrl;
      }
    } else if (message.photo) {
      data.type = "photo";
      data.fileId = message.photo[message.photo.length - 1].file_id;
      const imageUrl = await resolveFileUrl(data.fileId, token);
      if (imageUrl) data.imageUrl = imageUrl;
    } else if (message.video) {
      data.type = "video";
      data.fileId = message.video.file_id;
      const [videoUrl, thumbUrl] = await Promise.all([
        resolveFileUrl(message.video.file_id, token),
        resolveFileUrl(message.video.thumb?.file_id || message.animation?.thumb?.file_id || message.document?.thumb?.file_id, token),
      ]);
      if (videoUrl) data.videoUrl = videoUrl;
      if (thumbUrl) data.imageUrl = thumbUrl;
    } else if (urls.length > 0) {
      data.type = "link";
      const preview = await fetchLinkPreview(urls[0]);
      if (preview?.imageUrl) data.imageUrl = preview.imageUrl;
      if (preview?.title && caption === "") {
        data.title = preview.title.slice(0, 200);
      }
      if (preview?.description) {
        data.description = preview.description.slice(0, 500);
      }
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
  message_id?: number;
  chat?: ForwardChat;
};

function buildForwardUrl(message: {
  forward_origin?: ForwardOrigin;
  forward_from_message_id?: number;
  forward_from_chat?: ForwardChat;
}): string | null {
  const origin = message.forward_origin;
  const messageId = origin?.message_id || message.forward_from_message_id;
  if (!messageId) return null;

  const chat = origin?.chat || message.forward_from_chat;
  if (!chat) return null;

  if (chat.username) {
    return `https://t.me/${chat.username}/${messageId}`;
  }

  if (typeof chat.id === "number" && chat.id < 0) {
    const stripped = String(chat.id).replace(/^-100/, "").replace(/^-/, "");
    return `https://t.me/c/${stripped}/${messageId}`;
  }

  return null;
}

function extractUrls(text: string): string[] {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.match(urlRegex) || [];
}
