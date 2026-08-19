import { getAdminDb } from "@/lib/db/supabase";
import type { UserSettingsRow } from "@/lib/db/types";

export type UiScale = "s" | "m" | "l";

const UI_SCALE_VALUES: UiScale[] = ["s", "m", "l"];

export function isUiScale(v: unknown): v is UiScale {
  return typeof v === "string" && (UI_SCALE_VALUES as string[]).includes(v);
}

export async function getUiScale(userId: string): Promise<UiScale> {
  const { data } = await getAdminDb()
    .from("user_settings")
    .select("ui_scale")
    .eq("user_id", userId)
    .maybeSingle();
  return isUiScale(data?.ui_scale) ? data.ui_scale : "m";
}

export async function setUiScale(userId: string, scale: UiScale): Promise<void> {
  const now = new Date().toISOString();
  const existing = await getAdminDb()
    .from("user_settings")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing.data) {
    const { error } = await getAdminDb()
      .from("user_settings")
      .update({ ui_scale: scale, updated_at: now })
      .eq("user_id", userId);
    if (error) throw error;
  } else {
    const { error } = await getAdminDb()
      .from("user_settings")
      .insert({
        user_id: userId,
        ai_mode: "off",
        archive_ttl_hours: null,
        ui_scale: scale,
        updated_at: now,
      });
    if (error) throw error;
  }
}

export async function getOnboarded(userId: string): Promise<boolean> {
  const { data } = await getAdminDb()
    .from("user_settings")
    .select("onboarded")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.onboarded === true;
}

export async function setOnboarded(userId: string, onboarded: boolean): Promise<void> {
  const now = new Date().toISOString();
  const existing = await getAdminDb()
    .from("user_settings")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing.data) {
    const { error } = await getAdminDb()
      .from("user_settings")
      .update({ onboarded, updated_at: now })
      .eq("user_id", userId);
    if (error) throw error;
  } else {
    const { error } = await getAdminDb()
      .from("user_settings")
      .insert({
        user_id: userId,
        ai_mode: "off",
        archive_ttl_hours: null,
        onboarded,
        updated_at: now,
      });
    if (error) throw error;
  }
}

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
  const row = data as {
    ai_provider: string | null;
    ai_key_enc: string | null;
    ai_model: string | null;
    ai_custom_base_url: string | null;
    ai_mode: string;
  };
  return {
    provider: row.ai_provider,
    ai_key_enc: row.ai_key_enc,
    ai_model: row.ai_model,
    ai_custom_base_url: row.ai_custom_base_url,
    ai_mode: row.ai_mode,
  };
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