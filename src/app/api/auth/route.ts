import { NextRequest, NextResponse } from "next/server";
import { createSessionCookie, verifyTelegramInitData } from "@/lib/session";
import {
  getOrCreateProfileByTelegramId,
  getProfileByTelegramId,
} from "@/lib/db/profiles";
import { identify, track } from "@/lib/analytics";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { initData } = await req.json();

    if (!initData) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }

    const session = verifyTelegramInitData(initData);
    if (!session) {
      return NextResponse.json({ error: "Invalid initData" }, { status: 401 });
    }

    const existing = await getProfileByTelegramId(session.telegramId);
    const profile = await getOrCreateProfileByTelegramId(session.telegramId, {
      telegramUsername: session.telegramUsername,
    });

    const isNew = !existing;

    const res = NextResponse.json({ ok: true, uid: profile.id });
    res.headers.append("Set-Cookie", createSessionCookie(profile.id));

    // Аналитика: fire-and-forget после ответа, не блокируем роут.
    void track("session_started", profile.id, { source: "telegram_app" });
    if (isNew) {
      void track("new_user", profile.id, { source: "telegram_app" });
    }
    void identify(profile.id, {
      telegram_username: profile.telegram_username ?? null,
    });

    return res;
  } catch (e) {
    console.error("Auth error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}