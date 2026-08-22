import { NextRequest, NextResponse } from "next/server";
import { getOwnerContext } from "@/lib/auth/owner";
import { getAdminDb } from "@/lib/db/supabase";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const owner = await getOwnerContext(req);
    if (!owner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await ctx.params;
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

    const { error } = await getAdminDb().from("ai_usage").delete().eq("user_id", id).gte("created_at", monthStart);
    if (error) throw error;

    try {
      await getAdminDb().from("admin_log").insert({
        actor_tg: owner.profile.telegram_id,
        actor_user_id: owner.userId,
        action: "reset_limits",
        target_user_id: id,
        details: { monthStart },
      });
    } catch {}

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Admin reset-limits error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
