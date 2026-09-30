import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePlan, diffPlans, carryWeights, weightKeys, exerciseName, BUILTIN_PLAN, PLAN_FORMAT } from "../shared/plan.js";

const good = {
  format: PLAN_FORMAT,
  name: "Cyklus 3, důraz na tlak nad hlavou",
  note: "Míň objemu na nohy, víc na ramena.",
  order: ["A", "B"],
  days: {
    A: { title: "Tlak", ex: [
      { id: "ohp", name: "Tlak nad hlavu", sets: 4, lo: 5, hi: 8, inc: 2.5, step: 1.25, bar: 20, rest: 150, group: "Ramena", track: true, cue: "Žebra dolů." },
      { id: "dip", name: "Dipy", sets: 3, lo: 6, hi: 10, inc: 2.5, step: 2.5, bar: 0, rest: 120, group: "Prsa" },
    ] },
    B: { title: "Tah", ex: [
      { id: "squat", name: "Dřep", sets: 5, lo: 3, hi: 5, inc: 5, step: 2.5, bar: 20, rest: 210, group: "Nohy", track: true },
    ] },
  },
  startWeights: { "A:ohp": 45 },
};

test("platný plán projde a doplní chybějící volitelné hodnoty", () => {
  const r = validatePlan(good);
  assert.equal(r.ok, true, r.errors.join("; "));
  const dip = r.plan.days.A.ex[1];
  assert.equal(dip.track, false, "track chybí → false");
  assert.equal(dip.cue, "", "cue chybí → prázdné");
  assert.equal(r.plan.days.B.ex[0].group, "Nohy");
  assert.deepEqual(r.plan.startWeights, { "A:ohp": 45 });
});

test("výchozí plán deníku projde vlastní kontrolou", () => {
  const r = validatePlan(JSON.parse(JSON.stringify(BUILTIN_PLAN)));
  assert.equal(r.ok, true, r.errors.join("; "));
  assert.equal(weightKeys(r.plan).length, 22);
});

test("rozbitý JSON i špatný tvar vrátí srozumitelnou chybu", () => {
  assert.match(validatePlan("{tohle není json").errors[0], /Tohle není platný JSON/);
  assert.match(validatePlan([1, 2]).errors[0], /musí být objekt JSON/);
  assert.match(validatePlan({ ...good, format: "jiny" }).errors[0], /"format"/);
});

test("kontrola zachytí nesmyslné hodnoty a nic nepropustí", () => {
  const bad = { ...good, startWeights: {}, days: { A: { title: "X", ex: [
    { id: "Dřep", name: "a", sets: 4, lo: 5, hi: 8, inc: 2.5 },
    { id: "ok1", name: "", sets: 4, lo: 5, hi: 8, inc: 2.5 },
    { id: "ok2", name: "b", sets: 0, lo: 5, hi: 8, inc: 2.5 },
    { id: "ok3", name: "c", sets: 4, lo: 9, hi: 8, inc: 2.5 },
    { id: "ok4", name: "d", sets: 4, lo: 5, hi: 8, inc: "hodně" },
  ] }, B: good.days.B } };
  const r = validatePlan(bad);
  assert.equal(r.ok, false);
  assert.equal(r.plan, undefined, "při chybě se nevrací žádný plán");
  assert.equal(r.errors.length, 5, r.errors.join("; "));
  assert.match(r.errors.join(" "), /"id" musí být krátký kód/);
  assert.match(r.errors.join(" "), /chybí "name"/);
  assert.match(r.errors.join(" "), /"sets" musí být celé číslo/);
  assert.match(r.errors.join(" "), /"hi" musí být celé číslo od "lo"/);
  assert.match(r.errors.join(" "), /"inc" musí být číslo/);
});

test("stejné id cviku v jednom dni neprojde", () => {
  const dup = { ...good, days: { ...good.days, A: { title: "X", ex: [good.days.A.ex[0], good.days.A.ex[0]] } } };
  assert.match(validatePlan(dup).errors.join(" "), /se v tomhle dni opakuje/);
});

test("startWeights musí mířit na cvik, který v plánu je", () => {
  const r = validatePlan({ ...good, startWeights: { "A:neexistuje": 50, "A:ohp": -5 } });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(" "), /neodpovídá žádnému cviku/);
  assert.match(r.errors.join(" "), /musí být číslo 0 až/);
});

test("den v days, který chybí v order, se ohlásí", () => {
  const r = validatePlan({ ...good, days: { ...good.days, C: { title: "navíc", ex: good.days.B.ex } } });
  assert.match(r.errors.join(" "), /Den "C" je v "days", ale chybí v "order"/);
});

test("porovnání plánů pozná, co přibylo a co odchází", () => {
  const d = diffPlans(BUILTIN_PLAN, validatePlan(good).plan);
  const keys = (a) => a.map((x) => x.key).sort();
  assert.deepEqual(keys(d.added), ["A:dip", "A:ohp", "B:squat"]);
  assert.ok(d.removed.some((x) => x.key === "A:squat"), "dřep z dne A odchází");
  assert.ok(d.removed.some((x) => x.name === "Bench press"), "odcházející nese i název");
  assert.equal(d.kept.length, 0, "žádné id se nekryje den po dni");
});

test("váhy se přenesou podle id, plán je smí přebít", () => {
  const plan = validatePlan(good).plan;
  const w = carryWeights(plan, { "A:ohp": 40, "B:squat": 100, "A:zmizel": 60 });
  assert.equal(w["A:ohp"], 45, "startWeights má přednost před odcvičeným");
  assert.equal(w["B:squat"], 100, "co plán neurčí, přenese se");
  assert.equal(w["A:zmizel"], undefined, "cvik mimo plán se nepřenáší");
  assert.equal(w["A:dip"], undefined, "nový cvik začíná prázdný");
});

test("název cviku se dohledá i ve starém plánu", () => {
  const stary = validatePlan(good).plan;
  assert.equal(exerciseName([BUILTIN_PLAN, stary], "A", "squat"), "Dřep s velkou činkou");
  assert.equal(exerciseName([stary, BUILTIN_PLAN], "A", "dip"), "Dipy");
  assert.equal(exerciseName([BUILTIN_PLAN], "A", "neznamy"), "neznamy", "poslední záchrana je kód cviku");
});
