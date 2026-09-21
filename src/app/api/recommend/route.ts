import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getAdminDb } from "@/lib/db/supabase";
import { getByIds } from "@/lib/db/cards";
import { listFolders } from "@/lib/db/folders";
import {
  normalizeMinutes,
  rankCandidates,
  resolveEstimatedMinutes,
  type RecommendCandidate,
} from "@/lib/recommend";

export const runtime = "nodejs";

/** Статусы-кандидаты для чтения. Архив исключён всегда. */
const CANDIDATE_STATUSES = ["new", "later", "done"];
const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 20;

type CardRowLite = {
  id: string;
  status: string;
  estimated_minutes: number | null;
  duration_seconds: number | null;
  title: string | null;
  text: string | null;
  primary_type: string | null;
  created_at: string;
  defer_until: string | null;
};

export async function GET(req: NextRequest) {
  try {
    const userId = await getSessionUser(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sp = req.nextUrl.searchParams;
    const minutes = normalizeMinutes(sp.get("minutes"));
    const exclude = new Set(
      (sp.get("exclude") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    );
    const limitRaw = Number(sp.get("limit") || DEFAULT_LIMIT);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(1, Math.floor(limitRaw)), MAX_LIMIT)
      : DEFAULT_LIMIT;

    const db = getAdminDb();
    const now = Date.now();

    // 1. Кандидаты: свои карточки в читаемых статусах.
    const { data: cards, error } = await db
      .from("cards")
      .select(
        "id, status, estimated_minutes, duration_seconds, title, text, primary_type, created_at, defer_until"
      )
      .eq("user_id", userId)
      .in("status", CANDIDATE_STATUSES);
    if (error) throw error;

    const pool = ((cards ?? []) as CardRowLite[]).filter((c) => {
      if (exclude.has(c.id)) return false;
      if (c.status === "later" && c.defer_until) {
        // «Потом» с будущим defer ещё не due — не предлагаем.
        if (new Date(c.defer_until).getTime() > now) return false;
      }
      return true;
    });
    if (pool.length === 0) {
      return NextResponse.json({ minutes, items: [], totalCandidates: 0 });
    }
    const poolIds = pool.map((c) => c.id);

    // 2. Папки (interest), действия (not_seen), og_description (длительность).
    const [folders, cfRes, actRes, linkRes] = await Promise.all([
      listFolders(userId),
      db.from("card_folders").select("card_id, folder_id").in("card_id", poolIds),
      db
        .from("swipe_actions")
        .select("card_id")
        .eq("user_id", userId)
        .in("card_id", poolIds),
      db
        .from("card_links")
        .select("card_id, og_description, created_at")
        .in("card_id", poolIds)
        .order("created_at", { ascending: true }),
    ]);

    const folderIdsByCard = new Map<string, string[]>();
    for (const r of (cfRes.data ?? []) as Array<{
      card_id: string;
      folder_id: string;
    }>) {
      const list = folderIdsByCard.get(r.card_id) ?? [];
      list.push(r.folder_id);
      folderIdsByCard.set(r.card_id, list);
    }

    const actionsByCard = new Map<string, number>();
    for (const r of (actRes.data ?? []) as Array<{ card_id: string }>) {
      actionsByCard.set(r.card_id, (actionsByCard.get(r.card_id) ?? 0) + 1);
    }

    const descByCard = new Map<string, string>();
    for (const r of (linkRes.data ?? []) as Array<{
      card_id: string;
      og_description: string | null;
    }>) {
      if (!descByCard.has(r.card_id) && r.og_description) {
        descByCard.set(r.card_id, r.og_description);
      }
    }

    // Популярность папок: доля от самой большой папки пользователя.
    const maxCount = Math.max(0, ...folders.map((f) => f.count));
    const popularity = new Map<string, number>();
    for (const f of folders) {
      popularity.set(f.id, maxCount > 0 ? f.count / maxCount : 0);
    }

    // 3. Скоринг + топ-N.
    const candidates: RecommendCandidate[] = pool.map((c) => ({
      id: c.id,
      estimatedMinutes: resolveEstimatedMinutes({
        estimatedMinutes: c.estimated_minutes,
        durationSeconds: c.duration_seconds,
        title: c.title,
        text: c.text,
        description: descByCard.get(c.id) ?? null,
        kind: c.primary_type,
      }),
      createdAt: c.created_at,
      folderIds: folderIdsByCard.get(c.id) ?? [],
      actionCount: actionsByCard.get(c.id) ?? 0,
    }));
    const ranked = rankCandidates(candidates, minutes, popularity, now);
    const top = ranked.slice(0, limit);

    const bookmarks = await getByIds(
      userId,
      top.map((t) => t.candidate.id)
    );
    const byId = new Map(bookmarks.map((b) => [b.id, b]));
    const items = top.flatMap((t) => {
      const bookmark = byId.get(t.candidate.id);
      return bookmark
        ? [{ bookmark, score: t.breakdown.total, breakdown: t.breakdown }]
        : [];
    });

    return NextResponse.json({ minutes, items, totalCandidates: pool.length });
  } catch (e) {
    console.error("Recommend error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
