import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getAdminDb } from "@/lib/db/supabase";
import { enrichCard } from "@/lib/ai/enrich";

export const runtime = "nodejs";
const BULK_TIMEOUT_MS = 12_000;
const MAX_BULK = 30;

async function findUnsortedCardIds(userId: string): Promise<string[]> {
  const db = getAdminDb();
  const { data: inFolder } = await db.from("card_folders").select("card_id");
  const excluded = new Set((inFolder ?? []).map((r) => r.card_id));

  const { data: cards, error } = await db
    .from("cards")
    .select("id")
    .eq("user_id", userId)
    .in("status", ["new", "later"])
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (cards ?? [])
    .map((c) => c.id)
    .filter((id) => !excluded.has(id))
    .slice(0, MAX_BULK);
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getSessionUser(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      scope?: unknown;
      cardIds?: unknown;
    };

    let cardIds: string[];
    if (body.scope === "unsorted") {
      cardIds = await findUnsortedCardIds(userId);
    } else if (Array.isArray(body.cardIds)) {
      cardIds = body.cardIds
        .filter((c): c is string => typeof c === "string")
        .slice(0, MAX_BULK);
    } else {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }

    // Проверяем принадлежность карточек пользователю.
    const { data: owned, error } = await getAdminDb()
      .from("cards")
      .select("id")
      .eq("user_id", userId)
      .in("id", cardIds);
    if (error) throw error;
    const ownedSet = new Set((owned ?? []).map((c) => c.id));
    cardIds = cardIds.filter((id) => ownedSet.has(id));

    if (cardIds.length === 0) {
      return NextResponse.json({ processed: 0, failed: 0 });
    }

    let processed = 0;
    let failed = 0;
    const failures: string[] = [];
    for (const id of cardIds) {
      const timer = setTimeout(() => {}, BULK_TIMEOUT_MS);
      try {
        const outcome = await enrichCard(userId, id);
        if (outcome.status === "done") {
          processed++;
        } else {
          failed++;
          failures.push(id);
        }
      } catch (e) {
        failed++;
        failures.push(id);
        console.error(`Bulk AI failed for card ${id}:`, e);
      } finally {
        clearTimeout(timer);
      }
    }

    return NextResponse.json({
      processed,
      failed,
      failedIds: failures,
    });
  } catch (e) {
    console.error("Bulk AI error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}