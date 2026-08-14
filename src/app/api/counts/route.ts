import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getCountsForUser } from "@/lib/db/cards";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const userId = await getSessionUser(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const counts = await getCountsForUser(userId);
    return NextResponse.json(counts);
  } catch (e) {
    console.error("Counts error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}