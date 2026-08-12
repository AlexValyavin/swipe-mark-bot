import { NextRequest, NextResponse } from "next/server";
import { createSessionCookie, verifyTelegramInitData } from "@/lib/session";
import { getOrCreateProfileByTelegramId } from "@/lib/db/profiles";

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

    const profile = await getOrCreateProfileByTelegramId(session.telegramId, {
      telegramUsername: session.telegramUsername,
    });

    const res = NextResponse.json({ ok: true, uid: profile.id });
    res.headers.append("Set-Cookie", createSessionCookie(profile.id));
    return res;
  } catch (e) {
    console.error("Auth error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}