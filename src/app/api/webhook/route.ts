import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const message = body.message;

  if (!message?.text || !message?.chat?.id) {
    return NextResponse.json({ ok: true });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const host = req.headers.get("host") || "swipemark.vercel.app";
  const baseUrl = `https://${host}`;
  const chatId = message.chat.id;
  const fromId = message.from.id;
  const text = message.text;

  // /start — открыть Mini App
  if (text === "/start") {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: "Отправь мне ссылку или перешли сообщение — я сохраню её в SwipeMark.\n\nНажми кнопку ниже, чтобы открыть приложение и смотреть сохранённое.",
        reply_markup: {
          inline_keyboard: [[{ text: "Открыть SwipeMark", url: baseUrl }]],
        },
      }),
    });
    return NextResponse.json({ ok: true });
  }

  // Всё остальное — пытаемся извлечь ссылку
  const urls = extractUrls(text);
  if (urls.length > 0) {
    const url = urls[0];
    const title = text.replace(url, "").trim() || url;

    const adminDb = getAdminDb();
    await adminDb.collection("bookmarks").add({
      userId: `tg:${fromId}`,
      url,
      title: title.slice(0, 200),
      createdAt: new Date().toISOString(),
    });

    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: `✅ Сохранено: ${title}`,
      }),
    });
  } else {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: "Не вижу ссылки. Отправь мне ссылку или перешли сообщение с ней.",
      }),
    });
  }

  return NextResponse.json({ ok: true });
}

function extractUrls(text: string): string[] {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.match(urlRegex) || [];
}