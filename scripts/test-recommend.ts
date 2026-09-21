import assert from "node:assert/strict";
import { test } from "node:test";
import { estimateMinutes } from "../src/lib/estimate";
import {
  durationScore,
  freshnessScore,
  interestScore,
  normalizeMinutes,
  notSeenScore,
  rankCandidates,
  resolveEstimatedMinutes,
  type RecommendCandidate,
} from "../src/lib/recommend";

// --- estimateMinutes (ТЗ §5) ---

test("estimate: video 720s → 12 мин", () => {
  assert.equal(estimateMinutes({ durationSeconds: 720, kind: "video" }), 12);
});

test("estimate: video без duration → null", () => {
  assert.equal(estimateMinutes({ title: " long video ", kind: "video" }), null);
});

test("estimate: photo → 2 мин", () => {
  assert.equal(estimateMinutes({ title: "pic", kind: "photo" }), 2);
});

test("estimate: текст 400 слов → 2 мин", () => {
  assert.equal(estimateMinutes({ text: "word ".repeat(400), kind: "note" }), 2);
});

test("estimate: короткий текст (<40 слов) → null", () => {
  assert.equal(estimateMinutes({ text: "hello world", kind: "note" }), null);
});

test("estimate: только короткий title → null", () => {
  assert.equal(estimateMinutes({ title: "youtube.com", kind: "link" }), null);
});

// --- normalizeMinutes ---

test("normalizeMinutes: 5/10/15/30 проходят, мусор → 10", () => {
  assert.equal(normalizeMinutes("5"), 5);
  assert.equal(normalizeMinutes("15"), 15);
  assert.equal(normalizeMinutes("30"), 30);
  assert.equal(normalizeMinutes("7"), 10);
  assert.equal(normalizeMinutes(null), 10);
  assert.equal(normalizeMinutes(undefined), 10);
});

// --- durationScore ---

test("durationScore: внутри окна → 1", () => {
  assert.equal(durationScore(5, 5), 1);
  assert.equal(durationScore(12, 10), 1);
  assert.equal(durationScore(45, 30), 1);
});

test("durationScore: 47-мин видео для 5 мин → -1", () => {
  assert.equal(durationScore(47, 5), -1);
});

test("durationScore: неизвестно → 0 (нейтрально)", () => {
  assert.equal(durationScore(null, 10), 0);
});

// --- freshness / notSeen / interest ---

test("freshnessScore: 60 дней → 1, сейчас → 0", () => {
  const now = Date.now();
  const old = new Date(now - 60 * 86_400_000).toISOString();
  assert.equal(freshnessScore(old, now), 1);
  assert.equal(freshnessScore(new Date(now).toISOString(), now), 0);
});

test("notSeenScore: 0 действий → 1, 3 действия → 0.25", () => {
  assert.equal(notSeenScore(0), 1);
  assert.equal(notSeenScore(3), 0.25);
});

test("interestScore: популярная папка → 1, без папок → 0", () => {
  const pop = new Map([["f1", 1], ["f2", 0.2]]);
  assert.equal(interestScore(["f1"], pop), 1);
  assert.equal(interestScore(["f2"], pop), 0.2);
  assert.equal(interestScore([], pop), 0);
});

// --- resolveEstimatedMinutes ---

test("resolve: приоритет estimated_minutes, затем duration", () => {
  assert.equal(
    resolveEstimatedMinutes({ estimatedMinutes: 12, durationSeconds: 3600 }),
    12
  );
  assert.equal(resolveEstimatedMinutes({ durationSeconds: 600 }), 10);
  assert.equal(resolveEstimatedMinutes({ title: "x", kind: "link" }), null);
});

// --- rankCandidates: главное правило (ТЗ §6) ---

function cand(
  id: string,
  est: number | null,
  extra: Partial<RecommendCandidate> = {}
): RecommendCandidate {
  return {
    id,
    estimatedMinutes: est,
    createdAt: new Date(Date.now() - 40 * 86_400_000).toISOString(),
    folderIds: [],
    actionCount: 0,
    ...extra,
  };
}

test("ranking: 5-мин статья выше 47-мин видео при minutes=5", () => {
  const ranked = rankCandidates(
    [cand("video47", 47), cand("article5", 5)],
    5,
    new Map()
  );
  assert.equal(ranked[0].candidate.id, "article5");
  assert.equal(ranked[1].candidate.id, "video47");
});

test("ranking: старое в популярной папке выше свежего без папки (равное время)", () => {
  const now = Date.now();
  const ranked = rankCandidates(
    [
      cand("fresh", 10, {
        createdAt: new Date(now).toISOString(),
        actionCount: 5,
      }),
      cand("oldfav", 10, {
        createdAt: new Date(now - 90 * 86_400_000).toISOString(),
        folderIds: ["f1"],
        actionCount: 0,
      }),
    ],
    10,
    new Map([["f1", 1]]),
    now
  );
  assert.equal(ranked[0].candidate.id, "oldfav");
});

test("ranking: стабильный порядок при равных скорах", () => {
  const ranked = rankCandidates([cand("a", 10), cand("b", 10)], 10, new Map());
  assert.equal(ranked[0].candidate.id, "a");
  assert.equal(ranked[1].candidate.id, "b");
});
