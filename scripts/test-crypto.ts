import { test } from "node:test";
import assert from "node:assert/strict";

if (!process.env.AI_KEY_SECRET) {
  process.env.AI_KEY_SECRET = "test-secret-0123456789abcdef";
}

import { encryptSecret, decryptSecret, maskKey } from "../src/lib/crypto";

test("encrypt/decrypt roundtrip", () => {
  const plain = "sk-1234567890abcdef";
  const enc = encryptSecret(plain);
  assert.ok(enc.startsWith("enc:v1:"));
  const parts = enc.split(":");
  assert.equal(parts.length, 5);
  const dec = decryptSecret(enc);
  assert.equal(dec, plain);
});

test("encryption is not deterministic (random IV)", () => {
  const plain = "sk-test";
  const a = encryptSecret(plain);
  const b = encryptSecret(plain);
  assert.notEqual(a, b);
  assert.equal(decryptSecret(a), plain);
  assert.equal(decryptSecret(b), plain);
});

test("maskKey keeps last 4 chars and masks the rest", () => {
  assert.equal(maskKey("sk-abcdefgh1234"), "***********1234");
  assert.equal(maskKey("abcd"), "****");
  assert.equal(maskKey("a"), "*");
  assert.equal(maskKey(""), "");
});

test("decrypt rejects malformed payloads", () => {
  assert.throws(() => decryptSecret("plain-text"));
  assert.throws(() => decryptSecret("enc:v1:aaa"));
  assert.throws(() => decryptSecret("enc:v2:iv:tag:ct"));
});

test("tampered ciphertext fails decryption", () => {
  const enc = encryptSecret("secret-key-here");
  const [prefix, iv, tag, ct] = enc.split(":");
  const flipped = ct[0] === "A" ? "B" + ct.slice(1) : "A" + ct.slice(1);
  assert.throws(() => decryptSecret([prefix, iv, tag, flipped].join(":")));
});
