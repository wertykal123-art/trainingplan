import { test } from "node:test";
import assert from "node:assert/strict";
import * as ST from "../shared/stats.js";
import { BUILTIN_PLAN } from "../shared/plan.js";

const D = (y, m, d, h = 6) => new Date(y, m - 1, d, h, 0, 0, 0);
const ses = (date, day, ex, opt = {}) => ({ date: D(...date).toISOString(), day, ctx: opt.ctx || {}, deload: !!opt.deload, planId: 0, ex });
const lift = (id, w, reps, rir, sets = 1) => ({ id, w, sets: Array.from({ length: sets }, () => ({ w, reps, rir })) });

test("základní statistiky", () => {
  assert.equal(ST.mean([2, 4, 6]), 4);
  assert.equal(ST.median([1, 3, 2, 10]), 2.5);
  assert.equal(ST.median([5]), 5);
  assert.equal(ST.median([]), 0);
  assert.equal(Math.round(ST.sd([2, 4, 4, 4, 5, 5, 7, 9]) * 1000) / 1000, 2.138);
  assert.equal(ST.sd([3]), 0, "jeden vzorek nemá rozptyl");
});

test("odhad maxima roste s opakováními i se zásobou", () => {
  assert.equal(Math.round(ST.e1rm(100, 5, 0) * 10) / 10, 116.7);
  assert.ok(ST.e1rm(100, 5, 2) > ST.e1rm(100, 5, 0), "zásoba znamená, že by dal víc");
  assert.equal(ST.e1rm(0, 10, 2), 0, "cvik bez zátěže nedává odhad");
});

test("Welch mlčí, dokud nemá dost tréninků", () => {
  assert.equal(ST.welch([1, 2, 1], [3, 3, 3]).verdict, "malo-dat");
  assert.equal(ST.welch([1, 2, 1, 2], [3, 3, 3, 3]).verdict, "zretelny");
  const sum = ST.welch([1, 2, 1, 2, 3], [1, 3, 2, 2, 1]);
  assert.equal(sum.verdict, "sum", "překrývající se skupiny nejsou nález");
  assert.equal(ST.welch([1, 1, 1, 1], [2, 2, 2, 2]).diff, -1, "znaménko ukazuje směr");
});

test("směrnice trendu a jeho spolehlivost", () => {
  const rovna = ST.slopePerDay([{ t: D(2026, 9, 1), v: 100 }, { t: D(2026, 9, 8), v: 102.5 }, { t: D(2026, 9, 15), v: 105 }]);
  assert.equal(Math.round(rovna.slope * 7 * 100) / 100, 2.5, "2,5 kg za týden");
  assert.equal(Math.round(rovna.r2 * 1000) / 1000, 1, "body leží na přímce");
  assert.equal(ST.slopePerDay([{ t: D(2026, 9, 1), v: 100 }]), null);
  assert.equal(ST.slopePerDay([{ t: D(2026, 9, 1), v: 100 }, { t: D(2026, 9, 1), v: 110 }]), null, "stejný den nedá směrnici");
});

test("objem a série jednoho tréninku, i když je váha jen u cviku", () => {
  const s = ses([2026, 9, 1], "A", [{ id: "squat", w: 100, sets: [{ reps: 5, rir: 2 }, { reps: 5, rir: 1 }] }, lift("bench", 60, 8, 2)]);
  assert.equal(ST.sessionVolume(s), 100 * 5 + 100 * 5 + 60 * 8);
  assert.equal(ST.sessionSets(s), 3);
  assert.equal(Math.round(ST.sessionMeanRir(s) * 100) / 100, 1.67);
  assert.equal(ST.sessionMeanRir(ses([2026, 9, 1], "A", [])), null);
});

