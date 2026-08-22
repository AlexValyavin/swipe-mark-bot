import { NextRequest, NextResponse } from "next/server";
import { getOwnerContext, isOwner } from "@/lib/auth/owner";
import { getAdminDb } from "@/lib/db/supabase";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isOwner(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await ctx.params;
    const db = getAdminDb();
    const { data: profile } = await db.from("profiles").select("*").eq("id", id).maybeSingle();
    if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { data: settings } = await db.from("user_settings").select("*").eq("user_id", id).maybeSingle();
    const { count: saved } = await db.from("cards").select("id", { count: "exact", head: true }).eq("user_id", id);
    const { data: recentUsage } = await db
      .from("ai_usage")
      .select("kind, status, created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(20);

    return NextResponse.json({ profile, settings, stats: { saved: saved ?? 0 }, recentUsage: recentUsage ?? [] });
  } catch (e) {
    console.error("Admin user GET error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const owner = await getOwnerContext(req);
    if (!owner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await ctx.params;

    const db = getAdminDb();
    const { data: profile } = await db.from("profiles").select("telegram_id").eq("id", id).maybeSingle();
    if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Use same logic as reset-user.ts but via DB deletes
    const { data: cards } = await db.from("cards").select("id").eq("user_id", id);
    const cardIds = (cards ?? []).map((c: { id: string }) => c.id);
    const { data: folders } = await db.from("folders").select("id").eq("user_id", id);
    const folderIds = (folders ?? []).map((f: { id: string }) => f.id);
    const { data: tags } = await db.from("tags").select("id").eq("user_id", id);
    const tagIds = (tags ?? []).map((t: { id: string }) => t.id);

    async function del(table: string, column: string, values: string[]) {
      if (values.length === 0) return;
      const { error } = await db.from(table as never).delete().in(column as never, values);
      if (error) throw new Error(`${table}: ${error.message}`);
    }

    await del("card_folders", "card_id", cardIds);
    await del("card_folders", "folder_id", folderIds);
    await del("card_tags", "card_id", cardIds);
    await del("card_tags", "tag_id", tagIds);
    await del("attachments", "card_id", cardIds);
    await del("card_links", "card_id", cardIds);
    await del("swipe_actions", "card_id", cardIds);
    await del("swipe_actions", "user_id", [id]);
    await del("cards", "id", cardIds);
    await del("folders", "id", folderIds);
    await del("tags", "id", tagIds);
    await db.from("bulk_jobs").delete().eq("user_id", id);
    await db.from("ai_usage").delete().eq("user_id", id);
    await db.from("user_settings").delete().eq("user_id", id);
    await db.from("pairing_codes").delete().eq("user_id", id);
    await db.from("admin_log").delete().eq("target_user_id", id);
    await db.from("profiles").delete().eq("id", id);

    try {
      await db.from("admin_log").insert({
        actor_tg: owner.profile.telegram_id,
        actor_user_id: owner.userId,
        action: "full_delete",
        target_user_id: id,
        details: { telegram_id: profile.telegram_id },
      });
    } catch {}

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Admin user DELETE error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
