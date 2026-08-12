import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getForUser } from "@/lib/db/cards";
import { setCardTags } from "@/lib/db/tags";

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

    const body = (await req.json()) as { names?: unknown };
    const names = Array.isArray(body.names)
      ? body.names.filter((n): n is string => typeof n === "string" && n.trim().length > 0)
      : [];
    if (names.some((n) => n.trim().length > 40)) {
      return NextResponse.json({ error: "Tag name too long" }, { status: 400 });
    }

    await setCardTags(userId, id, names);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Card tags error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}