import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getActivePairingCode } from "@/lib/db/pairing";
import { getProfileById } from "@/lib/db/profiles";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const userId = await getSessionUser(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profile = await getProfileById(userId);
    if (!profile) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const linked = Boolean(profile.telegram_id);
    const active = await getActivePairingCode(userId);

    return NextResponse.json({
      linked,
      telegramUsername: linked ? profile.telegram_username : null,
      linkedAt: linked ? profile.updated_at : null,
      code: active?.code ?? null,
      expiresAt: active?.expiresAt ?? null,
    });
  } catch (e) {
    console.error("Pairing status error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}