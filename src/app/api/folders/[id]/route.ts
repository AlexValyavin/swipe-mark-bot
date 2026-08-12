import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { deleteAndArrangeCards, getFolder, updateFolder } from "@/lib/db/folders";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getSessionUser(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;

    const body = (await req.json()) as {
      name?: unknown;
      emoji?: unknown;
      sortOrder?: unknown;
    };

    const patch: { name?: string; emoji?: string | null; sort_order?: number } = {};
    if (body.name !== undefined) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (name.length < 1 || name.length > 40) {
        return NextResponse.json({ error: "Name must be 1-40 chars" }, { status: 400 });
      }
      patch.name = name;
    }
    if (body.emoji !== undefined) {
      patch.emoji =
        typeof body.emoji === "string" && body.emoji.trim().length > 0
          ? body.emoji.trim().slice(0, 16)
          : null;
    }
    if (body.sortOrder !== undefined) {
      if (typeof body.sortOrder !== "number" || !Number.isFinite(body.sortOrder)) {
        return NextResponse.json({ error: "Bad sortOrder" }, { status: 400 });
      }
      patch.sort_order = Math.floor(body.sortOrder);
    }

    const folder = await updateFolder(userId, id, patch);
    return NextResponse.json({
      folder: {
        id: folder.id,
        name: folder.name,
        emoji: folder.emoji,
        sortOrder: folder.sort_order,
      },
    });
  } catch (e) {
    console.error("Folder update error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getSessionUser(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;

    const folder = await getFolder(userId, id);
    if (!folder) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const cardsTo = req.nextUrl.searchParams.get("cardsTo");
    if (cardsTo !== null && cardsTo !== "none" && cardsTo !== "archive") {
      return NextResponse.json({ error: "Bad cardsTo" }, { status: 400 });
    }

    await deleteAndArrangeCards(
      userId,
      id,
      (cardsTo as "none" | "archive") || "none"
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Folder delete error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}