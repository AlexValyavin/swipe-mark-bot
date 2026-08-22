import { getAdminDb } from "@/lib/db/supabase";
import { decryptSecret, encryptSecret, maskKey } from "@/lib/crypto";
import type { Json } from "@/lib/db/types";

export type GlobalAiConfig = {
  provider: string; // openrouter | mistral | openai | custom
  model: string | null;
  baseUrl: string | null;
  hasKey: boolean;
  keyMask: string | null;
  allowByok: boolean;
  updatedAt?: string;
};

type StoredGlobalAi = {
  provider?: string;
  keyEnc?: string | null;
  model?: string | null;
  baseUrl?: string | null;
  allowByok?: boolean;
};

const GLOBAL_KEY = "ai_global";

function decryptOrNull(enc?: string | null): string | null {
  if (!enc) return null;
  try {
    return decryptSecret(enc);
  } catch {
    return null;
  }
}

export async function getGlobalAiConfig(): Promise<GlobalAiConfig | null> {
  const db = getAdminDb();
  const { data, error } = await db.from("app_config").select("value, updated_at").eq("key", GLOBAL_KEY).maybeSingle();
  if (error || !data) return null;
  const v = (data as { value: Json; updated_at: string }).value as StoredGlobalAi;
  const key = decryptOrNull(v.keyEnc ?? null);
  return {
    provider: v.provider || "openrouter",
    model: v.model ?? null,
    baseUrl: v.baseUrl ?? null,
    hasKey: !!key,
    keyMask: key ? maskKey(key) : null,
    allowByok: v.allowByok ?? false,
    updatedAt: (data as { updated_at: string }).updated_at,
  };
}

export async function getGlobalAiRaw(): Promise<StoredGlobalAi | null> {
  const { data } = await getAdminDb().from("app_config").select("value").eq("key", GLOBAL_KEY).maybeSingle();
  if (!data) return null;
  return (data as { value: Json }).value as StoredGlobalAi;
}

export async function setGlobalAiConfig(patch: {
  provider?: string;
  key?: string | null;
  clearKey?: boolean;
  model?: string | null;
  baseUrl?: string | null;
  allowByok?: boolean;
}): Promise<GlobalAiConfig> {
  const current = (await getGlobalAiRaw()) || {};
  const next: StoredGlobalAi = { ...current };

  if (patch.provider !== undefined) next.provider = patch.provider;
  if (patch.clearKey) next.keyEnc = null;
  else if (patch.key !== undefined) {
    next.keyEnc = patch.key ? encryptSecret(patch.key) : null;
  }
  if (patch.model !== undefined) next.model = patch.model;
  if (patch.baseUrl !== undefined) next.baseUrl = patch.baseUrl;
  if (patch.allowByok !== undefined) next.allowByok = patch.allowByok;

  const db = getAdminDb();
  const { error } = await db
    .from("app_config")
    .upsert({ key: GLOBAL_KEY, value: next as unknown as Json, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw error;
  const cfg = await getGlobalAiConfig();
  if (!cfg) throw new Error("Failed to read global AI config");
  return cfg;
}

export function resolveGlobalEnvFallback(): { provider: string; model: string; key: string | null } | null {
  const key = process.env.OPENROUTER_API_KEY?.trim() || null;
  if (!key) return null;
  return {
    provider: "openrouter",
    model: process.env.AI_MODEL?.trim() || "deepseek/deepseek-v4-flash-0731",
    key,
  };
}
