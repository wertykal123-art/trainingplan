import { PROGRAM, CTX, exerciseName } from "../shared/program.js";

const fmtDate = (d) => new Date(d).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Europe/Prague" });
const csvCell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV: jedna řádka = jedna série. Vhodné pro tabulky i pro nahrání do Clauda. */
export function toCSV(sessions) {
  const head = ["datum", "cas", "trenink", "cvik_id", "cvik", "serie", "vaha_kg", "opakovani", "zasoba_rir", "objem_kg", "lezeni_predtim", "capoeira_predtim", "nevyspaly"];
  const rows = [head.join(",")];
  for (const s of sessions) {
    const d = new Date(s.date);
    const date = d.toLocaleDateString("sv-SE", { timeZone: "Europe/Prague" }); // YYYY-MM-DD
    const time = d.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Prague" });
    const ctx = s.ctx || {};
    for (const e of s.ex || []) {
      (e.sets || []).forEach((set, i) => {
        const w = Number(set.w ?? e.w ?? 0), reps = Number(set.reps || 0);
        rows.push([date, time, s.day, e.id, exerciseName(s.day, e.id), i + 1, w, reps, set.rir ?? "", Math.round(w * reps * 100) / 100,
          ctx.climb ? 1 : 0, ctx.capo ? 1 : 0, ctx.tired ? 1 : 0].map(csvCell).join(","));
      });
    }
  }
  return "﻿" + rows.join("\r\n") + "\r\n";
}

/** Textový rozbor – stejný formát, jaký deník kopíroval pro Clauda. */
export function toDigest(state, sessions) {
  const lines = [];
  lines.push("TRÉNINKOVÝ DENÍK — export " + fmtDate(new Date()));
  lines.push("Plán: 3× týdně full-body A/B/C, priorita zdraví a síla, ~80 min ráno.");
  lines.push("Kontext: 26 let, sedavá práce, 2× týdně capoeira + 1–3× lezení (nepravidelně).");
  lines.push("Plán záměrně bez vertikálního tahu (nahrazuje lezení), s prací pro rameno a extenzory.");
  lines.push("Formát série: váha×opakování(zásoba v opakováních)");
  lines.push("");
  if (sessions.length) {
    lines.push(`Období: ${fmtDate(sessions[0].date)} – ${fmtDate(sessions[sessions.length - 1].date)}, ${sessions.length} tréninků`);
    lines.push("");
  }
  sessions.forEach((s, i) => {
    const c = CTX.filter((x) => s.ctx && s.ctx[x.k]).map((x) => x.label.toLowerCase());
    lines.push(`#${i + 1} ${fmtDate(s.date)} · ${s.day} · ${PROGRAM[s.day] ? PROGRAM[s.day].title : ""}${c.length ? " · předtím: " + c.join(", ") : ""}`);
    for (const e of s.ex || []) {
      lines.push("  " + exerciseName(s.day, e.id) + ": " + (e.sets || []).map((x) => `${x.w ?? e.w ?? 0}×${x.reps}(${x.rir ?? "-"})`).join(", "));
    }
  });
  lines.push("");
  lines.push("Aktuální pracovní váhy:");
  for (const [k, w] of Object.entries(state.weights || {})) {
    const [d, id] = k.split(":");
    const e = PROGRAM[d] && PROGRAM[d].ex.find((x) => x.id === id);
    if (e && w > 0) lines.push(`  ${d} ${e.name}: ${w} kg`);
  }
  lines.push("");
  lines.push("Prosím o rozbor: kde progres stagnuje, kde přidávám moc rychle, jestli je vidět vliv lezení a capoeiry na výkon v posilovně, a jak podle toho postavit další blok.");
  return lines.join("\n") + "\n";
}

/** JSON export: kompletní záloha (dá se zpět naimportovat) + popis programu. */
export function toJSON(state, sessions) {
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    format: "trenink-denik/1",
    program: Object.fromEntries(Object.entries(PROGRAM).map(([k, v]) => [k, { title: v.title, ex: v.ex.map(({ id, name, sets, lo, hi }) => ({ id, name, sets, lo, hi })) }])),
    ctxLabels: Object.fromEntries(CTX.map((c) => [c.k, c.label])),
    weights: state.weights || {},
    fails: state.fails || {},
    nextDay: state.nextDay || "A",
    created: state.created || null,
    sessions,
  }, null, 1);
}
