import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getArchiveTtl } from "@/lib/db/settings";
import {
  deleteArchivedForUser,
  deleteOldArchivedForUser,
  listForUser,
} from "@/lib/db/cards";

export const runtime = "nodejs";

export type { Bookmark } from "@/lib/db/mappers";

export async function GET(req: NextRequest) {
  try {
    const userId = await getSessionUser(req);

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ttlHours = await getArchiveTtl(userId);
    const cutoff = ttlHours ? Date.now() - ttlHours * 60 * 60 * 1000 : null;

    if (cutoff) {
      await deleteOldArchivedForUser(userId, new Date(cutoff));
    }

    const bookmarks = await listForUser(userId);

    return NextResponse.json({ bookmarks });
  } catch (e) {
    console.error("Bookmarks error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await getSessionUser(req);

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const deleted = await deleteArchivedForUser(userId);

    return NextResponse.json({ ok: true, deleted });
  } catch (e) {
    console.error("Bookmarks delete error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}