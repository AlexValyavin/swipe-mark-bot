import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isOwner, getOwnerContext } from "@/lib/auth/owner";
import { getGlobalAiConfig, setGlobalAiConfig, resolveGlobalEnvFallback } from "@/lib/db/appConfig";
import { getAdminDb } from "@/lib/db/supabase";
import type { AiProvider } from "@/lib/ai/adapter";

export const runtime = "nodejs";

const putSchema = z.object({
  provider: z.enum(["openrouter", "mistral", "openai", "custom"]).optional(),
  key: z.string().min(1).max(2000).optional(),
  clearKey: z.boolean().optional(),
  model: z.string().min(1).max(200).optional(),
  customBaseUrl: z.string().max(500).optional(),
  allowByok: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  try {
    if (!(await isOwner(req))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const cfg = await getGlobalAiConfig();
    const envFallback = resolveGlobalEnvFallback();

    // Если в БД пусто — показать env как подсказку, но hasKey=false пока не сохранён
    if (!cfg && envFallback) {
      return NextResponse.json({
        provider: envFallback.provider as AiProvider,
        model: envFallback.model,
        hasKey: false,
        keyMask: null,
        customBaseUrl: null,
        allowByok: false,
        source: "env",
        envModel: envFallback.model,
      });
    }
    if (!cfg) {
      return NextResponse.json({
        provider: "openrouter" as AiProvider,
        model: null,
        hasKey: false,
        keyMask: null,
        customBaseUrl: null,
        allowByok: false,
        source: "db",
      });
    }
    return NextResponse.json({
      provider: cfg.provider as AiProvider,
      model: cfg.model,
      hasKey: cfg.hasKey,
      keyMask: cfg.keyMask,
      customBaseUrl: cfg.baseUrl,
      allowByok: cfg.allowByok,
      source: "db",
      updatedAt: cfg.updatedAt,
    });
  } catch (e) {
    console.error("Admin AI GET error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const ctx = await getOwnerContext(req);
    if (!ctx) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = putSchema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json({ error: "Bad request", details: body.error.flatten() }, { status: 400 });
    }

    const patch: {
      provider?: string;
      key?: string | null;
      clearKey?: boolean;
      model?: string | null;
      baseUrl?: string | null;
      allowByok?: boolean;
    } = {};

    if (body.data.provider !== undefined) patch.provider = body.data.provider;
    if (body.data.clearKey) patch.clearKey = true;
    else if (body.data.key !== undefined) patch.key = body.data.key;
    if (body.data.model !== undefined) patch.model = body.data.model;
    if (body.data.customBaseUrl !== undefined) {
      let url = body.data.customBaseUrl.trim();
      if (url && !/^https?:\/\//i.test(url)) url = `http://${url}`;
      patch.baseUrl = url || null;
    }
    if (body.data.allowByok !== undefined) patch.allowByok = body.data.allowByok;

    const cfg = await setGlobalAiConfig(patch);

    // audit log
    try {
      await getAdminDb()
        .from("admin_log")
        .insert({
          actor_tg: ctx.profile.telegram_id,
          actor_user_id: ctx.userId,
          action: "ai_global_update",
          details: {
            provider: patch.provider,
            model: patch.model,
            hasKey: patch.key !== undefined ? !!patch.key : undefined,
            clearKey: patch.clearKey,
            allowByok: patch.allowByok,
          },
        });
    } catch {}

    return NextResponse.json({
      provider: cfg.provider as AiProvider,
      model: cfg.model,
      hasKey: cfg.hasKey,
      keyMask: cfg.keyMask,
      customBaseUrl: cfg.baseUrl,
      allowByok: cfg.allowByok,
      updatedAt: cfg.updatedAt,
    });
  } catch (e) {
    console.error("Admin AI PUT error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
