import assert from "node:assert/strict";
import { test } from "node:test";
import {
  effectivePlan,
  limitFor,
  remaining,
  monthStartIso,
  nextMonthStartIso,
  FREE_LIMITS,
} from "../src/lib/db/plans";

function withEnv<T>(env: Record<string, string | undefined>, fn: () => T): T {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("effectivePlan: owner by env → admin", () => {
  withEnv({ OWNER_TELEGRAM_ID: "123" }, () => {
    const plan = effectivePlan({ telegram_id: 123, plan: "free", plan_until: null });
    assert.equal(plan, "admin");
  });
});

test("effectivePlan: env trimmed and non-owner stays on db plan", () => {
  withEnv({ OWNER_TELEGRAM_ID: " 123 " }, () => {
    assert.equal(effectivePlan({ telegram_id: 999, plan: "free", plan_until: null }), "free");
    assert.equal(effectivePlan({ telegram_id: 123, plan: "blocked", plan_until: null }), "admin");
  });
});

test("effectivePlan: no owner env → admin not granted", () => {
  withEnv({ OWNER_TELEGRAM_ID: undefined }, () => {
    const plan = effectivePlan({ telegram_id: 123, plan: "free", plan_until: null });
    assert.equal(plan, "free");
  });
});

test("effectivePlan: beta active (future until)", () => {
  const future = new Date(Date.now() + 86400000).toISOString();
  const plan = effectivePlan({ telegram_id: null, plan: "beta", plan_until: future });
  assert.equal(plan, "beta");
});

test("effectivePlan: beta expired → free (soft)", () => {
  const past = new Date(Date.now() - 86400000).toISOString();
  const plan = effectivePlan({ telegram_id: null, plan: "beta", plan_until: past });
  assert.equal(plan, "free");
});

test("effectivePlan: beta without until = бессрочно", () => {
  const plan = effectivePlan({ telegram_id: null, plan: "beta", plan_until: null });
  assert.equal(plan, "beta");
});

test("effectivePlan: pro/blocked/free passthrough", () => {
  assert.equal(effectivePlan({ telegram_id: null, plan: "pro", plan_until: null }), "pro");
  assert.equal(effectivePlan({ telegram_id: null, plan: "blocked", plan_until: null }), "blocked");
  assert.equal(effectivePlan({ telegram_id: null, plan: "free", plan_until: null }), "free");
  // неизвестный план → free
  assert.equal(effectivePlan({ telegram_id: null, plan: "gold", plan_until: null }), "free");
});

test("limitFor: free limits 50/10, others unlimited, blocked zero", () => {
  assert.deepEqual(limitFor("free", "autosort"), FREE_LIMITS.autosort);
  assert.deepEqual(limitFor("free", "summary"), FREE_LIMITS.summary);
  assert.deepEqual(limitFor("admin", "autosort"), null);
  assert.deepEqual(limitFor("beta", "summary"), null);
  assert.deepEqual(limitFor("pro", "autosort"), null);
  assert.deepEqual(limitFor("blocked", "autosort"), 0);
  assert.deepEqual(limitFor("blocked", "summary"), 0);
});

test("remaining: unlimited null, clamp at zero", () => {
  assert.equal(remaining(0, null), null);
  assert.equal(remaining(18, 50), 32);
  assert.equal(remaining(50, 50), 0);
  assert.equal(remaining(60, 50), 0);
});

test("month windows: monthStartIso/nextMonthStartIso are UTC month boundaries", () => {
  const start = new Date(monthStartIso(new Date("2026-08-23T15:30:00Z")));
  assert.equal(start.toISOString(), "2026-08-01T00:00:00.000Z");

  const next = new Date(nextMonthStartIso(new Date("2026-12-31T23:59:59Z")));
  // декабрь + 1 месяц → январь следующего года
  assert.equal(next.toISOString(), "2027-01-01T00:00:00.000Z");
});
