import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getArchiveTtl, setArchiveTtl } from "@/lib/db/settings";

export const runtime = "nodejs";

const ALLOWED_TTL: number[] = [24, 168, 720];

export async function GET(req: NextRequest) {
  try {
    const userId = await getSessionUser(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const archiveTtlHours = await getArchiveTtl(userId);

    return NextResponse.json({ archiveTtlHours });
  } catch (e) {
    console.error("Settings error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getSessionUser(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as { archiveTtlHours?: number | null };
    const ttl = body.archiveTtlHours ?? null;

    if (ttl !== null && !ALLOWED_TTL.includes(ttl)) {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }

    await setArchiveTtl(userId, ttl);

    return NextResponse.json({ ok: true, archiveTtlHours: ttl });
  } catch (e) {
    console.error("Settings error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}