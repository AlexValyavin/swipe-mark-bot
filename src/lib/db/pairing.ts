import crypto from "crypto";
import { getAdminDb } from "@/lib/db/supabase";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;
const CODE_TTL_MS = 10 * 60 * 1000;

export async function getActivePairingCode(userId: string): Promise<{
  code: string;
  expiresAt: string;
} | null> {
  const { data } = await getAdminDb()
    .from("pairing_codes")
    .select("code, expires_at")
    .eq("user_id", userId)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { code: data.code, expiresAt: data.expires_at };
}

export async function generatePairingCode(userId: string): Promise<{
  code: string;
  expiresAt: string;
}> {
  const db = getAdminDb();

  await db
    .from("pairing_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("used_at", null);

  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }

  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  const { error } = await db.from("pairing_codes").insert({
    code,
    user_id: userId,
    expires_at: expiresAt.toISOString(),
  });
  if (error) throw error;

  return { code, expiresAt: expiresAt.toISOString() };
}

export async function consumePairingCode(code: string): Promise<string | null> {
  // Возвращает user_id профиля, если код валиден и ещё не использован.
  const db = getAdminDb();
  const { data, error } = await db
    .from("pairing_codes")
    .select("user_id, expires_at, used_at")
    .eq("code", code)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (data.used_at) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return data.user_id;
}

export async function markCodeUsed(code: string): Promise<void> {
  await getAdminDb()
    .from("pairing_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("code", code);
}

export async function isTelegramLinkedElsewhere(
  telegramId: number,
  exceptProfileId: string
): Promise<boolean> {
  const { data } = await getAdminDb()
    .from("profiles")
    .select("id")
    .eq("telegram_id", telegramId)
    .neq("id", exceptProfileId)
    .maybeSingle();
  return !!data;
}

export async function unlinkTelegram(profileId: string): Promise<void> {
  await getAdminDb()
    .from("profiles")
    .update({ telegram_id: null, telegram_username: null })
    .eq("id", profileId);
}

export async function linkTelegram(
  profileId: string,
  telegramId: number,
  telegramUsername?: string | null
): Promise<void> {
  const db = getAdminDb();
  const taken = await isTelegramLinkedElsewhere(telegramId, profileId);
  if (taken) {
    const err = new Error("Telegram already linked") as Error & { code?: string };
    err.code = "23505";
    throw err;
  }
  await db
    .from("profiles")
    .update({ telegram_id: telegramId, telegram_username: telegramUsername ?? null })
    .eq("id", profileId);
}