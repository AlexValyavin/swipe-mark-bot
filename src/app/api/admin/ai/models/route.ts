import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isOwner } from "@/lib/auth/owner";
import { decryptSecret } from "@/lib/crypto";
import { getGlobalAiRaw } from "@/lib/db/appConfig";
import { listModels, type AiProvider, type AiError } from "@/lib/ai/adapter";

export const runtime = "nodejs";

const querySchema = z.object({
  provider: z.enum(["openrouter", "mistral", "openai", "custom"]).optional(),
  baseUrl: z.string().max(500).optional(),
});

export async function GET(req: NextRequest) {
  try {
    if (!(await isOwner(req))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const parsed = querySchema.safeParse({
      provider: url.searchParams.get("provider") || undefined,
      baseUrl: url.searchParams.get("baseUrl") || undefined,
    });

    // Берём ключ из app_config, с фолбэком на env OPENROUTER_API_KEY
    const raw = await getGlobalAiRaw();
    let apiKey: string | null = null;
    let storedProvider: string | null = null;
    let storedBaseUrl: string | null = null;
    if (raw?.keyEnc) {
      try {
        apiKey = decryptSecret(raw.keyEnc);
      } catch (e) {
        console.error("Admin models decrypt failed:", e);
        return NextResponse.json({ error: "Decrypt failed — AI_KEY_SECRET mismatch" }, { status: 500 });
      }
      storedProvider = raw.provider ?? null;
      storedBaseUrl = raw.baseUrl ?? null;
    }
    if (!apiKey) {
      const envKey = process.env.OPENROUTER_API_KEY?.trim() || null;
      if (envKey) {
        apiKey = envKey;
        storedProvider = "openrouter";
      }
    }
    if (!apiKey) {
      return NextResponse.json({ error: "No API key configured — сохраните ключ" }, { status: 400 });
    }

    const provider = (parsed.success && parsed.data.provider ? parsed.data.provider : storedProvider) as AiProvider;
    const rawBase = parsed.success && parsed.data.baseUrl !== undefined && parsed.data.baseUrl !== "" ? parsed.data.baseUrl : storedBaseUrl;
    const baseUrl = rawBase && rawBase.trim() ? rawBase.trim() : undefined;

    try {
      const models = await listModels(provider ?? "openrouter", apiKey, baseUrl);
      return NextResponse.json({ models });
    } catch (e) {
      const kind = (e as AiError)?.kind ?? "network";
      const message = e instanceof Error ? e.message : "Unknown error";
      const status = kind === "auth" ? 401 : kind === "rate" ? 429 : 500;
      return NextResponse.json({ kind, error: message }, { status });
    }
  } catch (e) {
    console.error("Admin AI models error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
