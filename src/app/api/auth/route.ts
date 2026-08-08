import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAdminAuth } from "@/lib/firebase-admin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { initData } = await req.json();
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    if (!botToken || !initData) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }

    // Проверяем initData
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    params.delete("hash");

    const checkString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");

    const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
    const expected = crypto.createHmac("sha256", secret).update(checkString).digest("hex");

    if (hash !== expected) {
      return NextResponse.json({ error: "Invalid hash" }, { status: 401 });
    }

    const userStr = params.get("user");
    if (!userStr) {
      return NextResponse.json({ error: "No user" }, { status: 400 });
    }

    const user = JSON.parse(userStr);
    const uid = `tg:${user.id}`;

    // Создаём Custom Token для Firebase
    const adminAuth = getAdminAuth();
    const customToken = await adminAuth.createCustomToken(uid);

    return NextResponse.json({ token: customToken, uid });
  } catch (e) {
    console.error("Auth error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}