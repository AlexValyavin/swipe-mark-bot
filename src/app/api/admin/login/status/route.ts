import { NextRequest, NextResponse } from "next/server";
import { getAdminLoginCode } from "@/lib/db/adminLogin";
import { getOrCreateProfileByTelegramId } from "@/lib/db/profiles";
import { createSessionCookie } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const code = new URL(req.url).searchParams.get("code") || "";
    if (!code.startsWith("admin_")) {
      return NextResponse.json({ error: "Bad code" }, { status: 400 });
    }
    const row = await getAdminLoginCode(code);
    if (!row) return NextResponse.json({ linked: false, expired: true });

    const expired = new Date(row.expires_at).getTime() < Date.now();
    const linked = !!row.used_at && !!row.telegram_id;
    if (expired) return NextResponse.json({ linked: false, expired: true });
    if (!linked) return NextResponse.json({ linked: false, expired: false });

    // Проверяем совпадение с владельцем (bigint может прийти строкой)
    const ownerTgId = Number(String(process.env.OWNER_TELEGRAM_ID || "").trim() || 0);
    if (!ownerTgId || Number(row.telegram_id) !== ownerTgId) {
      return NextResponse.json({ linked: true, authorized: false, telegram_id: row.telegram_id, ownerTgId });
    }

    // Выдаём сессию владельцу (создаём профиль если впервые)
    const profile = await getOrCreateProfileByTelegramId(ownerTgId);
    if (!profile) return NextResponse.json({ linked: true, authorized: false });

    const res = NextResponse.json({ linked: true, authorized: true, telegram_id: row.telegram_id });
    res.headers.set("Set-Cookie", createSessionCookie(profile.id));
    return res;
  } catch (e) {
    console.error("Admin login status error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
