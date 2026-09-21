/**
 * Детерминированный скоринг рекомендаций «Есть 10 минут?» (ТЗ §7).
 * Никакого ML и LLM на каждом открытии: только metadata + веса.
 *
 * score = duration_match * 10 + not_seen * 3 + freshness * 2 + user_interest * 2
 */

import { estimateMinutes } from "@/lib/estimate";

/** Окна «подходит по времени»: выбранные минуты → [min, max] оценки карточки. */
export const TIME_WINDOWS: Record<number, [number, number]> = {
  5: [3, 7],
  10: [7, 15],
  15: [10, 20],
  30: [20, Number.POSITIVE_INFINITY],
};

export function normalizeMinutes(raw: unknown): number {
  const n = Number(raw);
  if (n === 5 || n === 10 || n === 15 || n === 30) return n;
  return 10;
}

export type RecommendCandidate = {
  id: string;
  estimatedMinutes: number | null;
  createdAt: string;
  folderIds: string[];
  actionCount: number;
};

export type ScoreBreakdown = {
  duration: number;
  freshness: number;
  notSeen: number;
  interest: number;
  total: number;
};

export const RECOMMEND_WEIGHTS = {
  duration: 10,
  notSeen: 3,
  freshness: 2,
  interest: 2,
} as const;

/** 1 внутри окна, линейный спад снаружи (min -1). Неизвестно → 0 (нейтрально). */
export function durationScore(est: number | null, minutes: number): number {
  if (est == null) return 0;
  const [lo, hi] = TIME_WINDOWS[minutes] ?? TIME_WINDOWS[10];
  if (est >= lo && est <= hi) return 1;
  const d = est < lo ? lo - est : est - hi;
  return Math.max(-1, 1 - d / 10);
}

/** Бонус за давность сохранения: 30+ дней → 1 («наконец прочитай»). */
export function freshnessScore(createdAt: string, now: number = Date.now()): number {
  const t = new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return 0;
  const ageDays = Math.max(0, (now - t) / 86_400_000);
  return Math.min(1, ageDays / 30);
}

/** Бонус за непросмотренность: 0 действий → 1, дальше затухание. */
export function notSeenScore(actionCount: number): number {
  return 1 / (1 + Math.max(0, Math.floor(actionCount)));
}

/** Интерес: макс. популярность папок карточки (0..1). Без папок → 0. */
export function interestScore(
  folderIds: string[],
  popularity: Map<string, number>
): number {
  let best = 0;
  for (const id of folderIds) {
    const p = popularity.get(id) ?? 0;
    if (p > best) best = p;
  }
  return best;
}

export function scoreCandidate(
  c: RecommendCandidate,
  minutes: number,
  popularity: Map<string, number>,
  now: number = Date.now()
): ScoreBreakdown {
  const duration = durationScore(c.estimatedMinutes, minutes);
  const freshness = freshnessScore(c.createdAt, now);
  const notSeen = notSeenScore(c.actionCount);
  const interest = interestScore(c.folderIds, popularity);
  const total =
    RECOMMEND_WEIGHTS.duration * duration +
    RECOMMEND_WEIGHTS.notSeen * notSeen +
    RECOMMEND_WEIGHTS.freshness * freshness +
    RECOMMEND_WEIGHTS.interest * interest;
  return { duration, freshness, notSeen, interest, total };
}

/** Стабильная сортировка по убыванию score. */
export function rankCandidates<T extends RecommendCandidate>(
  candidates: T[],
  minutes: number,
  popularity: Map<string, number>,
  now: number = Date.now()
): Array<{ candidate: T; breakdown: ScoreBreakdown }> {
  return candidates
    .map((candidate, index) => ({
      candidate,
      breakdown: scoreCandidate(candidate, minutes, popularity, now),
      index,
    }))
    .sort((a, b) => b.breakdown.total - a.breakdown.total || a.index - b.index)
    .map(({ candidate, breakdown }) => ({ candidate, breakdown }));
}

/** Резолв длительности: estimated_minutes → duration_seconds → эвристика. */
export function resolveEstimatedMinutes(input: {
  estimatedMinutes?: number | null;
  durationSeconds?: number | null;
  title?: string | null;
  text?: string | null;
  description?: string | null;
  kind?: string | null;
}): number | null {
  if (input.estimatedMinutes != null && input.estimatedMinutes > 0) {
    return Math.max(1, Math.round(input.estimatedMinutes));
  }
  return estimateMinutes({
    title: input.title,
    text: input.text,
    description: input.description,
    durationSeconds: input.durationSeconds,
    kind: input.kind,
  });
}
