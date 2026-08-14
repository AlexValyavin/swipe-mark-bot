import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeUrl } from "../src/lib/db/cards";

test("normalizeUrl: keeps simple URL, adds trailing slash", () => {
  assert.equal(normalizeUrl("https://example.com"), "https://example.com/");
  assert.equal(normalizeUrl("https://example.com/page"), "https://example.com/page");
});

test("normalizeUrl: drops utm/fbclid/gclid/igshid params", () => {
  const n = normalizeUrl(
    "https://example.com/a?utm_source=x&utm_medium=y&b=2&fbclid=zzz"
  );
  assert.equal(n, "https://example.com/a?b=2");
});

test("normalizeUrl: removes hash", () => {
  assert.equal(normalizeUrl("https://example.com/a#section"), "https://example.com/a");
});

test("normalizeUrl: lowercases host and strips www", () => {
  assert.equal(normalizeUrl("https://WWW.Example.COM/A"), "https://example.com/A");
});

test("normalizeUrl: same URL with/without trailing slash match", () => {
  assert.equal(normalizeUrl("https://example.com/"), normalizeUrl("https://example.com"));
});

test("normalizeUrl: duplicate instagram reels normalize equal", () => {
  const a = normalizeUrl("https://www.instagram.com/reel/Db3oxScKveQ/?igsh=MTZiYTN3NXY1bGgzZg==");
  const b = normalizeUrl("https://instagram.com/reel/Db3oxScKveQ/");
  assert.equal(a, b);
});
