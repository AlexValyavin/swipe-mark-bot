import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getProfileById } from "@/lib/db/profiles";
import { listFailedCards } from "@/lib/db/meta";

export const runtime = "nodejs";

/**
 * Диагностика доступна только владельцу приложения (OWNER_TELEGRAM_ID).
 */
async function isOwner(req: NextRequest): Promise<boolean> {
  const ownerTgId = Number(process.env.OWNER_TELEGRAM_ID || 0);
  if (!ownerTgId) return false;

  const userId = await getSessionUser(req);
  if (!userId) return false;

  const profile = await getProfileById(userId);
  if (!profile) return false;

  return profile.telegram_id === ownerTgId;
}

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
