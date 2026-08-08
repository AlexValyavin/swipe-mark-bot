import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

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
  videoUrl?: string;
  createdAt: string;
  domain?: string;
  swipedCount: number;
  readTimeMin: number;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const adminDb = getAdminDb();
    const snapshot = await adminDb
      .collection("bookmarks")
      .where("userId", "==", userId)
      .get();

    const bookmarks = snapshot.docs
      .map((doc) => {
        const data = doc.data() as Omit<Bookmark, "id">;
        return { id: doc.id, ...data };
      })
      .sort(
        (a, b) =>
          new Date(b.createdAt || 0).getTime() -
          new Date(a.createdAt || 0).getTime()
      )
      .slice(0, 50);

    return NextResponse.json({ bookmarks });
  } catch (e) {
    console.error("Bookmarks error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}