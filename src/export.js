import { CTX } from "../shared/program.js";
import { BUILTIN_PLAN, exerciseOf, weightKeys, PLAN_FORMAT } from "../shared/plan.js";
import { CYCLE_WEEKS, cycleEnd } from "../shared/cycle.js";

const fmtDate = (d) => new Date(d).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Europe/Prague" });
const csvCell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const MARK = "[LEHKÝ TÝDEN]";
/** české skloňování podle počtu: 1 / 2–4 / 5+ */
const plural = (n, one, few, many) => (n === 1 ? one : n >= 2 && n <= 4 ? few : many);

/** Plány, ve kterých se dá dohledat název cviku: ten z tréninku, pak aktivní, pak výchozí. */
function lookup(state) {
  const plans = state.plans || {};
  const active = state.plan || BUILTIN_PLAN;
  return {
    active,
    planOf: (s) => (s && s.planId != null && plans[s.planId]) || active,
    name: (s, id) => {
      for (const p of [(s && s.planId != null && plans[s.planId]) || null, active, BUILTIN_PLAN]) {
        const e = p && exerciseOf(p, s.day, id);
        if (e) return e.name;
      }
      return id;
    },
    nameAnywhere: (day, id) => {
      for (const p of [active, ...Object.values(plans), BUILTIN_PLAN]) {
        const e = exerciseOf(p, day, id);
        if (e) return e.name;
      }
      return id;
    },
  };
}

/** CSV: jedna řádka = jedna série. Vhodné pro tabulky i pro hlubší analýzu. */
export function toCSV(state, sessions) {
  const L = lookup(state);
  const head = ["datum", "cas", "plan", "trenink", "lehky_tyden", "cvik_id", "cvik", "serie", "vaha_kg", "opakovani", "zasoba_rir", "objem_kg", "lezeni_predtim", "capoeira_predtim", "nevyspaly"];
  const rows = [head.join(",")];
  for (const s of sessions) {
    const d = new Date(s.date);
    const date = d.toLocaleDateString("sv-SE", { timeZone: "Europe/Prague" }); // YYYY-MM-DD
    const time = d.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Prague" });
    const ctx = s.ctx || {};
    const planName = L.planOf(s).name || "";
    for (const e of s.ex || []) {
      (e.sets || []).forEach((set, i) => {
        const w = Number(set.w ?? e.w ?? 0), reps = Number(set.reps || 0);
        rows.push([date, time, planName, s.day, s.deload ? 1 : 0, e.id, L.name(s, e.id), i + 1, w, reps, set.rir ?? "", Math.round(w * reps * 100) / 100,
          ctx.climb ? 1 : 0, ctx.capo ? 1 : 0, ctx.tired ? 1 : 0].map(csvCell).join(","));
      });
    }
  }
  return "﻿" + rows.join("\r\n") + "\r\n";
}

/** Nejtěžší série na cvik, lehký týden se nepočítá. */
function peakSets(sessions) {
  const peaks = {};
  for (const s of sessions) {
    if (s.deload) continue;
    for (const e of s.ex || []) {
      for (const set of e.sets || []) {
        const w = Number(set.w ?? e.w ?? 0);
        if (w <= 0) continue;
        const k = s.day + ":" + e.id;
        if (!peaks[k] || w > peaks[k].w) peaks[k] = { w, reps: set.reps };
      }
    }
  }
  return peaks;
}

/** Návod pro Clauda, jak poslat další plán, aby šel rovnou nahrát. */
function planRecipe() {
  return `JAK MI POSLAT NOVÝ PLÁN
Návrh dalšího cyklu mi pošli jako JSON v tomhle tvaru. Nahraju ho v deníku pod
Data → Nahrát nový plán, takže potřebuju čistý JSON bez dalšího textu kolem.

{
  "format": "${PLAN_FORMAT}",
  "name": "Krátký název cyklu",
  "note": "Jedna věta, co je v tomhle cyklu záměr.",
  "order": ["A", "B", "C"],
  "days": {
    "A": {
      "title": "Dřep & bench",
      "ex": [
        {
          "id": "squat",
          "name": "Dřep s velkou činkou",
          "sets": 4, "lo": 4, "hi": 6,
          "inc": 2.5, "step": 2.5, "bar": 20, "rest": 210,
          "group": "Nohy", "track": true,
          "cue": "Pokyny ke cviku, klidně dvě věty."
        }
      ]
    }
  },
  "startWeights": { "A:squat": 100 }
}

Co která položka znamená:
  id      krátký kód cviku, malá písmena bez diakritiky. Když cvik zůstává z minulého
          cyklu, nech stejné id: přenese se pracovní váha a naváže historie.
  sets    počet pracovních sérií; lo a hi je rozsah opakování
  inc     o kolik kg přidat, když všechny série vyjdou na horní hranici
  step    nejmenší dostupný přírůstek (kotouč); bar je váha osy, 0 když se nepoužívá
  rest    pauza mezi sériemi v sekundách
  group   svalová skupina, podle ní se počítá týdenní objem
  track   true u cviků, které chci vidět v grafu síly, ideálně tři až pět
  cue     pokyny, které se mi zobrazí u cviku během tréninku
  startWeights  nepovinné, váhy na start cyklu. Co nevyplníš, přenese se z minula.`;
}

