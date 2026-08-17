import { test } from "node:test";
import assert from "node:assert/strict";
import { fmtDuration, fmtReadMinutes, fmtDateShort, groupByPeriod } from "../src/lib/format";

test("fmtDuration: только валидные положительные секунды", () => {
  assert.equal(fmtDuration(754), "12:34");
  assert.equal(fmtDuration(113), "1:53");
  assert.equal(fmtDuration(0), null);
  assert.equal(fmtDuration(null), null);
  assert.equal(fmtDuration(undefined), null);
  assert.equal(fmtDuration(-5), null);
  assert.equal(fmtDuration(NaN), null);
});

test("fmtDuration: корректный паддинг секунд", () => {
  assert.equal(fmtDuration(60), "1:00");
  assert.equal(fmtDuration(3600), "60:00");
  assert.equal(fmtDuration(59), "0:59");
});

test("fmtReadMinutes: только валидные", () => {
  assert.equal(fmtReadMinutes(6), "~6 мин");
  assert.equal(fmtReadMinutes(1.4), "~1 мин");
  assert.equal(fmtReadMinutes(0), null);
  assert.equal(fmtReadMinutes(null), null);
  assert.equal(fmtReadMinutes(undefined), null);
});

test("fmtDateShort: сегодня → время, иначе дата", () => {
  const now = new Date();
  const today = now.toISOString();
  assert.match(fmtDateShort(today), /^\d{2}:\d{2}$/);
  const old = new Date(now.getTime() - 3 * 86400000).toISOString();
  assert.notEqual(fmtDateShort(old), "");
  assert.match(fmtDateShort("not-a-date"), /^$/);
});

test("groupByPeriod: Сегодня / Неделя / Раньше", () => {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dow = (now.getDay() + 6) % 7;
  const startWeek = startToday - dow * 86400000;
  const iso = (ms: number) => new Date(ms).toISOString();
  // Точка «посередине недели»: до сегодня, но после понедельника (в понедельник
  // такой точки нет — тогда week-элемент сливается с today).
  const midWeek = startWeek + Math.max(1, Math.floor((startToday - startWeek) / 2));
  const groups = groupByPeriod([
    { id: "today", createdAt: iso(startToday + 1000) },
    { id: "week", createdAt: iso(midWeek) },
    { id: "earlier", createdAt: iso(startWeek - 1000) },
    { id: "future", createdAt: iso(startToday + 86400000) },
  ]);
  const labels = groups.map((g) => g.label);
  assert.deepEqual(labels[0], "Сегодня");
  assert.equal(labels[labels.length - 1], "Раньше");
  const todayGroup = groups.find((g) => g.label === "Сегодня")!;
  assert.ok(todayGroup.items.some((i) => i.id === "today"));
  assert.ok(todayGroup.items.some((i) => i.id === "future"));
  const weekGroup = groups.find((g) => g.label === "На этой неделе");
  if (startToday > startWeek) {
    // не понедельник: week-элемент должен быть в «На этой неделе»
    assert.ok(weekGroup, "ожидалась группа «На этой неделе»");
    assert.ok(weekGroup.items.some((i) => i.id === "week"));
  } else {
    // понедельник: midWeek == today+0..1s → сливается в «Сегодня»
    assert.ok(todayGroup.items.some((i) => i.id === "week"));
  }
});

test("groupByPeriod: пустой список", () => {
  assert.deepEqual(groupByPeriod([]), []);
});