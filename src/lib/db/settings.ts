import { getAdminDb } from "@/lib/db/supabase";
import type { UserSettingsRow } from "@/lib/db/types";

export type AiSettings = {
  provider: string | null;
  ai_key_enc: string | null;
  ai_model: string | null;
  ai_custom_base_url: string | null;
  ai_mode: string;
};

export async function getArchiveTtl(userId: string): Promise<number | null> {
  const { data } = await getAdminDb()
    .from("user_settings")
    .select("archive_ttl_hours")
    .eq("user_id", userId)
    .maybeSingle();
  return typeof data?.archive_ttl_hours === "number" ? data.archive_ttl_hours : null;
}

export async function setArchiveTtl(
  userId: string,
  archiveTtlHours: number | null
): Promise<void> {
  const now = new Date().toISOString();
  const existing = await getAdminDb()
    .from("user_settings")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing.data) {
    await getAdminDb()
      .from("user_settings")
      .update({ archive_ttl_hours: archiveTtlHours, updated_at: now })
      .eq("user_id", userId);
  } else {
    await getAdminDb()
      .from("user_settings")
      .insert({
        user_id: userId,
        ai_mode: "off",
        archive_ttl_hours: archiveTtlHours,
        updated_at: now,
      });
  }
}

export async function getAiSettings(userId: string): Promise<AiSettings | null> {
  const { data, error } = await getAdminDb()
    .from("user_settings")
    .select("ai_provider, ai_key_enc, ai_model, ai_custom_base_url, ai_mode")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return data as unknown as AiSettings;
}

export async function upsertAiSettings(
  userId: string,
  patch: Partial<AiSettings>
): Promise<void> {
  const now = new Date().toISOString();
  const existing = await getAdminDb()
    .from("user_settings")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing.data) {
    const { error } = await getAdminDb()
      .from("user_settings")
      .update({ ...patch, updated_at: now })
      .eq("user_id", userId);
    if (error) throw error;
  } else {
    const { error } = await getAdminDb()
      .from("user_settings")
      .insert({
        user_id: userId,
        ai_mode: "off",
        archive_ttl_hours: null,
        ...patch,
        updated_at: now,
      });
    if (error) throw error;
  }
}