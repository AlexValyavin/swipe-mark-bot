import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/session";
import { getAiSettings, upsertAiSettings } from "@/lib/db/settings";
import { encryptSecret, maskKey } from "@/lib/crypto";
import {
  PROVIDER_DEFAULT_MODELS,
  type AiProvider,
} from "@/lib/ai/adapter";

export const runtime = "nodejs";

const PROVIDERS: AiProvider[] = ["openrouter", "mistral", "openai", "custom"];

const putSchema = z.object({
  provider: z.enum(["openrouter", "mistral", "openai", "custom"]).optional(),
  key: z.string().min(1).max(1000).optional(),
  clearKey: z.boolean().optional(),
  model: z.string().min(1).max(200).optional(),
  customBaseUrl: z.string().max(500).optional(),
  mode: z.enum(["off", "suggest", "auto"]).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const userId = await getSessionUser(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1) Глобальный конфиг из БД (admin) — с учётом allowByok
    try {
      const { getGlobalAiRaw } = await import("@/lib/db/appConfig");
      const { decryptSecret: dec } = await import("@/lib/crypto");
      const raw = await getGlobalAiRaw();
      if (raw?.keyEnc) {
        let gKey: string | null = null;
        try {
          gKey = dec(raw.keyEnc);
        } catch {}
        if (gKey) {
          const allowByok = raw.allowByok ?? false;
          if (!allowByok) {
            return NextResponse.json({
              provider: (raw.provider as AiProvider) ?? "openrouter",
              model: raw.model || "deepseek/deepseek-v4-flash-0731",
              mode: "auto",
              hasKey: true,
              keyMask: null,
              customBaseUrl: raw.baseUrl ?? null,
            });
          }
          // allowByok: если у юзера есть свой ключ — показываем его, иначе глобальный
          const sByok = await getAiSettings(userId);
          const hasByok = (() => {
            if (!sByok?.ai_key_enc) return false;
            try {
              const k = dec(sByok.ai_key_enc);
              return !!k && (sByok.ai_mode as string) !== "off";
            } catch {
              return false;
            }
          })();
          if (!hasByok) {
            return NextResponse.json({
              provider: (raw.provider as AiProvider) ?? "openrouter",
              model: raw.model || "deepseek/deepseek-v4-flash-0731",
              mode: "auto",
              hasKey: true,
              keyMask: null,
              customBaseUrl: raw.baseUrl ?? null,
            });
          }
          // есть BYOK — падаем в per-user ветку ниже
        }
      }
    } catch {}

    // 2) Env fallback (до миграции app_config)
    const globalKey = process.env.OPENROUTER_API_KEY?.trim();
    if (globalKey) {
      return NextResponse.json({
        provider: "openrouter",
        model: process.env.AI_MODEL?.trim() || "deepseek/deepseek-v4-flash-0731",
        mode: "auto",
        hasKey: true,
        keyMask: null,
        customBaseUrl: null,
      });
    }

    const s = await getAiSettings(userId);
    const provider = (s?.provider as AiProvider) ?? "openrouter";

    let keyMask: string | null = null;
    let hasKey = false;
    if (s?.ai_key_enc) {
      try {
        const { decryptSecret } = await import("@/lib/crypto");
        const plain = decryptSecret(s.ai_key_enc);
        hasKey = plain.length > 0;
        keyMask = hasKey ? maskKey(plain) : null;
      } catch (e) {
        console.error("AI key decrypt failed:", e);
        keyMask = null;
        hasKey = false;
      }
    }

    return NextResponse.json({
      provider,
      model: s?.ai_model ?? PROVIDER_DEFAULT_MODELS[provider],
      mode: s?.ai_mode ?? "off",
      hasKey,
      keyMask,
      customBaseUrl: s?.ai_custom_base_url ?? null,
    });
  } catch (e) {
    console.error("Settings AI error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await getSessionUser(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = putSchema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json(
        { error: "Bad request", details: body.error.flatten() },
        { status: 400 }
      );
    }

    const patch: {
      ai_provider?: string;
      ai_key_enc?: string | null;
      ai_model?: string;
      ai_custom_base_url?: string | null;
      ai_mode?: string;
    } = {};

    if (body.data.provider) patch.ai_provider = body.data.provider;

    if (body.data.key !== undefined) {
      patch.ai_key_enc = encryptSecret(body.data.key);
    }

    if (body.data.clearKey) {
      patch.ai_key_enc = null;
      patch.ai_mode = "off";
    }

    if (body.data.model !== undefined) patch.ai_model = body.data.model;

    if (body.data.customBaseUrl !== undefined) {
      let url = body.data.customBaseUrl.trim();
      if (url && !/^https?:\/\//i.test(url)) url = `http://${url}`;
      patch.ai_custom_base_url = url || null;
    }

    if (body.data.mode !== undefined) patch.ai_mode = body.data.mode;

    await upsertAiSettings(userId, patch);

    const s = await getAiSettings(userId);
    const provider = (s?.provider as AiProvider) ?? "openrouter";
    let keyMask: string | null = null;
    let hasKey = false;
    if (s?.ai_key_enc) {
      try {
        const { decryptSecret } = await import("@/lib/crypto");
        const plain = decryptSecret(s.ai_key_enc);
        hasKey = plain.length > 0;
        keyMask = hasKey ? maskKey(plain) : null;
      } catch {
        // оставляем hasKey=false
      }
    }

    return NextResponse.json({
      provider,
      model: s?.ai_model ?? PROVIDER_DEFAULT_MODELS[provider],
      mode: s?.ai_mode ?? "off",
      hasKey,
      keyMask,
      customBaseUrl: s?.ai_custom_base_url ?? null,
    });
  } catch (e) {
    console.error("Settings AI error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export { PROVIDERS };
