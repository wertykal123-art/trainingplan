import { test } from "node:test";
import assert from "node:assert/strict";
import { toCSV, toDigest, toJSON } from "../src/export.js";

const sessions = [
  { date: "2026-08-10T06:00:00.000Z", day: "A", ctx: { climb: true }, ex: [
    { id: "squat", w: 80, sets: [{ reps: 6, rir: 2, w: 80 }, { reps: 5, rir: 1, w: 80 }] },
    { id: "bench", w: 60, sets: [{ reps: 8, rir: 2, w: 60 }] },
  ] },
  { date: "2026-09-05T06:00:00.000Z", day: "B", ctx: {}, ex: [
    { id: "dead", w: 100, sets: [{ reps: 5, rir: 2, w: 100 }] },
  ] },
];
const state = { weights: { "A:squat": 82.5, "B:ohp": 40, "Z:nic": 5 }, fails: {}, nextDay: "C", created: "2026-08-01T00:00:00Z" };

test("CSV má hlavičku a řádek na každou sérii", () => {
  const csv = toCSV(sessions);
  const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
  assert.equal(lines.length, 1 + 4);
  assert.ok(lines[0].startsWith("datum,cas,trenink,cvik_id,cvik,serie,vaha_kg"));
  assert.equal(lines[1], "2026-08-10,08:00,A,squat,Dřep s velkou činkou,1,80,6,2,480,1,0,0");
  assert.ok(lines[4].includes('"Mrtvý tah (trhačky / trap bar)"') || lines[4].includes("Mrtvý tah (trhačky / trap bar)"));
});

test("CSV escapuje čárky a uvozovky", () => {
  const csv = toCSV([{ date: "2026-09-05T06:00:00.000Z", day: "X", ctx: {}, ex: [{ id: 'a,"b"', w: 1, sets: [{ reps: 1, rir: 0, w: 1 }] }] }]);
  assert.ok(csv.includes('"a,""b"""'));
});

test("TXT rozbor obsahuje tréninky, kontext a pracovní váhy", () => {
  const txt = toDigest(state, sessions);
  assert.match(txt, /#1 10\. 8\. 2026 · A · Dřep & bench · předtím: lezení/);
  assert.match(txt, /Dřep s velkou činkou: 80×6\(2\), 80×5\(1\)/);
  assert.match(txt, /A Dřep s velkou činkou: 82\.5 kg/);
  assert.match(txt, /B Tlak nad hlavu ve stoji: 40 kg/);
  assert.ok(!txt.includes("Z nic"), "neznámý cvik se nevypisuje");
  assert.match(txt, /Prosím o rozbor/);
});

test("JSON export jde zpět naparsovat a nese tréninky i váhy", () => {
  const o = JSON.parse(toJSON(state, sessions));
  assert.equal(o.format, "trenink-denik/1");
  assert.equal(o.sessions.length, 2);
  assert.equal(o.weights["A:squat"], 82.5);
  assert.equal(o.program.A.ex[0].id, "squat");
});
