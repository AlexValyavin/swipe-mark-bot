import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { listTagsByUser } from "@/lib/db/tags";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const userId = await getSessionUser(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const q = req.nextUrl.searchParams.get("q") ?? undefined;
    const tags = await listTagsByUser(userId, q);
    return NextResponse.json({ tags });
  } catch (e) {
    console.error("Tags error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}