import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";

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
    const data: Record<string, any> = {
      userId: `tg:${fromId}`,
      createdAt: new Date().toISOString(),
      title: content.slice(0, 200),
      url: urls[0] || null,
      type: "text",
      swipedCount: 0,
      readTimeMin: 1,
    };

    if (urls.length > 0) {
      data.domain = new URL(urls[0]).hostname;
    }

    if (message.photo) {
      data.type = "photo";
      data.fileId = message.photo[message.photo.length - 1].file_id;
      data.imageUrl = "https://via.placeholder.com/300";
    } else if (message.video) {
      data.type = "video";
      data.fileId = message.video.file_id;
    } else if (message.forward_from || message.forward_origin) {
      data.type = "forward";
    } else if (urls.length > 0) {
      data.type = "link";
    }

    await adminDb.collection("bookmarks").add(data);
    await reply(`✅ Сохранено: ${data.title.slice(0, 30)}...`);
  } catch (e) {
    console.error("Webhook logic error:", e);
    await reply("❌ Ошибка сохранения, попробуй еще раз.");
  }
  
  return NextResponse.json({ ok: true });
}

function extractUrls(text: string): string[] {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.match(urlRegex) || [];
}
