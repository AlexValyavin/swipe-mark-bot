import { getAdminDb } from "@/lib/db/supabase";
import type { ProfileRow } from "@/lib/db/types";

export async function getProfileByTelegramId(
  telegramId: number
): Promise<ProfileRow | null> {
  const { data } = await getAdminDb()
    .from("profiles")
    .select("*")
    .eq("telegram_id", telegramId)
    .maybeSingle();
  return data;
}

export async function getProfileByEmail(email: string): Promise<ProfileRow | null> {
  const { data } = await getAdminDb()
    .from("profiles")
    .select("*")
    .eq("email", email)
    .maybeSingle();
  return data;
}

export async function getProfileById(id: string): Promise<ProfileRow | null> {
  const { data } = await getAdminDb()
    .from("profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data;
}

export async function getOrCreateProfileByTelegramId(
  telegramId: number,
  extra?: { telegramUsername?: string | null; displayName?: string | null }
): Promise<ProfileRow> {
  const existing = await getProfileByTelegramId(telegramId);
  if (existing) {
    const patch: Partial<ProfileRow> = {
      telegram_username: extra?.telegramUsername ?? existing.telegram_username,
      display_name: extra?.displayName ?? existing.display_name,
      updated_at: new Date().toISOString(),
    };
    await getAdminDb().from("profiles").update(patch).eq("id", existing.id);
    return { ...existing, ...patch };
  }

  const { data, error } = await getAdminDb()
    .from("profiles")
    .insert({
      telegram_id: telegramId,
      telegram_username: extra?.telegramUsername ?? null,
      display_name: extra?.displayName ?? null,
      email: null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as ProfileRow;
}

export async function getOrCreateProfileByEmail(email: string): Promise<ProfileRow> {
  const existing = await getProfileByEmail(email);
  if (existing) return existing;

  const { data, error } = await getAdminDb()
    .from("profiles")
    .insert({ email, telegram_id: null })
    .select("*")
    .single();
  if (error) throw error;
  return data as ProfileRow;
}