import crypto from "crypto";
import { NextRequest } from "next/server";

const SESSION_COOKIE = "swipe_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export function verifyTelegramInitData(
  initData: string
): { userId: string; telegramId: number } | null {
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
    return { userId: `tg:${telegramId}`, telegramId };
  } catch {
    return null;
  }
}

function sign(payload: string): string {
  const secret = process.env.TELEGRAM_BOT_TOKEN || "";
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export function createSessionCookie(userId: string): string {
  const value = `${userId}.${sign(userId)}`;
  const secure = process.env.NODE_ENV === "production";
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${
    secure ? "; Secure" : ""
  }`;
}

export function getSessionUser(req: NextRequest): string | null {
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (!cookie) return null;

  const dot = cookie.lastIndexOf(".");
  if (dot <= 0) return null;

  const userId = cookie.slice(0, dot);
  const sig = cookie.slice(dot + 1);
  const expected = sign(userId);

  return sig === expected ? userId : null;
}
