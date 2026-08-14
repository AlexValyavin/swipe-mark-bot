import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getAdminDb } from "@/lib/db/supabase";
import { deleteCard, updateCard } from "@/lib/db/cards";
import { setCardFolders, getFolder } from "@/lib/db/folders";
import { addCardTags } from "@/lib/db/tags";

export const runtime = "nodejs";
const MAX_BULK = 100;

type BulkAction = "toFolder" | "addTag" | "archive" | "toDeck" | "delete";

const ACTIONS: BulkAction[] = ["toFolder", "addTag", "archive", "toDeck", "delete"];

export async function POST(req: NextRequest) {
  try {
    const userId = await getSessionUser(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      cardIds?: unknown;
      action?: unknown;
      payload?: unknown;
    };

    const action = body.action as BulkAction;
    const rawIds = Array.isArray(body.cardIds)
      ? body.cardIds.filter((c): c is string => typeof c === "string")
      : [];
    const payload =
      typeof body.payload === "object" && body.payload !== null
        ? (body.payload as Record<string, unknown>)
        : {};

    if (!ACTIONS.includes(action) || rawIds.length === 0 || rawIds.length > MAX_BULK) {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }

    const db = getAdminDb();
    const { data: owned } = await db
      .from("cards")
      .select("id")
      .eq("user_id", userId)
      .in("id", rawIds);
    const ownedSet = new Set((owned ?? []).map((c) => c.id));
    const cardIds = rawIds.filter((id) => ownedSet.has(id));

    if (cardIds.length === 0) {
      return NextResponse.json({ processed: 0, failed: 0, failedIds: [] });
    }

    // Проверка цели один раз: папка принадлежит пользователю.
    let folderId: string | null = null;
    if (action === "toFolder") {
      const rawFolder = payload.folderId;
      if (typeof rawFolder !== "string") {
        return NextResponse.json({ error: "Bad request" }, { status: 400 });
      }
      const folder = await getFolder(userId, rawFolder);
      if (!folder) {
        return NextResponse.json({ error: "Folder not found" }, { status: 404 });
      }
      folderId = folder.id;
    }

    // Теги: нормализуем один раз.
    const tagNames = (Array.isArray(payload.names) ? payload.names : [])
      .filter((n): n is string => typeof n === "string" && n.trim().length > 0)
      .slice(0, 10);

    if (action === "addTag" && tagNames.length === 0) {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }

    const processed: string[] = [];
    const failures: string[] = [];
    for (const id of cardIds) {
      try {
        switch (action) {
          case "toFolder":
            await setCardFolders(userId, id, folderId ? [folderId] : []);
            break;
          case "addTag":
            await addCardTags(userId, id, tagNames);
            break;
          case "archive":
            await updateCard(id, {
              status: "archived",
              archived_at: new Date().toISOString(),
            });
            break;
          case "toDeck":
            await updateCard(id, { status: "new", defer_until: null });
            break;
          case "delete":
            await deleteCard(userId, id);
            break;
        }
        processed.push(id);
      } catch (e) {
        failures.push(id);
        console.error(`Bulk ${action} failed for card ${id}:`, e);
      }
    }

    return NextResponse.json({
      processed: processed.length,
      failed: failures.length,
      failedIds: failures,
    });
  } catch (e) {
    console.error("Bulk error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}