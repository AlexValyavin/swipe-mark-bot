import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";

export const runtime = "nodejs";

const ALLOWED_TTL: number[] = [24, 168, 720];

export async function GET(req: NextRequest) {
  try {
    const userId = getSessionUser(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminDb = getAdminDb();
    const snap = await adminDb.collection("settings").doc(userId).get();
    const data = snap.exists ? (snap.data() as Record<string, unknown>) : {};

    return NextResponse.json({
      archiveTtlHours:
        typeof data.archiveTtlHours === "number" ? data.archiveTtlHours : null,
    });
  } catch (e) {
    console.error("Settings error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = getSessionUser(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as { archiveTtlHours?: number | null };
    const ttl = body.archiveTtlHours ?? null;

    if (ttl !== null && !ALLOWED_TTL.includes(ttl)) {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }

    const adminDb = getAdminDb();
    const doc = adminDb.collection("settings").doc(userId);
    const snap = await doc.get();
    if (snap.exists) {
      await doc.update({ archiveTtlHours: ttl, updatedAt: new Date().toISOString() });
    } else {
      await doc.set({
        userId,
        archiveTtlHours: ttl,
        updatedAt: new Date().toISOString(),
      });
    }

    return NextResponse.json({ ok: true, archiveTtlHours: ttl });
  } catch (e) {
    console.error("Settings error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
