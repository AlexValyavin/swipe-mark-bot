import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";

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
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();

    const bookmarks = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({ bookmarks });
  } catch (e) {
    console.error("Bookmarks error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}