import { test } from "node:test";
import assert from "node:assert/strict";

import { parseAiJson } from "../src/lib/ai/enrich";

test("parseAiJson: clean JSON object", () => {
  const s = parseAiJson(
    JSON.stringify({ title: "Новый заголовок", summary: "Краткое", tags: ["работа", "важно"], folder: "💼 Работа", confidence: 0.9 })
  );
  assert.equal(s.title, "Новый заголовок");
  assert.equal(s.summary, "Краткое");
  assert.deepEqual(s.tags, ["работа", "важно"]);
  assert.equal(s.folder, "💼 Работа");
  assert.equal(s.confidence, 0.9);
});

test("parseAiJson: extracts first {...} from markdown fences", () => {
  const s = parseAiJson(
    "```json\n" + JSON.stringify({ title: "X", tags: [], folder: null, confidence: 0.5 }) + "\n```"
  );
  assert.equal(s.title, "X");
  assert.equal(s.folder, null);
  assert.equal(s.confidence, 0.5);
});

test("parseAiJson: ignores prose around JSON", () => {
  const s = parseAiJson(
    'Вот результат: {"tags":["a"],"folder":"f","confidence":0.3} — конец.'
  );
  assert.deepEqual(s.tags, ["a"]);
  assert.equal(s.folder, "f");
});

test("parseAiJson: trims tags and caps at 3", () => {
  const s = parseAiJson(
    JSON.stringify({ tags: ["  один  ", "два", "три", "четыре"], folder: null, confidence: 0.8 })
  );
  assert.deepEqual(s.tags, ["один", "два", "три"]);
});

test("parseAiJson: clamps confidence to [0,1]", () => {
  assert.equal(parseAiJson(JSON.stringify({ confidence: 2 })).confidence, 1);
  assert.equal(parseAiJson(JSON.stringify({ confidence: -1 })).confidence, 0);
  assert.equal(parseAiJson(JSON.stringify({ confidence: "nope" })).confidence, 0);
});

test("parseAiJson: empty title/summary become null", () => {
  const s = parseAiJson(JSON.stringify({ title: "   ", summary: "", folder: null, confidence: 0.1 }));
  assert.equal(s.title, null);
  assert.equal(s.summary, null);
});

test("parseAiJson: no JSON in response throws", () => {
  assert.throws(() => parseAiJson("просто текст без json"), /JSON/i);
  assert.throws(() => parseAiJson(""), /JSON/i);
});

test("parseAiJson: title capped at 120 chars", () => {
  const long = "а".repeat(200);
  const s = parseAiJson(JSON.stringify({ title: long, folder: null, confidence: 0.5 }));
  assert.equal(s.title!.length, 120);
});
