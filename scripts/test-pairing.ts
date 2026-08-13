import { test } from "node:test";
import assert from "node:assert/strict";

import { generateCode } from "../src/lib/db/pairing";

test("generateCode: length 8 and safe alphabet only", () => {
  for (let i = 0; i < 200; i++) {
    const code = generateCode();
    assert.equal(code.length, 8);
    assert.match(code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  }
});

test("generateCode: no ambiguous chars O/0/I/1", () => {
  for (let i = 0; i < 200; i++) {
    const code = generateCode();
    assert.ok(!/[O0I1]/.test(code), `bad code: ${code}`);
  }
});

test("generateCode: produces multiple distinct values", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 50; i++) seen.add(generateCode());
  assert.ok(seen.size > 1);
});

test("bot deep link format", () => {
  const code = generateCode();
  const url = `https://t.me/SwipeMarkBot?start=${code}`;
  assert.equal(url.startsWith("https://t.me/"), true);
  assert.ok(url.includes(`start=${code}`));
});