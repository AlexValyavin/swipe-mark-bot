import { NextRequest, NextResponse } from "next/server";
import { getOwnerContext } from "@/lib/auth/owner";
import { getAdminDb } from "@/lib/db/supabase";

export const runtime = "nodejs";

async function del(table: string, column: string, values: string[]) {
  if (values.length === 0) return;
  const { error } = await getAdminDb().from(table as never).delete().in(column as never, values);
  if (error) throw new Error(`${table}: ${error.message}`);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const owner = await getOwnerContext(req);
    if (!owner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await ctx.params;

    const db = getAdminDb();
    const { data: cards } = await db.from("cards").select("id").eq("user_id", id);
    const cardIds = (cards ?? []).map((c: { id: string }) => c.id);
    const { data: folders } = await db.from("folders").select("id").eq("user_id", id);
    const folderIds = (folders ?? []).map((f: { id: string }) => f.id);
    const { data: tags } = await db.from("tags").select("id").eq("user_id", id);
    const tagIds = (tags ?? []).map((t: { id: string }) => t.id);

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
    // keep profile, user_settings, pairing
    await db.from("bulk_jobs").delete().eq("user_id", id);
    await db.from("ai_usage").delete().eq("user_id", id);

    try {
      await db.from("admin_log").insert({
        actor_tg: owner.profile.telegram_id,
        actor_user_id: owner.userId,
        action: "reset_library",
        target_user_id: id,
        details: { cardIds: cardIds.length, folderIds: folderIds.length, tagIds: tagIds.length },
      });
    } catch {}

    return NextResponse.json({ ok: true, deleted: { cards: cardIds.length } });
  } catch (e) {
    console.error("Admin reset-library error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
