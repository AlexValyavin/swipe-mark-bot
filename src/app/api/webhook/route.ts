import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const message = body.message;

  if (!message || !message.chat?.id) {
    return NextResponse.json({ ok: true });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const host = req.headers.get("host") || "swipe-mark-bot.vercel.app";
  const baseUrl = `https://${host}`;
  const chatId = message.chat.id;
  const fromId = message.from?.id;
  const reply = async (text: string) => {
    if (!token) return;
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  };

  if (!fromId) return NextResponse.json({ ok: true });

  // /start — приветствие + кнопка
  if (message.text === "/start") {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text:
          "Отправь мне ссылку, фото, видео или перешли сообщение — я сохраню это в SwipeMark.\n\nНажми кнопку ниже, чтобы открыть приложение.",
        reply_markup: {
          inline_keyboard: [[{ text: "Открыть SwipeMark", url: baseUrl }]],
        },
      }),
    });
    return NextResponse.json({ ok: true });
  }

  const adminDb = getAdminDb();
  const saveBookmark = async (data: Record<string, unknown>) => {
    await adminDb.collection("bookmarks").add({
      userId: `tg:${fromId}`,
      createdAt: new Date().toISOString(),
      ...data,
    });
  };

  // Фото
  if (message.photo) {
    const photo = message.photo.pop(); // самое большое
    const caption = message.caption || "";
    const title = caption || "Фото";

    await saveBookmark({
      type: "photo",
      fileId: photo.file_id,
      caption: caption,
      title: title.slice(0, 200),
      url: caption ? extractUrls(caption)[0] || null : null,
    });

    await reply(`✅ Сохранено: ${title}`);
    return NextResponse.json({ ok: true });
  }

  // Видео
  if (message.video) {
    const caption = message.caption || "";
    const title = caption || "Видео";

    await saveBookmark({
      type: "video",
      fileId: message.video.file_id,
      caption,
      title: title.slice(0, 200),
      url: caption ? extractUrls(caption)[0] || null : null,
    });

    await reply(`✅ Сохранено: ${title}`);
    return NextResponse.json({ ok: true });
  }

  // Пересланное сообщение (forward_from)
  if (message.forward_from) {
    // Пытаемся извлечь контент из пересланного сообщения
    const text = message.text || "";
    const caption = message.caption || "";
    const content = text || caption;
    const urls = extractUrls(content);

    if (urls.length > 0) {
      const url = urls[0];
      await saveBookmark({
        type: "forward",
        title: content.replace(url, "").trim().slice(0, 200) || url,
        url,
      });
      await reply(`✅ Сохранено: ${url}`);
    } else if (content) {
      await saveBookmark({
        type: "forward",
        title: content.slice(0, 200),
        url: null,
      });
      await reply(`✅ Сохранено`);
    } else {
      await reply("Не вижу текста или ссылки в пересланном сообщении.");
    }
    return NextResponse.json({ ok: true });
  }

  // Текст — ищем ссылку
  if (message.text) {
    const urls = extractUrls(message.text);
    if (urls.length > 0) {
      const url = urls[0];
      const title = message.text.replace(url, "").trim() || url;

      await saveBookmark({
        type: "link",
        title: title.slice(0, 200),
        url,
      });

      await reply(`✅ Сохранено: ${title}`);
    } else {
      await saveBookmark({
        type: "text",
        title: message.text.slice(0, 200),
        url: null,
      });
      await reply(`✅ Сохранено`);
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}

function extractUrls(text: string): string[] {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.match(urlRegex) || [];
}