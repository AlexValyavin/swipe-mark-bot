import { NextRequest, NextResponse } from "next/server";
import { getOwnerContext } from "@/lib/auth/owner";
import { getAdminDb } from "@/lib/db/supabase";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const owner = await getOwnerContext(req);
    if (!owner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await ctx.params;

    const db = getAdminDb();
    const { error } = await db
      .from("cards")
      .update({ status: "new", defer_until: null, archived_at: null, updated_at: new Date().toISOString() })
      .eq("user_id", id);
    if (error) throw error;

    await db.from("swipe_actions").delete().eq("user_id", id);
    // also clear progress-related ai suggestions? keep ai_summary

    try {
      await db.from("admin_log").insert({
        actor_tg: owner.profile.telegram_id,
        actor_user_id: owner.userId,
        action: "reset_progress",
        target_user_id: id,
        details: {},
      });
    } catch {}

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Admin reset-progress error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
