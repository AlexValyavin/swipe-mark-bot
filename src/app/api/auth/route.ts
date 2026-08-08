import { NextRequest, NextResponse } from "next/server";
import { verifyTelegramInitData, createSessionCookie } from "@/lib/session";

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

    const res = NextResponse.json({ ok: true, uid: session.userId });
    res.headers.append("Set-Cookie", createSessionCookie(session.userId));
    return res;
  } catch (e) {
    console.error("Auth error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
