import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getAdminDb } from "@/lib/db/supabase";
import { enrichCard } from "@/lib/ai/enrich";
import { createBulkJob, getBulkJob, updateBulkJob, bulkJobStatusToClient } from "@/lib/db/jobs";

export const runtime = "nodejs";
const MAX_BULK = 30;
const CHUNK_SIZE = 5;

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

async function verifyOwnership(userId: string, cardIds: string[]): Promise<string[]> {
  const { data: owned, error } = await getAdminDb()
    .from("cards")
    .select("id")
    .eq("user_id", userId)
    .in("id", cardIds);
  if (error) throw error;
  const ownedSet = new Set((owned ?? []).map((c) => c.id));
  return cardIds.filter((id) => ownedSet.has(id));
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

    cardIds = await verifyOwnership(userId, cardIds);
    if (cardIds.length === 0) {
      return NextResponse.json({ jobId: null, total: 0, done: 0, failed: 0, status: "done" });
    }

    const job = await createBulkJob(userId, cardIds.length);

    // Фоновая обработка чанками: прогресс в БД, поллинг с клиента.
    after(async () => {
      let done = 0;
      let failed = 0;
      try {
        for (let i = 0; i < cardIds.length; i += CHUNK_SIZE) {
          const chunk = cardIds.slice(i, i + CHUNK_SIZE);
          const results = await Promise.allSettled(chunk.map((id) => enrichCard(userId, id)));
          for (const r of results) {
            if (r.status === "fulfilled" && r.value.status === "done") {
              done++;
            } else {
              failed++;
            }
          }
          const current = await getBulkJob(userId, job.id);
          if (current && current.status === "cancelled") {
            await updateBulkJob(job.id, { done, failed });
            return;
          }
          await updateBulkJob(job.id, { done, failed });
        }
        await updateBulkJob(job.id, { done, failed, status: "done" });
      } catch (e) {
        console.error("Bulk AI job error:", e);
        try {
          await updateBulkJob(job.id, { done, failed, status: "error" });
        } catch {
          // молча
        }
      }
    });

    return NextResponse.json(bulkJobStatusToClient(job));
  } catch (e) {
    console.error("Bulk AI error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}