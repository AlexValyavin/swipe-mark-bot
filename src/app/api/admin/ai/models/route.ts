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

    // Берём ключ из app_config (глобальный), а если передан provider — используем его
    const raw = await getGlobalAiRaw();
    if (!raw?.keyEnc) {
      return NextResponse.json({ error: "No API key configured" }, { status: 400 });
    }
    let apiKey: string | null = null;
    try {
      apiKey = decryptSecret(raw.keyEnc);
    } catch {}
    if (!apiKey) {
      return NextResponse.json({ error: "No API key configured" }, { status: 400 });
    }

    const provider = (parsed.success && parsed.data.provider ? parsed.data.provider : raw.provider) as AiProvider;
    const baseUrl = parsed.success && parsed.data.baseUrl !== undefined ? parsed.data.baseUrl : raw.baseUrl;

    try {
      const models = await listModels(provider ?? "openrouter", apiKey, baseUrl ?? undefined);
      return NextResponse.json({ models });
    } catch (e) {
      const kind = (e as AiError)?.kind ?? "network";
      const message = e instanceof Error ? e.message : "Unknown error";
      const status = kind === "auth" ? 401 : kind === "rate" ? 429 : 200;
      return NextResponse.json({ kind, error: message }, { status });
    }
  } catch (e) {
    console.error("Admin AI models error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
