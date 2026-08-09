import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";

export const runtime = "nodejs";

export interface Bookmark {
  id: string;
  userId: string;
  url?: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  type?: string;
  caption?: string;
  fileId?: string;
  fileName?: string | null;
  videoUrl?: string;
  forwardUrl?: string;
  sourceType?: string;
  sourceUrl?: string | null;
  mediaGroupId?: string;
  mediaItems?: Array<{
    type: string;
    fileId?: string;
    imageUrl?: string;
    videoUrl?: string;
    fileName?: string | null;
  }>;
  status?: string;
  deferUntil?: string | null;
  previousStatus?: string | null;
  createdAt: string;
  domain?: string;
  swipedCount: number;
  readTimeMin: number;
  rightCount?: number;
}

export async function GET(req: NextRequest) {
  try {
    const userId = getSessionUser(req);

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminDb = getAdminDb();
    const snapshot = await adminDb
      .collection("bookmarks")
      .where("userId", "==", userId)
      .get();

    const settingsSnap = await adminDb.collection("settings").doc(userId).get();
    const settings = settingsSnap.exists
      ? (settingsSnap.data() as { archiveTtlHours?: number })
      : {};
    const ttlHours =
      typeof settings.archiveTtlHours === "number" ? settings.archiveTtlHours : null;

    const cutoff = ttlHours ? Date.now() - ttlHours * 60 * 60 * 1000 : null;

    const bookmarks: Bookmark[] = [];

    for (const doc of snapshot.docs) {
      const data = doc.data() as Omit<Bookmark, "id">;
      const createdAt = new Date(data.createdAt || 0).getTime();
      if (
        cutoff &&
        data.status === "archived" &&
        createdAt &&
        createdAt < cutoff
      ) {
        await doc.ref.delete();
        continue;
      }
      bookmarks.push({ id: doc.id, ...data });
    }

    const result = bookmarks
      .sort(
        (a, b) =>
          new Date(b.createdAt || 0).getTime() -
          new Date(a.createdAt || 0).getTime()
      )
      .slice(0, 50);

    return NextResponse.json({ bookmarks: result });
  } catch (e) {
    console.error("Bookmarks error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = getSessionUser(req);

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminDb = getAdminDb();
    const snapshot = await adminDb
      .collection("bookmarks")
      .where("userId", "==", userId)
      .get();

    let deleted = 0;
    for (const doc of snapshot.docs) {
      const data = doc.data() as Record<string, unknown>;
      if (data.status === "archived") {
        await doc.ref.delete();
        deleted++;
      }
    }

    return NextResponse.json({ ok: true, deleted });
  } catch (e) {
    console.error("Bookmarks delete error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
