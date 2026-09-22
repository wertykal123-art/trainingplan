import { test } from "node:test";
import assert from "node:assert/strict";
import { CYCLE_WEEKS, cycleWeek, isDeloadWeek, cycleEnded, cycleEnd, deloadWeight, deloadSets, todayISO, dayInCycle } from "../shared/cycle.js";

const START = "2026-09-01"; // úterý

test("týden cyklu se počítá po sedmi dnech", () => {
  const w = (d) => cycleWeek(START, new Date(d + "T10:00:00"));
  assert.equal(w("2026-09-01"), 1);
  assert.equal(w("2026-09-07"), 1);
  assert.equal(w("2026-09-08"), 2);
  assert.equal(w("2026-09-15"), 3);
  assert.equal(w("2026-09-21"), 3);
  assert.equal(w("2026-09-22"), 4);
  assert.equal(w("2026-09-28"), 4);
  assert.equal(w("2026-09-29"), 5);
});

test("lehký je jen poslední týden cyklu", () => {
  const d = (x) => isDeloadWeek(START, new Date(x + "T10:00:00"));
  assert.equal(CYCLE_WEEKS, 4);
  assert.equal(d("2026-09-21"), false, "poslední den třetího týdne");
  assert.equal(d("2026-09-22"), true, "první den čtvrtého týdne");
  assert.equal(d("2026-09-24"), true, "prostředek čtvrtého týdne");
  assert.equal(d("2026-09-28"), true, "poslední den cyklu");
  assert.equal(d("2026-09-29"), false, "po konci už ne");
});

test("banner drží celý lehký týden, ne jen jeden trénink", () => {
  const dny = ["2026-09-22", "2026-09-24", "2026-09-26", "2026-09-28"];
  assert.ok(dny.every((x) => isDeloadWeek(START, new Date(x + "T10:00:00"))));
});

test("konec cyklu a přetečení", () => {
  assert.equal(cycleEnd(START).toISOString().slice(0, 10), "2026-09-28");
  assert.equal(cycleEnded(START, new Date("2026-09-28T23:00:00")), false);
  assert.equal(cycleEnded(START, new Date("2026-09-29T00:30:00")), true);
});

test("váha a série pro lehký týden", () => {
  assert.equal(deloadWeight(102.5, 2.5), 92.5);
  assert.equal(deloadWeight(100, 2.5), 90);
  assert.equal(deloadWeight(40, 1.25), 36.25);
  assert.equal(deloadWeight(0, 2.5), 0, "cvik bez zátěže zůstane na nule");
  assert.equal(deloadSets(4), 3);
  assert.equal(deloadSets(2), 1);
  assert.equal(deloadSets(1), 1, "nikdy pod jednu sérii");
});

test("odolnost vůči nesmyslnému vstupu", () => {
  assert.equal(dayInCycle("2026-09-10", new Date("2026-09-01T10:00:00")), 0, "start v budoucnu nespadne pod nulu");
  assert.equal(dayInCycle("nesmysl", new Date()), 0);
  assert.match(todayISO(new Date("2026-03-05T23:30:00")), /^\d{4}-\d{2}-\d{2}$/);
});

test("todayISO bere místní den, ne UTC", () => {
  assert.equal(todayISO(new Date(2026, 8, 22, 23, 30)), "2026-09-22");
  assert.equal(todayISO(new Date(2026, 0, 1, 0, 30)), "2026-01-01");
});
