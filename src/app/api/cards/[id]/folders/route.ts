import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getForUser } from "@/lib/db/cards";
import { setCardFolders } from "@/lib/db/folders";

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

    const body = (await req.json()) as { folderIds?: unknown };
    if (!Array.isArray(body.folderIds)) {
      return NextResponse.json({ error: "folderIds required" }, { status: 400 });
    }
    const folderIds = body.folderIds.filter((f): f is string => typeof f === "string");

    await setCardFolders(userId, id, folderIds);
    return NextResponse.json({ ok: true, folderIds });
  } catch (e) {
    console.error("Card folders error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}