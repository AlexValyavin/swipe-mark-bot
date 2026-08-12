import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getForUser } from "@/lib/db/cards";
import { removeCardTag } from "@/lib/db/tags";

export const runtime = "nodejs";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; tagId: string }> }
) {
  try {
    const userId = await getSessionUser(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id, tagId } = await params;

    const card = await getForUser(userId, id);
    if (!card) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await removeCardTag(id, tagId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Card tag remove error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}