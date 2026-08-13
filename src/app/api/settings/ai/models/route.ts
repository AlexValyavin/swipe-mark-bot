import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getAiSettings } from "@/lib/db/settings";
import { decryptSecret } from "@/lib/crypto";
import {
  listModels,
  type AiProvider,
  type AiError,
} from "@/lib/ai/adapter";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const userId = await getSessionUser(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const s = await getAiSettings(userId);
    const provider = (s?.provider as AiProvider) ?? "openrouter";
    let apiKey: string | null = null;
    if (s?.ai_key_enc) {
      try {
        apiKey = decryptSecret(s.ai_key_enc);
      } catch (e) {
        console.error("AI key decrypt failed:", e);
      }
    }

    if (!apiKey) {
      return NextResponse.json({ error: "No API key configured" }, { status: 400 });
    }

    try {
      const models = await listModels(
        provider,
        apiKey,
        s?.ai_custom_base_url ?? undefined
      );
      return NextResponse.json({ models });
    } catch (e) {
      const kind = (e as AiError)?.kind ?? "network";
      const message = e instanceof Error ? e.message : "Unknown error";
      const status = kind === "auth" ? 401 : kind === "rate" ? 429 : 200;
      return NextResponse.json({ kind, error: message }, { status });
    }
  } catch (e) {
    console.error("Settings AI models error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}