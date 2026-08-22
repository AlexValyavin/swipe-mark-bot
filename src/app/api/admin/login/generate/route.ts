import { NextResponse } from "next/server";
import { generateAdminLoginCode } from "@/lib/db/adminLogin";

export const runtime = "nodejs";

function botDeepLink(code: string): string {
  const username = process.env.BOT_USERNAME || process.env.NEXT_PUBLIC_BOT_USERNAME || "SwipeMarkBot";
  return `https://t.me/${username}?start=${code}`;
}

export async function POST() {
  try {
    const { code, expiresAt } = await generateAdminLoginCode();
    const deepLink = botDeepLink(code);
    return NextResponse.json({ code, expiresAt, deepLink, qr: deepLink });
  } catch (e) {
    console.error("Admin login generate error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
