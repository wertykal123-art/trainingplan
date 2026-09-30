/* Tréninkový plán jako data: kontrola, doplnění výchozích hodnot a porovnání
   se stávajícím plánem. Sdílené mezi prohlížečem a serverem, aby nahraný plán
   prošel stejnou kontrolou na obou stranách. */

import { BUILTIN_PLAN } from "./program.js";
export { BUILTIN_PLAN };

export const PLAN_FORMAT = "trenink-plan/1";
export const MAX_JSON_BYTES = 200 * 1024;
export const LIMITS = { days: 7, exPerDay: 24, sets: 12, reps: 100, rest: 900, weight: 1000 };

const ID_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const str = (v) => (typeof v === "string" ? v.trim() : "");

/** Klíč pracovní váhy: "A:squat". */
export function weightKey(day, id) { return day + ":" + id; }

export function exerciseOf(plan, day, id) {
  const d = plan && plan.days && plan.days[day];
  return (d && d.ex.find((e) => e.id === id)) || null;
}

/** Název cviku, s dohledáním v záložních plánech a poslední záchranou v podobě kódu. */
export function exerciseName(plans, day, id) {
  for (const p of plans) {
    const e = exerciseOf(p, day, id);
    if (e) return e.name;
  }
  return id;
}

export function weightKeys(plan) {
  const out = [];
  for (const day of plan.order) for (const e of plan.days[day].ex) out.push(weightKey(day, e.id));
  return out;
}