/** Textový rozbor – to, co nahraješ Claudovi na konci cyklu. */
export function toDigest(state, sessions) {
  const L = lookup(state);
  const lines = [];
  const anyDeload = sessions.some((s) => s.deload);
  lines.push("TRÉNINKOVÝ DENÍK — export " + fmtDate(new Date()));
  lines.push(`Plán: ${L.active.name}`);
  if (L.active.note) lines.push("Záměr: " + L.active.note);
  lines.push("Kontext: 26 let, sedavá práce, 2× týdně capoeira + 1–3× lezení (nepravidelně).");
  lines.push("Formát série: váha×opakování(zásoba v opakováních)");
  const c = state.cycle;
  if (c && c.start) {
    lines.push(`Cyklus č. ${c.n || 1}: začal ${fmtDate(c.start)}, konec ${fmtDate(cycleEnd(c.start))} (${CYCLE_WEEKS} týdny, poslední je záměrně lehký).`);
  }
  if (anyDeload) {
    lines.push(`Tréninky označené ${MARK} jsou deload: nižší váha a o sérii míň schválně. Neber je jako propad výkonu ani jako podklad pro nové váhy.`);
  }
  lines.push("");
  if (sessions.length) {
    const nd = sessions.filter((s) => s.deload).length;
    lines.push(`Období: ${fmtDate(sessions[0].date)} – ${fmtDate(sessions[sessions.length - 1].date)}, ${sessions.length} ${plural(sessions.length, "trénink", "tréninky", "tréninků")}${nd ? ` (z toho ${nd} ${plural(nd, "lehký", "lehké", "lehkých")})` : ""}`);
    lines.push("");
  }
  let lastPlan = null;
  sessions.forEach((s, i) => {
    const p = L.planOf(s);
    if (p.name !== lastPlan) {
      if (lastPlan !== null) lines.push("");
      lines.push(`— plán: ${p.name} —`);
      lastPlan = p.name;
    }
    const c2 = CTX.filter((x) => s.ctx && s.ctx[x.k]).map((x) => x.label.toLowerCase());
    lines.push(`#${i + 1} ${fmtDate(s.date)} · ${s.day} · ${p.days && p.days[s.day] ? p.days[s.day].title : ""}${s.deload ? " · " + MARK : ""}${c2.length ? " · předtím: " + c2.join(", ") : ""}`);
    for (const e of s.ex || []) {
      lines.push("  " + L.name(s, e.id) + ": " + (e.sets || []).map((x) => `${x.w ?? e.w ?? 0}×${x.reps}(${x.rir ?? "-"})`).join(", "));
    }
  });
  lines.push("");
  lines.push("Pracovní váhy na konci cyklu (lehký týden je nepřepisuje):");
  const peaks = peakSets(sessions);
  const weights = state.weights || {};
  const inPlan = new Set(weightKeys(L.active));
  const line = (k) => {
    const [d, id] = k.split(":");
    const p = peaks[k];
    return `  ${d} ${L.nameAnywhere(d, id)}: ${weights[k]} kg${p ? ` (nejtěžší série v období: ${p.w} kg × ${p.reps})` : ""}`;
  };
  for (const k of weightKeys(L.active)) if (weights[k] > 0) lines.push(line(k));
  const orphans = Object.keys(weights).filter((k) => weights[k] > 0 && !inPlan.has(k));
  if (orphans.length) {
    lines.push("");
    lines.push("Váhy cviků, které v aktuálním plánu nejsou (z dřívějších cyklů):");
    for (const k of orphans) lines.push(line(k));
  }
  lines.push("");
  lines.push("Prosím o rozbor a nový plán na další cyklus: kde progres stagnuje, kde přidávám moc rychle, jestli je vidět vliv lezení a capoeiry na výkon v posilovně, a jaké váhy a cviky nasadit do dalšího čtyřtýdenního cyklu.");
  lines.push("");
  lines.push(planRecipe());
  return lines.join("\n") + "\n";
}

/** JSON export: kompletní záloha (dá se zpět naimportovat) + použité plány. */
export function toJSON(state, sessions) {
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    format: "trenink-denik/1",
    cycle: state.cycle || null,
    cycleWeeks: CYCLE_WEEKS,
    plan: state.plan || BUILTIN_PLAN,
    plans: state.plans || { 0: BUILTIN_PLAN },
    ctxLabels: Object.fromEntries(CTX.map((c) => [c.k, c.label])),
    weights: state.weights || {},
    fails: state.fails || {},
    nextDay: state.nextDay || "A",
    created: state.created || null,
    sessions,
  }, null, 1);
}
