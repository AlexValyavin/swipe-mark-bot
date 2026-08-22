import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getProfileById } from "@/lib/db/profiles";

export async function isOwner(req: NextRequest): Promise<boolean> {
  const ownerTgId = Number(String(process.env.OWNER_TELEGRAM_ID || "").trim() || 0);
  if (!ownerTgId) return false;
  const userId = await getSessionUser(req);
  if (!userId) return false;
  const profile = await getProfileById(userId);
  if (!profile) return false;
  return Number(profile.telegram_id) === ownerTgId;
}

export async function getOwnerContext(req: NextRequest): Promise<{ userId: string; profile: import("@/lib/db/types").ProfileRow } | null> {
  const ownerTgId = Number(String(process.env.OWNER_TELEGRAM_ID || "").trim() || 0);
  if (!ownerTgId) return null;
  const userId = await getSessionUser(req);
  if (!userId) return null;
  const profile = await getProfileById(userId);
  if (!profile || Number(profile.telegram_id) !== ownerTgId) return null;
  return { userId, profile };
}