/** Zkontroluje nahraný plán. Vrací { ok, plan, errors } – buď projde celý, nebo nic. */
export function validatePlan(input) {
  const errors = [];
  let doc = input;
  if (typeof doc === "string") {
    if (doc.length > MAX_JSON_BYTES) return { ok: false, errors: [`Plán je delší než ${Math.round(MAX_JSON_BYTES / 1024)} kB.`] };
    try { doc = JSON.parse(doc); }
    catch (e) { return { ok: false, errors: ["Tohle není platný JSON: " + e.message] }; }
  }
  if (!isObj(doc)) return { ok: false, errors: ["Plán musí být objekt JSON se složenými závorkami."] };
  if (doc.format !== PLAN_FORMAT) errors.push(`Políčko "format" musí být "${PLAN_FORMAT}", přišlo ${JSON.stringify(doc.format ?? null)}.`);

  const name = str(doc.name);
  if (!name) errors.push('Chybí "name", tedy název plánu.');
  else if (name.length > 120) errors.push('"name" je delší než 120 znaků.');
  const note = str(doc.note);

  if (!Array.isArray(doc.order) || !doc.order.length) {
    errors.push('Chybí "order", seznam dnů v pořadí, například ["A","B","C"].');
    return { ok: false, errors };
  }
  if (doc.order.length > LIMITS.days) errors.push(`"order" má víc než ${LIMITS.days} dnů.`);
  const order = [];
  for (const d of doc.order) {
    const k = str(d);
    if (!k || k.length > 8) { errors.push(`Označení dne ${JSON.stringify(d)} musí být text do 8 znaků.`); continue; }
    if (order.includes(k)) { errors.push(`Den "${k}" je v "order" dvakrát.`); continue; }
    order.push(k);
  }
  if (!isObj(doc.days)) {
    errors.push('Chybí "days", tedy popis jednotlivých dnů.');
    return { ok: false, errors };
  }
  for (const k of Object.keys(doc.days)) if (!order.includes(k)) errors.push(`Den "${k}" je v "days", ale chybí v "order".`);

  const days = {};
  for (const day of order) {
    const src = doc.days[day];
    if (!isObj(src)) { errors.push(`Den "${day}" chybí v "days".`); continue; }
    const title = str(src.title);
    if (!title) errors.push(`Den "${day}": chybí "title".`);
    if (!Array.isArray(src.ex) || !src.ex.length) { errors.push(`Den "${day}": chybí "ex", tedy seznam cviků.`); continue; }
    if (src.ex.length > LIMITS.exPerDay) errors.push(`Den "${day}": víc než ${LIMITS.exPerDay} cviků.`);
    const ex = [], seen = new Set();
    src.ex.forEach((e, i) => {
      const at = `Den "${day}", cvik ${i + 1}`;
      if (!isObj(e)) { errors.push(`${at}: musí to být objekt.`); return; }
      const id = str(e.id);
      if (!ID_RE.test(id)) { errors.push(`${at}: "id" musí být krátký kód z malých písmen bez diakritiky, přišlo ${JSON.stringify(e.id ?? null)}.`); return; }
      if (seen.has(id)) { errors.push(`${at}: "id" ${JSON.stringify(id)} se v tomhle dni opakuje.`); return; }
      seen.add(id);
      const nm = str(e.name);
      if (!nm) { errors.push(`${at} (${id}): chybí "name".`); return; }
      if (nm.length > 80) errors.push(`${at} (${id}): "name" je delší než 80 znaků.`);
      const sets = e.sets, lo = e.lo, hi = e.hi;
      if (!Number.isInteger(sets) || sets < 1 || sets > LIMITS.sets) { errors.push(`${at} (${id}): "sets" musí být celé číslo 1 až ${LIMITS.sets}.`); return; }
      if (!Number.isInteger(lo) || lo < 1 || lo > LIMITS.reps) { errors.push(`${at} (${id}): "lo" musí být celé číslo 1 až ${LIMITS.reps}.`); return; }
      if (!Number.isInteger(hi) || hi < lo || hi > LIMITS.reps) { errors.push(`${at} (${id}): "hi" musí být celé číslo od "lo" do ${LIMITS.reps}.`); return; }
      const inc = isNum(e.inc) ? e.inc : null;
      if (inc === null || inc < 0 || inc > 50) { errors.push(`${at} (${id}): "inc" musí být číslo 0 až 50 (o kolik kg přidat).`); return; }
      const step = isNum(e.step) && e.step > 0 ? e.step : inc > 0 ? inc : 1;
      if (step > 50) { errors.push(`${at} (${id}): "step" musí být nejvýš 50.`); return; }
      const bar = isNum(e.bar) && e.bar >= 0 ? e.bar : 0;
      if (bar > LIMITS.weight) { errors.push(`${at} (${id}): "bar" je nesmyslně velký.`); return; }
      const rest = Number.isInteger(e.rest) && e.rest >= 0 ? Math.min(e.rest, LIMITS.rest) : 90;
      ex.push({ id, name: nm, sets, lo, hi, inc, step, bar, rest,
        group: str(e.group) || "Ostatní", track: e.track === true, cue: str(e.cue) });
    });
    days[day] = { title: title || day, ex };
  }

  const startWeights = {};
  if (doc.startWeights !== undefined) {
    if (!isObj(doc.startWeights)) errors.push('"startWeights" musí být objekt, například {"A:squat": 100}.');
    else for (const [k, v] of Object.entries(doc.startWeights)) {
      const [day, id] = String(k).split(":");
      if (!day || !id || !days[day] || !days[day].ex.some((e) => e.id === id)) { errors.push(`"startWeights": klíč "${k}" neodpovídá žádnému cviku v plánu.`); continue; }
      if (!isNum(v) || v < 0 || v > LIMITS.weight) { errors.push(`"startWeights": váha u "${k}" musí být číslo 0 až ${LIMITS.weight}.`); continue; }
      startWeights[k] = v;
    }
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, errors: [], plan: { format: PLAN_FORMAT, name, note, order, days, startWeights } };
}

/** Co se nasazením plánu změní. */
export function diffPlans(oldPlan, newPlan) {
  const list = (p) => {
    const m = new Map();
    if (p && p.order) for (const d of p.order) for (const e of (p.days[d] || { ex: [] }).ex) m.set(weightKey(d, e.id), { day: d, id: e.id, name: e.name });
    return m;
  };
  const a = list(oldPlan), b = list(newPlan);
  const added = [], removed = [], kept = [];
  for (const [k, v] of b) (a.has(k) ? kept : added).push({ key: k, ...v });
  for (const [k, v] of a) if (!b.has(k)) removed.push({ key: k, ...v });
  return { added, removed, kept };
}

/** Váhy pro nový plán: co plán určí, jinak co je odcvičené. */
export function carryWeights(newPlan, weights) {
  const out = {};
  for (const k of weightKeys(newPlan)) {
    if (newPlan.startWeights && newPlan.startWeights[k] !== undefined) out[k] = newPlan.startWeights[k];
    else if (weights && weights[k] > 0) out[k] = weights[k];
  }
  return out;
}