test("nejlepší odhad maxima v tréninku", () => {
  const s = ses([2026, 9, 1], "A", [{ id: "squat", w: 100, sets: [{ w: 100, reps: 5, rir: 2 }, { w: 105, reps: 3, rir: 1 }] }]);
  assert.equal(Math.round(ST.bestE1rm(s, "squat")), 123, "lehčí série s větší zásobou tady vyjde líp než těžší trojka");
  assert.equal(ST.bestE1rm(s, "neni"), 0);
});

test("řada síly vynechá lehké týdny i cizí dny", () => {
  const list = [
    ses([2026, 9, 1], "A", [lift("squat", 100, 5, 2)]),
    ses([2026, 9, 8], "A", [lift("squat", 90, 5, 3)], { deload: true }),
    ses([2026, 9, 9], "B", [lift("squat", 200, 5, 2)]),
    ses([2026, 9, 15], "A", [lift("squat", 105, 5, 2)]),
  ];
  const pts = ST.liftSeries(list, "A", "squat");
  assert.equal(pts.length, 2, "lehký týden ani den B se nepočítají");
  assert.ok(pts[1].v > pts[0].v);
});

test("změna síly mezi obdobími potřebuje obě strany", () => {
  const plan = BUILTIN_PLAN;
  const prev = [ses([2026, 8, 3], "A", [lift("squat", 100, 5, 2)]), ses([2026, 8, 10], "A", [lift("squat", 100, 5, 2)])];
  const cur = [ses([2026, 9, 1], "A", [lift("squat", 110, 5, 2)])];
  const d = ST.strengthDelta(cur, prev, plan);
  assert.equal(d.lifts, 1, "bere jen cviky, které jsou v obou oknech");
  assert.equal(Math.round(d.pct), 10);
  assert.equal(ST.strengthDelta(cur, [], plan).pct, null, "bez minula se nic netvrdí");
});

test("progrese po cvicích pozná růst, stagnaci i couvání", () => {
  const plan = BUILTIN_PLAN;
  const mk = (d, sq, row, lat) => ses([2026, 9, d], "A", [lift("squat", sq, 5, 2), lift("row", row, 10, 2)]);
  const list = [mk(1, 100, 30), mk(8, 102.5, 30), mk(15, 105, 30), mk(22, 107.5, 30)];
  const rows = ST.exerciseProgress(list, plan, { "A:squat": 107.5, "A:row": 30 });
  const squat = rows.find((r) => r.id === "squat"), row = rows.find((r) => r.id === "row");
  assert.equal(squat.state, "roste");
  assert.equal(squat.change, 7.5);
  assert.equal(row.state, "stagnuje", "tři tréninky bez pohybu");
  assert.equal(row.stale, 3);
  assert.equal(rows[0].state, "stagnuje", "co stojí, je nahoře");
  const dolu = ST.exerciseProgress([mk(1, 100, 30), mk(8, 95, 30)], plan, {});
  assert.equal(dolu.find((r) => r.id === "squat").state, "couva");
});

test("přidaná opakování se počítají jako pohyb, ne jako stagnace", () => {
  const list = [
    ses([2026, 9, 1], "A", [lift("squat", 100, 5, 2, 3)]),
    ses([2026, 9, 8], "A", [lift("squat", 100, 6, 2, 3)]),
    ses([2026, 9, 15], "A", [lift("squat", 100, 7, 2, 3)]),
    ses([2026, 9, 22], "A", [lift("squat", 100, 8, 2, 3)]),
  ];
  const r = ST.exerciseProgress(list, BUILTIN_PLAN, {}).find((x) => x.id === "squat");
  assert.equal(r.state, "drzi");
  assert.equal(r.stale, 0);
  assert.equal(r.repsChange, 9, "z 15 na 24 opakování");
});

