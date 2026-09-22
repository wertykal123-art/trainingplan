import { PROGRAM, CTX, exerciseName } from "../shared/program.js";
import { CYCLE_WEEKS, cycleEnd } from "../shared/cycle.js";

const fmtDate = (d) => new Date(d).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Europe/Prague" });
const csvCell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const MARK = "[LEHKÝ TÝDEN]";
/** české skloňování podle počtu: 1 / 2–4 / 5+ */
const plural = (n, one, few, many) => (n === 1 ? one : n >= 2 && n <= 4 ? few : many);

/** CSV: jedna řádka = jedna série. Vhodné pro tabulky i pro nahrání do Clauda. */
export function toCSV(sessions) {
  const head = ["datum", "cas", "trenink", "lehky_tyden", "cvik_id", "cvik", "serie", "vaha_kg", "opakovani", "zasoba_rir", "objem_kg", "lezeni_predtim", "capoeira_predtim", "nevyspaly"];
  const rows = [head.join(",")];
  for (const s of sessions) {
    const d = new Date(s.date);
    const date = d.toLocaleDateString("sv-SE", { timeZone: "Europe/Prague" }); // YYYY-MM-DD
    const time = d.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Prague" });
    const ctx = s.ctx || {};
    for (const e of s.ex || []) {
      (e.sets || []).forEach((set, i) => {
        const w = Number(set.w ?? e.w ?? 0), reps = Number(set.reps || 0);
        rows.push([date, time, s.day, s.deload ? 1 : 0, e.id, exerciseName(s.day, e.id), i + 1, w, reps, set.rir ?? "", Math.round(w * reps * 100) / 100,
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

/** Textový rozbor – to, co nahraješ Claudovi na konci cyklu. */
export function toDigest(state, sessions) {
  const lines = [];
  const anyDeload = sessions.some((s) => s.deload);
  lines.push("TRÉNINKOVÝ DENÍK — export " + fmtDate(new Date()));
  lines.push("Plán: 3× týdně full-body A/B/C, priorita zdraví a síla, ~80 min ráno.");
  lines.push("Kontext: 26 let, sedavá práce, 2× týdně capoeira + 1–3× lezení (nepravidelně).");
  lines.push("Plán záměrně bez vertikálního tahu (nahrazuje lezení), s prací pro rameno a extenzory.");
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
  sessions.forEach((s, i) => {
    const c2 = CTX.filter((x) => s.ctx && s.ctx[x.k]).map((x) => x.label.toLowerCase());
    lines.push(`#${i + 1} ${fmtDate(s.date)} · ${s.day} · ${PROGRAM[s.day] ? PROGRAM[s.day].title : ""}${s.deload ? " · " + MARK : ""}${c2.length ? " · předtím: " + c2.join(", ") : ""}`);
    for (const e of s.ex || []) {
      lines.push("  " + exerciseName(s.day, e.id) + ": " + (e.sets || []).map((x) => `${x.w ?? e.w ?? 0}×${x.reps}(${x.rir ?? "-"})`).join(", "));
    }
  });
  lines.push("");
  lines.push("Pracovní váhy na konci cyklu (lehký týden je nepřepisuje):");
  const peaks = peakSets(sessions);
  for (const [k, w] of Object.entries(state.weights || {})) {
    const [d, id] = k.split(":");
    const e = PROGRAM[d] && PROGRAM[d].ex.find((x) => x.id === id);
    if (!e || !(w > 0)) continue;
    const p = peaks[k];
    lines.push(`  ${d} ${e.name}: ${w} kg${p ? ` (nejtěžší série v období: ${p.w} kg × ${p.reps})` : ""}`);
  }
  lines.push("");
  lines.push("Prosím o rozbor a nový plán na další cyklus: kde progres stagnuje, kde přidávám moc rychle, jestli je vidět vliv lezení a capoeiry na výkon v posilovně, a jaké váhy a cviky nasadit do dalšího čtyřtýdenního cyklu.");
  return lines.join("\n") + "\n";
}

/** JSON export: kompletní záloha (dá se zpět naimportovat) + popis programu. */
export function toJSON(state, sessions) {
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    format: "trenink-denik/1",
    cycle: state.cycle || null,
    cycleWeeks: CYCLE_WEEKS,
    program: Object.fromEntries(Object.entries(PROGRAM).map(([k, v]) => [k, { title: v.title, ex: v.ex.map(({ id, name, sets, lo, hi }) => ({ id, name, sets, lo, hi })) }])),
    ctxLabels: Object.fromEntries(CTX.map((c) => [c.k, c.label])),
    weights: state.weights || {},
    fails: state.fails || {},
    nextDay: state.nextDay || "A",
    created: state.created || null,
    sessions,
  }, null, 1);
}
