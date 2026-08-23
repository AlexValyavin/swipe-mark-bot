import { NextRequest, NextResponse } from "next/server";
import { isOwner } from "@/lib/auth/owner";
import { decryptSecret } from "@/lib/crypto";
import { getGlobalAiRaw } from "@/lib/db/appConfig";
import { chatCompletion, PROVIDER_DEFAULT_MODELS, type AiProvider, type AiError } from "@/lib/ai/adapter";

export const runtime = "nodejs";

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 5;
const hits = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now - entry.windowStart >= RATE_WINDOW_MS) {
    hits.set(key, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= RATE_MAX) return false;
  entry.count += 1;
  return true;
}

export async function POST(req: NextRequest) {
  try {
    if (!(await isOwner(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const ownerKey = "admin:" + (process.env.OWNER_TELEGRAM_ID || "0");
    if (!checkRateLimit(ownerKey)) {
      return NextResponse.json({ ok: false, error: "Rate limit exceeded (5/min)" }, { status: 429 });
    }

    const raw = await getGlobalAiRaw();
    let apiKey: string | null = null;
    let provider: AiProvider = (raw?.provider as AiProvider) ?? "openrouter";
    let model: string | null = raw?.model ?? null;
    const baseUrl: string | undefined = raw?.baseUrl ?? undefined;

    if (raw?.keyEnc) {
      try { apiKey = decryptSecret(raw.keyEnc); } catch {}
    }
    if (!apiKey) {
      const envKey = process.env.OPENROUTER_API_KEY?.trim() || null;
      if (envKey) { apiKey = envKey; provider = "openrouter"; model = process.env.AI_MODEL?.trim() || model; }
    }
    if (!apiKey) return NextResponse.json({ ok: false, error: "No API key configured" });

    if (!model) model = PROVIDER_DEFAULT_MODELS[provider] ?? PROVIDER_DEFAULT_MODELS.openrouter;

    const startedAt = Date.now();
    try {
      const result = await chatCompletion({ provider, apiKey, model, baseUrl, messages: [{ role: "user", content: "Ping" }], maxTokens: 8 });
      return NextResponse.json({ ok: true, model: result.model, latencyMs: Date.now() - startedAt });
    } catch (e) {
      const kind = (e as AiError)?.kind ?? "network";
      const message = e instanceof Error ? e.message : "Unknown error";
      return NextResponse.json({ ok: false, kind, error: message, latencyMs: Date.now() - startedAt });
    }
  } catch (e) {
    console.error("Admin AI test error:", e);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
