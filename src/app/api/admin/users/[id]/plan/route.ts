import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerContext } from "@/lib/auth/owner";
import { getAdminDb } from "@/lib/db/supabase";

export const runtime = "nodejs";

const schema = z.object({
  plan: z.enum(["free", "beta", "pro", "blocked"]),
  plan_until: z.string().nullable().optional(), // ISO or null
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const owner = await getOwnerContext(req);
    if (!owner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await ctx.params;
    const body = schema.safeParse(await req.json());
    if (!body.success) return NextResponse.json({ error: "Bad request", details: body.error.flatten() }, { status: 400 });

    const patch: Record<string, unknown> = { plan: body.data.plan, updated_at: new Date().toISOString() };
    if (body.data.plan_until !== undefined) {
      patch.plan_until = body.data.plan_until ? new Date(body.data.plan_until).toISOString() : null;
    }
    // beta без даты -> бессрочно? оставляем null
    if (body.data.plan === "beta" && body.data.plan_until === undefined) {
      // не трогаем существующий plan_until
      delete patch.plan_until;
    }
    if (body.data.plan !== "beta") patch.plan_until = null;

    const { error } = await getAdminDb().from("profiles").update(patch).eq("id", id);
    if (error) throw error;

    try {
      await getAdminDb().from("admin_log").insert({
        actor_tg: owner.profile.telegram_id,
        actor_user_id: owner.userId,
        action: "plan_change",
        target_user_id: id,
        details: { plan: body.data.plan, plan_until: body.data.plan_until ?? null },
      });
    } catch {}

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Admin plan error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
