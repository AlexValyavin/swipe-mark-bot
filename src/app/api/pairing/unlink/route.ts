import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { unlinkTelegram } from "@/lib/db/pairing";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const userId = await getSessionUser(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await unlinkTelegram(userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Pairing unlink error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}