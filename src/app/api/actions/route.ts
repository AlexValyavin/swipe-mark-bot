import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";

export const runtime = "nodejs";

const ACTIONS = ["left", "right", "done", "open", "undo"] as const;
type Action = (typeof ACTIONS)[number];

export async function POST(req: NextRequest) {
  try {
    const userId = getSessionUser(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      cardId,
      action,
      idempotencyKey,
    }: { cardId?: string; action?: string; idempotencyKey?: string } =
      await req.json();

    if (!cardId || !action || !ACTIONS.includes(action as Action)) {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }

    const adminDb = getAdminDb();
    const ref = adminDb.collection("bookmarks").doc(cardId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const data = snap.data() as Record<string, unknown>;
    if (data.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (idempotencyKey) {
      const seen = await adminDb
        .collection("swipe_actions")
        .where("idempotencyKey", "==", idempotencyKey)
        .limit(1)
        .get();
      if (!seen.empty) {
        return NextResponse.json({ ok: true, alreadyProcessed: true });
      }
    }

    const currentStatus = typeof data.status === "string" ? data.status : "new";
    const previousStatus =
      typeof data.previousStatus === "string" ? data.previousStatus : null;
    const now = Date.now();

    let newStatus = currentStatus;
    let deferUntil: string | null = null;
    let rightCount = typeof data.rightCount === "number" ? data.rightCount : 0;

    switch (action as Action) {
      case "left":
        newStatus = "archived";
        break;
      case "right":
        rightCount += 1;
        if (rightCount >= 5) {
          newStatus = "archived";
        } else {
          newStatus = "new";
        }
        break;
      case "done":
        newStatus = "done";
        break;
      case "open":
        break;
      case "undo":
        newStatus = previousStatus || "new";
        deferUntil = null;
        break;
    }

    if (action !== "open") {
      const update: Record<string, unknown> = {
        status: newStatus,
        deferUntil,
        previousStatus: action === "undo" ? null : currentStatus,
      };
      if (action === "right") {
        update.rightCount = rightCount;
      }
      await ref.update(update);
    }

    await adminDb.collection("swipe_actions").add({
      userId,
      cardId,
      action,
      previousStatus: currentStatus,
      idempotencyKey: idempotencyKey || null,
      createdAt: new Date(now).toISOString(),
    });

    return NextResponse.json({
      ok: true,
      status: newStatus,
      rightCount: action === "right" ? rightCount : undefined,
    });
  } catch (e) {
    console.error("Actions error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
