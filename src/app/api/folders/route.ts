import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { createFolder, listFolders } from "@/lib/db/folders";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const userId = await getSessionUser(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const folders = await listFolders(userId);
    return NextResponse.json({
      folders: folders.map((f) => ({
        id: f.id,
        name: f.name,
        emoji: f.emoji,
        count: f.count,
        sortOrder: f.sort_order,
      })),
    });
  } catch (e) {
    console.error("Folders list error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getSessionUser(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as {
      name?: unknown;
      emoji?: unknown;
      sortOrder?: unknown;
    };

    const name =
      typeof body.name === "string" ? body.name.trim() : "";
    if (name.length < 1 || name.length > 40) {
      return NextResponse.json({ error: "Name must be 1-40 chars" }, { status: 400 });
    }
    const emoji =
      typeof body.emoji === "string" && body.emoji.trim().length > 0
        ? body.emoji.trim().slice(0, 16)
        : null;
    const sortOrder =
      typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)
        ? Math.floor(body.sortOrder)
        : undefined;

    const folder = await createFolder(userId, { name, emoji, sort_order: sortOrder });
    return NextResponse.json({
      folder: {
        id: folder.id,
        name: folder.name,
        emoji: folder.emoji,
        count: 0,
        sortOrder: folder.sort_order,
      },
    });
  } catch (e) {
    const err = e as Error & { code?: string };
    if (err.code === "23505") {
      return NextResponse.json({ error: "Duplicate" }, { status: 409 });
    }
    console.error("Folders create error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}