import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getForUser } from "@/lib/db/cards";
import { dismissSuggestion } from "@/lib/ai/enrich";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getSessionUser(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;

    const card = await getForUser(userId, id);
    if (!card) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await dismissSuggestion(userId, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("AI dismiss error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}