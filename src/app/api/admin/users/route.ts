import { NextRequest, NextResponse } from "next/server";
import { isOwner } from "@/lib/auth/owner";
import { getAdminDb } from "@/lib/db/supabase";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    if (!(await isOwner(req))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim();
    const limit = Math.min(Number(url.searchParams.get("limit") || 50), 100);
    const offset = Number(url.searchParams.get("offset") || 0);

    const db = getAdminDb();

    let query = db
      .from("profiles")
      .select("id, telegram_id, telegram_username, display_name, plan, plan_until, created_at, updated_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (q) {
      // поиск по username/display_name/telegram_id
      const isNum = /^\d+$/.test(q);
      if (isNum) {
        query = query.or(`telegram_id.eq.${q},telegram_username.ilike.%${q}%,display_name.ilike.%${q}%`);
      } else {
        query = query.or(`telegram_username.ilike.%${q}%,display_name.ilike.%${q}%`);
      }
    }

    const { data: profiles, error, count } = await query;
    if (error) throw error;

    // Для каждого профиля считаем агрегаты (карты + unsorted + ai_usage месяц)
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

    const enriched = await Promise.all(
      (profiles ?? []).map(async (p: { id: string; updated_at: string }) => {
        const [cardsRes, foldersRes, usageRes] = await Promise.all([
          db.from("cards").select("id, created_at", { count: "exact", head: true }).eq("user_id", p.id),
          db.from("card_folders").select("card_id").in("card_id", ((await db.from("cards").select("id").eq("user_id", p.id)).data?.map((c: { id: string }) => c.id) ?? ["00000000-0000-0000-0000-000000000000"])),
          db.from("ai_usage").select("kind, status").eq("user_id", p.id).gte("created_at", monthStart),
        ]);

        // unsorted = total new/later - in folders (упрощённо, как в getCountsForUser)
        const totalRes = await db
          .from("cards")
          .select("id", { count: "exact", head: true })
          .eq("user_id", p.id)
          .in("status", ["new", "later"]);
        const excluded = new Set((foldersRes.data ?? []).map((r: { card_id: string }) => r.card_id));
        const unsorted = Math.max((totalRes.count ?? 0) - excluded.size, 0);

        const autosortUsed = (usageRes.data ?? []).filter((u: { kind: string; status: string }) => u.kind === "autosort" && u.status !== "failed").length;
        const summaryUsed = (usageRes.data ?? []).filter((u: { kind: string; status: string }) => u.kind === "summary" && u.status !== "failed").length;

        // последняя активность = max(cards.created_at, updated_at)
        const lastActivity = p.updated_at;

        return {
          ...p,
          stats: {
            saved: cardsRes.count ?? 0,
            unsorted,
            autosortUsed,
            summaryUsed,
            lastActivity,
          },
        };
      })
    );

    return NextResponse.json({ users: enriched, total: count ?? enriched.length });
  } catch (e) {
    console.error("Admin users list error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
