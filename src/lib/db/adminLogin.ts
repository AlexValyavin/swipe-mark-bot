import crypto from "crypto";
import { getAdminDb } from "@/lib/db/supabase";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;
const CODE_TTL_MS = 5 * 60 * 1000; // 5 мин для админ-входа

function generateCode(): string {
  let code = "admin_";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return code;
}

export async function generateAdminLoginCode(): Promise<{ code: string; expiresAt: string }> {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
  const { error } = await getAdminDb().from("admin_login_codes").insert({ code, expires_at: expiresAt });
  if (error) throw error;
  return { code, expiresAt };
}

export async function getAdminLoginCode(code: string): Promise<{ code: string; telegram_id: number | null; expires_at: string; used_at: string | null } | null> {
  const { data, error } = await getAdminDb()
    .from("admin_login_codes")
    .select("code, telegram_id, expires_at, used_at")
    .eq("code", code)
    .maybeSingle();
  if (error || !data) return null;
  return data as { code: string; telegram_id: number | null; expires_at: string; used_at: string | null };
}

export async function consumeAdminLoginCode(code: string): Promise<{ code: string; telegram_id: number | null; expires_at: string } | null> {
  const row = await getAdminLoginCode(code);
  if (!row) return null;
  if (row.used_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return row;
}

export async function markAdminCodeUsed(code: string, telegramId: number): Promise<void> {
  await getAdminDb()
    .from("admin_login_codes")
    .update({ telegram_id: telegramId, used_at: new Date().toISOString() })
    .eq("code", code);
}
