import { NextRequest, NextResponse } from "next/server";
import { isOwner } from "@/lib/auth/owner";
import { listFailedCards } from "@/lib/db/meta";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    if (!(await isOwner(req))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const failed = await listFailedCards(20);

    return NextResponse.json({
      ownerTelegramId: Number(process.env.OWNER_TELEGRAM_ID || 0),
      failed,
    });
  } catch (e) {
    console.error("Diagnostics error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
