import { getAdminDb } from "@/lib/db/supabase";
import { getProfileById } from "@/lib/db/profiles";
import {
  effectivePlan,
  limitFor,
  monthStartIso,
  nextMonthStartIso,
  remaining,
  type AiKind,
  type EffectivePlan,
} from "@/lib/db/plans";

export type AiQuota = {
  plan: EffectivePlan;
  autosort: { used: number; left: number | null };
  summary: { used: number; limit: number | null; left: number | null };
  resetsAt: string;
};

/** true, если активен глобальный ключ владельца (env или app_config) — квота действует.
 *  Если пользователь работает на своём BYOK-ключе — лимиты не применяются. */
export function isGlobalAiActive(): boolean {
  if (process.env.OPENROUTER_API_KEY?.trim()) return true;
  // app_config проверяется лениво вызывающим кодом (async), здесь только env
  return false;
}

/** Полная проверка с учётом app_config (асинхронная). */
export async function isGlobalAiActiveAsync(): Promise<boolean> {
  if (process.env.OPENROUTER_API_KEY?.trim()) return true;
  try {
    const { getGlobalAiRaw } = await import("@/lib/db/appConfig");
    const raw = await getGlobalAiRaw();
    return !!raw?.keyEnc;
  } catch {
    return false;
  }
}

export async function getAiQuota(userId: string): Promise<AiQuota> {
  const db = getAdminDb();
  const profile = await getProfileById(userId);
  const plan: EffectivePlan = profile ? effectivePlan(profile) : "free";

  const autosortLimit = limitFor(plan, "autosort");
  const summaryLimit = limitFor(plan, "summary");
  const resetsAt = nextMonthStartIso();

  if (autosortLimit === null && summaryLimit === null) {
    return {
      plan,
      autosort: { used: 0, left: null },
      summary: { used: 0, limit: null, left: null },
      resetsAt,
    };
  }

  const monthStart = monthStartIso();
  const { data } = await db
    .from("ai_usage")
    .select("kind, status")
    .eq("user_id", userId)
    .gte("created_at", monthStart);

  const rows = (data ?? []) as { kind: string; status: string }[];
  const usedOf = (kind: AiKind) =>
    rows.filter((r) => r.kind === kind && r.status !== "failed").length;

  const autosortUsed = usedOf("autosort");
  const summaryUsed = usedOf("summary");

  return {
    plan,
    autosort: { used: autosortUsed, left: remaining(autosortUsed, autosortLimit) },
    summary: {
      used: summaryUsed,
      limit: summaryLimit,
      left: remaining(summaryUsed, summaryLimit),
    },
    resetsAt,
  };
}

/** Проверка перед вызовом AI: возвращает null если можно, иначе причину отказа. */
export async function checkAiAllowed(
  userId: string,
  kind: AiKind
): Promise<{ ok: true; quota: AiQuota } | { ok: false; reason: "blocked" | "quota"; quota: AiQuota }> {
  const quota = await getAiQuota(userId);
  if (quota.plan === "blocked") return { ok: false, reason: "blocked", quota };
  const slot = kind === "autosort" ? quota.autosort : quota.summary;
  if (slot.left !== null && slot.left <= 0) return { ok: false, reason: "quota", quota };
  return { ok: true, quota };
}

/** Запись факта использования. failed не считается в лимит. */
export async function recordAiUsage(
  userId: string,
  kind: AiKind,
  cardId: string | null,
  status: "success" | "failed",
  model?: string | null
): Promise<void> {
  try {
    await getAdminDb().from("ai_usage").insert({
      user_id: userId,
      kind,
      card_id: cardId,
      status,
      model: model ?? null,
    });
  } catch (e) {
    console.error(`recordAiUsage(${kind}/${status}) failed:`, e);
  }
}
