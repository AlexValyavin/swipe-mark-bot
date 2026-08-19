import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getForUser, updateCard } from "@/lib/db/cards";
import {
  getLatestStatusChange,
  hasIdempotencyKey,
  logAction,
  type SwipeActionName,
} from "@/lib/db/swipes";

export const runtime = "nodejs";

const ACTIONS = ["left", "right", "done", "open", "undo", "later"] as const;

export async function POST(req: NextRequest) {
  try {
    const userId = await getSessionUser(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      cardId,
      action,
      idempotencyKey,
    }: { cardId?: string; action?: string; idempotencyKey?: string } =
      await req.json();

    if (!cardId || !action || !ACTIONS.includes(action as SwipeActionName)) {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }

    const bookmark = await getForUser(userId, cardId);
    if (!bookmark) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (idempotencyKey) {
      const seen = await hasIdempotencyKey(idempotencyKey);
      if (seen) {
        return NextResponse.json({ ok: true, alreadyProcessed: true });
      }
    }

    const currentStatus = bookmark.status || "new";
    const now = Date.now();

    let newStatus = currentStatus;
    let deferUntil: string | null = null;

    switch (action as SwipeActionName) {
      case "left":
        newStatus = "archived";
        break;
      case "right":
        // Вправо = «оставить на потом»: карточка уходит из колоды на сутки.
        newStatus = "later";
        deferUntil = new Date(now + 24 * 60 * 60 * 1000).toISOString();
        break;
      case "done":
        newStatus = "done";
        break;
      case "open":
        break;
      case "undo": {
        const latest = await getLatestStatusChange(cardId);
        newStatus = latest?.previous_status || "new";
        deferUntil = null;
        break;
      }
      case "later":
        newStatus = "later";
        deferUntil = new Date(now + 24 * 60 * 60 * 1000).toISOString();
        break;
    }

    if (action !== "open") {
      await updateCard(cardId, {
        status: newStatus,
        defer_until: deferUntil,
      });
    }

    await logAction({
      userId,
      cardId,
      action: action as SwipeActionName,
      previousStatus: action === "undo" ? null : currentStatus,
      idempotencyKey: idempotencyKey || null,
    });

    return NextResponse.json({
      ok: true,
      status: newStatus,
    });
  } catch (e) {
    console.error("Actions error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}