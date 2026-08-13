import crypto from "crypto";

/**
 * AES-256-GCM шифрование для хранения BYOK-ключей.
 * Формат: enc:v1:<iv>:<tag>:<ct> (все части base64url).
 * Секрет — AI_KEY_SECRET; ключ AES-256 выводится из него через SHA-256.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export function getAesKeySecret(): string {
  const secret = process.env.AI_KEY_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("AI_KEY_SECRET is not configured (min 16 chars)");
  }
  return secret;
}

function deriveKey(secret: string): Buffer {
  return crypto.createHash("sha256").update(secret).digest();
}

function toB64(buf: Buffer): string {
  return buf.toString("base64url");
}

function fromB64(s: string): Buffer {
  return Buffer.from(s, "base64url");
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, deriveKey(getAesKeySecret()), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${toB64(iv)}:${toB64(tag)}:${toB64(ct)}`;
}

export function decryptSecret(payload: string): string {
  if (!payload.startsWith("enc:v1:")) {
    throw new Error("Unsupported or malformed encrypted payload");
  }
  const [, , ivB64, tagB64, ctB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !ctB64) {
    throw new Error("Unsupported or malformed encrypted payload");
  }
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    deriveKey(getAesKeySecret()),
    fromB64(ivB64)
  );
  decipher.setAuthTag(fromB64(tagB64));
  const pt = Buffer.concat([
    decipher.update(fromB64(ctB64)),
    decipher.final(),
  ]);
  return pt.toString("utf8");
}

/** Возвращает последние 4 символа + звёздочки (для GET /api/settings/ai). */
export function maskKey(plain: string): string {
  if (plain.length <= 4) return "*".repeat(Math.min(plain.length, 4));
  return `${"*".repeat(Math.max(4, plain.length - 4))}${plain.slice(-4)}`;
}
