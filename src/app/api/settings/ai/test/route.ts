import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/session";
import { getAiSettings } from "@/lib/db/settings";
import { decryptSecret } from "@/lib/crypto";
import {
  chatCompletion,
  PROVIDER_DEFAULT_MODELS,
  type AiProvider,
  type AiError,
} from "@/lib/ai/adapter";

export const runtime = "nodejs";

const testSchema = z.object({
  provider: z.enum(["openrouter", "mistral", "openai", "custom"]).optional(),
  key: z.string().min(1).max(1000).optional(),
  model: z.string().min(1).max(200).optional(),
  customBaseUrl: z.string().max(500).optional(),
});

// In-memory rate limit: 5 запросов на пользователя в минуту.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 5;
const hits = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = hits.get(userId);
  if (!entry || now - entry.windowStart >= RATE_WINDOW_MS) {
    hits.set(userId, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= RATE_MAX) return false;
  entry.count += 1;
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getSessionUser(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!checkRateLimit(userId)) {
      return NextResponse.json(
        { ok: false, error: "Rate limit exceeded (5/min)" },
        { status: 429 }
      );
    }

    const body = testSchema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json(
        { ok: false, error: "Bad request", details: body.error.flatten() },
        { status: 400 }
      );
    }

    const saved = await getAiSettings(userId);
    const provider: AiProvider = body.data.provider ?? (saved?.provider as AiProvider) ?? "openrouter";

    // Ключ: из тела или из сохранённого (зашифрованного).
    let apiKey = body.data.key;
    if (!apiKey && saved?.ai_key_enc) {
      try {
        apiKey = decryptSecret(saved.ai_key_enc);
      } catch (e) {
        console.error("AI key decrypt failed:", e);
        return NextResponse.json({
          ok: false,
          error: "Stored key cannot be decrypted",
        });
      }
    }
    if (!apiKey) {
      return NextResponse.json({
        ok: false,
        error: "No API key configured",
      });
    }

    const model = body.data.model ?? saved?.ai_model ?? PROVIDER_DEFAULT_MODELS[provider];
    const baseUrl =
      body.data.customBaseUrl ?? saved?.ai_custom_base_url ?? undefined;

    const startedAt = Date.now();
    try {
      const result = await chatCompletion({
        provider,
        apiKey,
        model,
        baseUrl,
        messages: [{ role: "user", content: "Ping" }],
        maxTokens: 8,
      });
      return NextResponse.json({
        ok: true,
        model: result.model,
        latencyMs: Date.now() - startedAt,
      });
    } catch (e) {
      const kind = (e as AiError)?.kind ?? "network";
      const message = e instanceof Error ? e.message : "Unknown error";
      const status = kind === "auth" ? 401 : kind === "rate" ? 429 : 200;
      return NextResponse.json({
        ok: false,
        kind,
        error: message,
        latencyMs: Date.now() - startedAt,
      });
    }
  } catch (e) {
    console.error("Settings AI test error:", e);
    return NextResponse.json(
      { ok: false, error: "Server error" },
      { status: 500 }
    );
  }
}
