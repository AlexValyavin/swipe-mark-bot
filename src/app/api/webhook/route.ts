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

  if (message.text === "/start") {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: "Отправь мне ссылку, фото, видео или перешли сообщение — я сохраню это в SwipeMark.\n\nНажми кнопку ниже, чтобы открыть приложение.",
        reply_markup: {
          inline_keyboard: [[{ text: "Открыть SwipeMark", url: baseUrl }]],
        },
      }),
    });
    return NextResponse.json({ ok: true });
  }

  const adminDb = getAdminDb();
  
  // Robust extraction
  const caption = message.caption || "";
  const text = message.text || "";
  const content = caption || text || "";
  const urls = extractUrls(content);
  
  const data = {
    userId: `tg:${fromId}`,
    createdAt: new Date().toISOString(),
    title: content.slice(0, 200) || "Без заголовка",
    url: urls[0] || null,
    type: "text",
    imageUrl: null as string | null,
    fileId: null as string | null,
    swipedCount: 0,
    readTimeMin: 1,
    domain: undefined as string | undefined,
  };

  if (message.photo) {
    data.type = "photo";
    data.fileId = message.photo[message.photo.length - 1].file_id;
    data.imageUrl = data.fileId; // UI expects imageUrl
  } else if (message.video) {
    data.type = "video";
    data.fileId = message.video.file_id;
    data.imageUrl = data.fileId;
  } else if (message.forward_from || message.forward_origin) {
    data.type = "forward";
  } else if (urls.length > 0) {
    data.type = "link";
    data.domain = new URL(urls[0]).hostname;
  }

  await adminDb.collection("bookmarks").add(data);
  await reply(`✅ Сохранено: ${data.title.slice(0, 30)}...`);
  
  return NextResponse.json({ ok: true });
}

function extractUrls(text: string): string[] {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.match(urlRegex) || [];
}