test("týdenní objem doplní i týdny bez tréninku", () => {
  const list = [ses([2026, 9, 1], "A", [lift("squat", 100, 5, 2)]), ses([2026, 9, 22], "A", [lift("squat", 100, 5, 2)])];
  const wk = ST.weeklyVolume(list);
  assert.equal(wk.length, 4, "tři prázdné týdny mezi nimi se nepřeskočí");
  assert.equal(wk[1].volume, 0);
  assert.equal(wk[1].n, 0);
  assert.equal(wk[0].volume, 500);
  assert.equal(ST.weeklyVolume(list, 2).length, 2, "limit ořízne starší týdny");
});

test("skok objemu ignoruje načaté a lehké týdny", () => {
  const w = (week, volume, n, deload = false) => ({ week, volume, n, sets: n * 3, deload });
  assert.equal(ST.biggestJump([w("2026-09-07", 1000, 1), w("2026-09-14", 9000, 3)]), null, "jeden trénink není základ pro srovnání");
  const j = ST.biggestJump([w("2026-09-07", 10000, 3), w("2026-09-14", 15000, 3)]);
  assert.equal(Math.round(j.pct), 50);
  assert.equal(ST.biggestJump([w("2026-09-07", 10000, 3, true), w("2026-09-14", 20000, 3)]), null, "po lehkém týdnu se skok nepočítá");
});

test("série po svalových skupinách podle plánu daného tréninku", () => {
  const list = [ses([2026, 9, 1], "A", [lift("squat", 100, 5, 2, 4), lift("bench", 60, 8, 2, 3)])];
  const g = ST.groupSets(list, () => BUILTIN_PLAN);
  assert.equal(g["Nohy"], 4);
  assert.equal(g["Prsa"], 3);
  const nezname = ST.groupSets([ses([2026, 9, 1], "A", [lift("xxx", 10, 5, 2)])], () => BUILTIN_PLAN);
  assert.equal(nezname["Ostatní"], 1, "cvik mimo plán spadne do Ostatní");
});

test("docházka: mezery a dny v týdnu", () => {
  const list = [[2026, 9, 7], [2026, 9, 9], [2026, 9, 14]].map((d) => ses(d, "A", [lift("squat", 100, 5, 2)]));
  const r = ST.rhythm(list, D(2026, 9, 16));
  assert.equal(r.medianGap, 3.5, "mezery 2 a 5 dní");
  assert.equal(r.maxGap, 5);
  assert.equal(r.sinceLast, 2);
  assert.equal(r.byDow[0], 2, "dvě pondělí");
  assert.equal(r.byDow[2], 1, "jedna středa");
});

test("rekordy berou nejlepší sérii mimo lehký týden", () => {
  const list = [
    ses([2026, 9, 1], "A", [lift("squat", 100, 5, 2)]),
    ses([2026, 9, 8], "A", [lift("squat", 130, 5, 2)], { deload: true }),
    ses([2026, 9, 15], "A", [lift("squat", 110, 5, 1)]),
  ];
  const r = ST.records(list, BUILTIN_PLAN).find((x) => x.id === "squat");
  assert.equal(r.w, 110, "těžší série z lehkého týdne se nebere");
  assert.equal(new Date(r.date).getDate(), 15);
});

test("vliv okolností vrací počty a verdikt pro každou položku", () => {
  const mk = (d, climb, rir) => ses([2026, 9, d], "A", [lift("squat", 100, 5, rir)], { ctx: { climb } });
  const list = [mk(1, true, 0), mk(2, true, 1), mk(3, true, 0), mk(4, true, 1), mk(5, false, 2), mk(6, false, 3), mk(7, false, 2), mk(8, false, 3)];
  const eff = ST.contextEffects(list, [{ k: "climb", label: "Lezení" }, { k: "capo", label: "Capoeira" }]);
  const climb = eff.find((e) => e.key === "climb");
  assert.equal(climb.n1, 4);
  assert.equal(climb.n2, 4);
  assert.ok(climb.diff < 0, "po lezení nižší zásoba, tedy těžší série");
  assert.equal(climb.verdict, "zretelny");
  assert.equal(eff.find((e) => e.key === "capo").verdict, "malo-dat");
});
