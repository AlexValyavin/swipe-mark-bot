import crypto from "crypto";
import { getAdminDb } from "@/lib/db/supabase";
import type { ParsedMeta } from "./parsers";

export const META_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hashUrl(url: string): string {
  return crypto.createHash("sha256").update(url).digest("hex");
}

export function urlHash(url: string): string {
  return hashUrl(url);
}

/** Ленивая чистка устаревших записей (вызывается при записи). */
export async function pruneMetaCache(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - META_CACHE_TTL_MS).toISOString();
    await getAdminDb().from("meta_cache").delete().lt("created_at", cutoff);
  } catch (e) {
    console.error("meta_cache prune error:", e);
  }
}

export async function getMetaFromCache(url: string): Promise<ParsedMeta | null> {
  const { data } = await getAdminDb()
    .from("meta_cache")
    .select("data")
    .eq("url_hash", hashUrl(url))
    .maybeSingle();
  if (!data) return null;
  return (data.data as ParsedMeta) ?? null;
}

export async function putMetaToCache(
  url: string,
  provider: string,
  meta: ParsedMeta
): Promise<void> {
  try {
    const db = getAdminDb();
    const { data: existing } = await db.from("meta_cache").select("url_hash").eq("url_hash", hashUrl(url)).maybeSingle();
    const payload = {
      url,
      provider,
      data: meta,
      created_at: new Date().toISOString(),
    };
    if (existing) {
      await db.from("meta_cache").update(payload).eq("url_hash", hashUrl(url));
    } else {
      await db.from("meta_cache").insert({ ...payload, url_hash: hashUrl(url) });
    }
    await pruneMetaCache();
  } catch (e) {
    console.error("meta_cache put error:", e);
  }
}