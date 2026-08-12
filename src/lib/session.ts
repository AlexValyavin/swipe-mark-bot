import crypto from "crypto";
import { NextRequest } from "next/server";
import { getProfileByTelegramId } from "@/lib/db/profiles";

const SESSION_COOKIE = "swipe_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

/** Валидирует Telegram initData (HMAC) и возвращает telegramId. */
export function verifyTelegramInitData(initData: string): {
  telegramId: number;
  telegramUsername?: string;
} | null {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const checkString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = crypto.createHmac("sha256", secret).update(checkString).digest("hex");

  if (hash !== expected) return null;

  const userStr = params.get("user");
  if (!userStr) return null;

  try {
    const user = JSON.parse(userStr);
    const telegramId = Number(user.id);
    if (!Number.isInteger(telegramId)) return null;
    return { telegramId, telegramUsername: user.username };
  } catch {
    return null;
  }
}

function sign(payload: string): string {
  const secret = process.env.TELEGRAM_BOT_TOKEN || "";
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

/** Сессионная cookie хранит uuid профиля (подписанный). */
export function createSessionCookie(profileId: string): string {
  const value = `${profileId}.${sign(profileId)}`;
  const secure = process.env.NODE_ENV === "production";
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${
    secure ? "; Secure" : ""
  }`;
}

function verifySignedCookie(value: string): string | null {
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  return sign(payload) === sig ? payload : null;
}

/**
 * Резолвит текущего пользователя (profile.id) из одного из источников:
 *  a) Authorization: Bearer <Supabase access token> — email-авторизация;
 *  b) HTTP-only cookie со signed profile.id — Telegram (наш флоу).
 * Возвращает null, если сессии нет или она недействительна.
 */
export async function getSessionUser(req: NextRequest): Promise<string | null> {
  // a) Supabase Auth (email). Верифицируем токен через /auth/v1/user.
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice("Bearer ".length).trim();
    try {
      const res = await fetch(
        `${process.env.SUPABASE_URL}/auth/v1/user`,
        {
          headers: {
            apikey: process.env.SUPABASE_ANON_KEY || "",
            Authorization: `Bearer ${token}`,
          },
        }
      );
      if (res.ok) {
        const user = (await res.json()) as {
          id?: string;
          email?: string;
        } | null;
        if (user?.id) return user.id;
      }
      return null;
    } catch (e) {
      console.error("Supabase auth resolve error:", e);
      return null;
    }
  }

  // b) Наша signed cookie (profile.id либо legacy tg:<id>).
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (!cookie) return null;

  const payload = verifySignedCookie(cookie);
  if (!payload) return null;

  if (payload.startsWith("tg:")) {
    const telegramId = Number(payload.slice(3));
    if (!Number.isInteger(telegramId)) return null;
    const profile = await getProfileByTelegramId(telegramId);
    return profile?.id ?? null;
  }
  return payload;
}