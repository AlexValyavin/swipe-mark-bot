import type { ProfileRow } from "@/lib/db/types";

export type EffectivePlan = "admin" | "beta" | "pro" | "free" | "blocked";
export type AiKind = "autosort" | "summary" | "search";

/** Лимиты для free; остальные планы — без лимитов (кроме blocked = 0). */
export const FREE_LIMITS: Record<AiKind, number> = {
  autosort: 50,
  summary: 10,
  search: 20,
};

/**
 * Эффективный план с учётом:
 * - OWNER_TELEGRAM_ID → admin (безлимит, env важнее БД)
 * - beta с истёкшим plan_until → free (мягкое истечение, БД не меняем)
 */
export function effectivePlan(
  profile: Pick<ProfileRow, "telegram_id" | "plan" | "plan_until">
): EffectivePlan {
  const ownerTgId = Number(String(process.env.OWNER_TELEGRAM_ID || "").trim() || 0);
  if (ownerTgId && profile.telegram_id === ownerTgId) return "admin";

  const plan = profile.plan || "free";
  if (plan === "beta") {
    const untilOk =
      !profile.plan_until || new Date(profile.plan_until).getTime() > Date.now();
    return untilOk ? "beta" : "free";
  }
  if (plan === "pro" || plan === "blocked" || plan === "free") {
    return plan as EffectivePlan;
  }
  return "free";
}

/** null = безлимит; 0 = полностью заблокировано. */
export function limitFor(plan: EffectivePlan, kind: AiKind): number | null {
  if (plan === "admin" || plan === "beta" || plan === "pro") return null;
  if (plan === "blocked") return 0;
  return FREE_LIMITS[kind];
}

/** Начало текущего месяца (UTC) — окно сброса квоты. */
export function monthStartIso(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/** Первый день следующего месяца (UTC) — когда квота обновится. */
export function nextMonthStartIso(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
}

/** Чистая функция остатка — для тестов. */
export function remaining(used: number, limit: number | null): number | null {
  if (limit === null) return null; // unlimited
  return Math.max(0, limit - used);
}
