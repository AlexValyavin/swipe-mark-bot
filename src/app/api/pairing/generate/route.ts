import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { generatePairingCode } from "@/lib/db/pairing";

export const runtime = "nodejs";

function botDeepLink(code: string): string {
  const username = process.env.BOT_USERNAME || "SwipeMarkBot";
  return `https://t.me/${username}?start=${code}`;
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getSessionUser(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { code, expiresAt } = await generatePairingCode(userId);
    const deepLink = botDeepLink(code);

    return NextResponse.json({
      code,
      expiresAt,
      deepLink,
      qr: deepLink,
    });
  } catch (e) {
    console.error("Pairing generate error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}