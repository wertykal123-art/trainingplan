/* Výpočty pro záložku Progres. Čisté funkce bez DOM, aby se daly testovat
   a aby stejná čísla mohla jít i do exportu pro Clauda.

   Zásady, na kterých to stojí:
   - lehké týdny (deload) se nepočítají do síly, rekordů ani do trendu zásoby;
     do objemu a docházky ano, tam patří
   - u každého srovnání se vrací i počet tréninků, ze kterých vzniklo
   - tvrzení o rozdílu se vysloví, až když rozdíl přesáhne rozptyl dat */

const DAY_MS = 86400000;

export const e1rm = (w, reps, rir) => (w > 0 ? w * (1 + (reps + (rir || 0)) / 30) : 0);

export const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
export function median(a) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
/** Výběrová směrodatná odchylka. */
export function sd(a) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1));
}

/**
 * Welchovo srovnání dvou nezávislých skupin. Nevrací p-hodnotu schválně:
 * při deseti trénincích by budila zdání přesnosti, kterou data nemají.
 * Verdikt je záměrně opatrný.
 */
export function welch(a, b, minN = 4) {
  const out = { n1: a.length, n2: b.length, m1: mean(a), m2: mean(b), diff: mean(a) - mean(b), t: 0, verdict: "malo-dat" };
  if (a.length < minN || b.length < minN) return out;
  const v = sd(a) ** 2 / a.length + sd(b) ** 2 / b.length;
  out.t = v > 0 ? out.diff / Math.sqrt(v) : 0;
  const t = Math.abs(out.t);
  out.verdict = t >= 2.5 ? "zretelny" : t >= 1.5 ? "naznak" : "sum";
  return out;
}

/** Směrnice přímky proložené body metodou nejmenších čtverců, na den. */
export function slopePerDay(points) {
  if (points.length < 2) return null;
  const t0 = +new Date(points[0].t);
  const xs = points.map((p) => (+new Date(p.t) - t0) / DAY_MS), ys = points.map((p) => p.v);
  const mx = mean(xs), my = mean(ys);
  let num = 0, den = 0;
  for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  if (den === 0) return null;
  const slope = num / den;
  let ssTot = 0, ssRes = 0;
  for (let i = 0; i < xs.length; i++) { const fit = my + slope * (xs[i] - mx); ssRes += (ys[i] - fit) ** 2; ssTot += (ys[i] - my) ** 2; }
  return { slope, r2: ssTot > 0 ? 1 - ssRes / ssTot : 0, n: points.length };
}

/* ---------- jeden trénink ---------- */
export const workSets = (s) => (s.ex || []).flatMap((e) => (e.sets || []).map((x) => ({ ...x, w: x.w ?? e.w ?? 0, id: e.id })));
export const sessionVolume = (s) => workSets(s).reduce((a, x) => a + (x.w || 0) * (x.reps || 0), 0);
export const sessionSets = (s) => workSets(s).length;
export function sessionMeanRir(s) {
  const r = workSets(s).map((x) => x.rir).filter((x) => typeof x === "number");
  return r.length ? mean(r) : null;
}
/** Nejlepší odhad maxima na 1 opakování v tréninku pro daný cvik. */
export function bestE1rm(s, exId) {
  const e = (s.ex || []).find((x) => x.id === exId);
  if (!e) return 0;
  return Math.max(0, ...(e.sets || []).map((x) => e1rm(x.w ?? e.w ?? 0, x.reps || 0, x.rir)));
}

/* ---------- okna ---------- */
export const dayStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export function inWindow(sessions, from, to) {
  const a = +new Date(from), b = +new Date(to);
  return sessions.filter((s) => { const t = +new Date(s.date); return t >= a && t < b; });
}
/** Běžící cyklus a stejně dlouhé okno těsně před ním. */
export function cycleWindows(cycleStart, weeks = 4, now = new Date()) {
  const start = dayStart(cycleStart), len = weeks * 7 * DAY_MS;
  return { curFrom: start, curTo: new Date(Math.max(+start + len, +dayStart(now) + DAY_MS)),
    prevFrom: new Date(+start - len), prevTo: start };
}

/* ---------- souhrn ---------- */
export function summary(sessions) {
  const rir = sessions.map(sessionMeanRir).filter((x) => x !== null);
  return {
    n: sessions.length,
    deloads: sessions.filter((s) => s.deload).length,
    volume: sessions.reduce((a, s) => a + sessionVolume(s), 0),
    sets: sessions.reduce((a, s) => a + sessionSets(s), 0),
    meanRir: rir.length ? mean(rir) : null,
  };
}

/** Sledované cviky z plánu, případně první cvik každého dne jako náhrada. */
export function trackedLifts(plan) {
  const out = [];
  for (const d of plan.order) for (const e of plan.days[d].ex) if (e.track) out.push({ day: d, id: e.id, name: e.name });
  if (out.length) return out;
  return plan.order.map((d) => { const e = plan.days[d].ex[0]; return e && { day: d, id: e.id, name: e.name }; }).filter(Boolean);
}

/** Řada odhadu maxima pro jeden cvik. Lehké týdny vynechává. */
export function liftSeries(sessions, day, exId) {
  const pts = [];
  for (const s of sessions) {
    if (s.day !== day || s.deload) continue;
    const v = bestE1rm(s, exId);
    if (v > 0) pts.push({ t: s.date, v });
  }
  return pts;
}

/**
 * Index síly: průměrná procentní změna odhadu maxima přes sledované cviky.
 * Jeden cvik sám o sobě skáče, průměr přes víc cviků je klidnější.
 */
export function strengthIndex(sessions, plan) {
  const parts = [];
  for (const l of trackedLifts(plan)) {
    const p = liftSeries(sessions, l.day, l.id);
    if (p.length < 2 || p[0].v <= 0) continue;
    parts.push({ name: l.name, pct: (p[p.length - 1].v - p[0].v) / p[0].v * 100 });
  }
  return { pct: parts.length ? mean(parts.map((x) => x.pct)) : null, lifts: parts.length, parts };
}

/**
 * Změna síly mezi dvěma obdobími. Bere průměr nejlepších odhadů maxima
 * v každém okně, takže jeden špatný den nerozhodí výsledek, a funguje
 * i když je v běžícím cyklu zatím jediné měření na cvik.
 */
export function strengthDelta(curSessions, prevSessions, plan) {
  const parts = [];
  for (const l of trackedLifts(plan)) {
    const c = liftSeries(curSessions, l.day, l.id).map((p) => p.v);
    const p = liftSeries(prevSessions, l.day, l.id).map((x) => x.v);
    if (!c.length || !p.length) continue;
    const mc = mean(c), mp = mean(p);
    if (mp <= 0) continue;
    parts.push({ name: l.name, pct: (mc - mp) / mp * 100, nCur: c.length, nPrev: p.length });
  }
  return { pct: parts.length ? mean(parts.map((x) => x.pct)) : null, lifts: parts.length, parts };
}

/* ---------- progrese po cvicích ---------- */
/**
 * Pro každý cvik plánu: kam se za sledované období pohnula váha a opakování.
 * Stagnace = tři a víc tréninků bez přidání váhy i bez přidání opakování.
 */
export function exerciseProgress(sessions, plan, weights = {}) {
  const rows = [];
  for (const day of plan.order) {
    for (const ex of plan.days[day].ex) {
      const hist = sessions.filter((s) => s.day === day && !s.deload && (s.ex || []).some((e) => e.id === ex.id));
      if (!hist.length) continue;
      const pt = hist.map((s) => {
        const e = s.ex.find((x) => x.id === ex.id);
        const sets = (e.sets || []).map((x) => ({ w: x.w ?? e.w ?? 0, reps: x.reps || 0 }));
        return { date: s.date, w: Math.max(0, ...sets.map((x) => x.w)), reps: sets.reduce((a, x) => a + x.reps, 0) };
      });
      const first = pt[0], last = pt[pt.length - 1];
      let state = "malo-dat", since = 0;
      if (pt.length >= 2) {
        for (let i = pt.length - 1; i > 0; i--) {
          if (pt[i].w > pt[i - 1].w || (pt[i].w === pt[i - 1].w && pt[i].reps > pt[i - 1].reps)) break;
          since++;
        }
        const dw = last.w - first.w;
        if (dw < -0.01) state = "couva";
        else if (since >= 3) state = "stagnuje";
        else if (dw > 0.01) state = "roste";
        else state = "drzi";
      }
      rows.push({ day, id: ex.id, name: ex.name, group: ex.group || "Ostatní",
        now: weights[day + ":" + ex.id] ?? last.w, from: first.w, change: last.w - first.w,
        reps: last.reps, repsChange: last.reps - first.reps, n: pt.length, stale: since, state });
    }
  }
  const rank = { stagnuje: 0, couva: 1, drzi: 2, roste: 3, "malo-dat": 4 };
  return rows.sort((a, b) => rank[a.state] - rank[b.state] || b.n - a.n);
}

/* ---------- objem ---------- */
/** Pondělí daného týdne jako YYYY-MM-DD. */
export function weekKey(d) {
  const x = dayStart(d), dow = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dow);
  return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");
}
/** Objem po kalendářních týdnech, včetně prázdných týdnů mezi tréninky. */
export function weeklyVolume(sessions, limit = 12) {
  if (!sessions.length) return [];
  const by = new Map();
  for (const s of sessions) {
    const k = weekKey(s.date);
    const cur = by.get(k) || { week: k, volume: 0, sets: 0, n: 0, deload: false };
    cur.volume += sessionVolume(s); cur.sets += sessionSets(s); cur.n++; cur.deload = cur.deload || !!s.deload;
    by.set(k, cur);
  }
  const keys = [...by.keys()].sort();
  const out = [];
  for (let d = new Date(keys[0]); d <= new Date(keys[keys.length - 1]); d.setDate(d.getDate() + 7)) {
    const k = weekKey(d);
    out.push(by.get(k) || { week: k, volume: 0, sets: 0, n: 0, deload: false });
  }
  return out.slice(-limit);
}
/** Největší skok objemu mezi dvěma po sobě jdoucími odtrénovanými týdny. */
export function biggestJump(weeks) {
  let best = null;
  for (let i = 1; i < weeks.length; i++) {
    const a = weeks[i - 1], b = weeks[i];
    /* načatý první nebo poslední týden dělá falešné skoky, proto aspoň dva tréninky */
    if (a.deload || b.deload || a.volume <= 0 || a.n < 2 || b.n < 2) continue;
    const pct = (b.volume - a.volume) / a.volume * 100;
    if (!best || pct > best.pct) best = { pct, from: a, to: b };
  }
  return best;
}

/** Odcvičené série po svalových skupinách. */
export function groupSets(sessions, planFor) {
  const out = {};
  for (const s of sessions) {
    const plan = planFor(s);
    for (const e of s.ex || []) {
      const def = plan && plan.days[s.day] && plan.days[s.day].ex.find((x) => x.id === e.id);
      const g = (def && def.group) || "Ostatní";
      out[g] = (out[g] || 0) + (e.sets || []).length;
    }
  }
  return out;
}

/* ---------- docházka ---------- */
export function rhythm(sessions, now = new Date()) {
  const dates = sessions.map((s) => +dayStart(s.date)).sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < dates.length; i++) gaps.push((dates[i] - dates[i - 1]) / DAY_MS);
  const byDow = [0, 0, 0, 0, 0, 0, 0];
  for (const s of sessions) byDow[(new Date(s.date).getDay() + 6) % 7]++;
  return {
    medianGap: gaps.length ? median(gaps) : null,
    maxGap: gaps.length ? Math.max(...gaps) : null,
    sinceLast: dates.length ? Math.round((+dayStart(now) - dates[dates.length - 1]) / DAY_MS) : null,
    byDow,
  };
}

/* ---------- rekordy ---------- */
export function records(sessions, plan) {
  const out = [];
  for (const l of trackedLifts(plan)) {
    let best = null;
    for (const s of sessions) {
      if (s.day !== l.day || s.deload) continue;
      const e = (s.ex || []).find((x) => x.id === l.id);
      if (!e) continue;
      for (const st of e.sets || []) {
        const w = st.w ?? e.w ?? 0, v = e1rm(w, st.reps || 0, st.rir);
        if (v > 0 && (!best || v > best.v)) best = { v, w, reps: st.reps, date: s.date };
      }
    }
    if (best) out.push({ ...l, ...best });
  }
  return out;
}

/* ---------- vliv okolností ---------- */
/** Jak se liší zásoba opakování podle toho, co bylo v posledních 48 hodinách. */
export function contextEffects(sessions, ctxList) {
  const usable = sessions.filter((s) => !s.deload && sessionMeanRir(s) !== null);
  return ctxList.map((c) => {
    const on = usable.filter((s) => s.ctx && s.ctx[c.k]).map(sessionMeanRir);
    const off = usable.filter((s) => !(s.ctx && s.ctx[c.k])).map(sessionMeanRir);
    return { key: c.k, label: c.label, ...welch(on, off) };
  });
}

/* ---------- tělesná váha ----------
   Jednotlivé vážení je skoro bezcenné: denní kolísání vody, glykogenu a obsahu
   střev dělá 1 až 2 kg, zatímco skutečná změna je nanejvýš půl kila za týden.
   Proto se všude pracuje s klouzavým průměrem a trend se vysloví, teprve když
   je z čeho. Lehké týdny se nevynechávají, na váhu nemají vliv. */

const hourOf = (d) => { const x = new Date(d); return x.getHours() + x.getMinutes() / 60; };

export function bodyWeightSeries(sessions) {
  return sessions
    .filter((s) => typeof s.weight === "number" && s.weight > 0)
    .map((s) => ({ t: s.date, v: s.weight, ctx: s.ctx || {}, hour: hourOf(s.date), day: s.day }))
    .sort((a, b) => new Date(a.t) - new Date(b.t));
}

/** Ke každému vážení průměr za předchozích `days` dní včetně. To je ta čára, která se čte. */
export function rollingMean(points, days = 14) {
  return points.map((p, i) => {
    const to = +new Date(p.t), from = to - days * DAY_MS;
    const win = points.slice(0, i + 1).filter((q) => +new Date(q.t) >= from);
    return { ...p, avg: mean(win.map((q) => q.v)), n: win.length };
  });
}

/**
 * Tempo změny váhy v kg za týden. Pod minimem vážení nebo na krátkém úseku
 * se vrací enough:false, aby se z šumu nedělal závěr.
 */
export function bodyWeightTrend(points, { days = 28, minPoints = 8, minSpanDays = 14 } = {}) {
  if (points.length < 2) return { enough: false, n: points.length, span: 0 };
  const last = +new Date(points[points.length - 1].t);
  const win = points.filter((p) => +new Date(p.t) >= last - days * DAY_MS);
  const span = win.length ? Math.round((last - +new Date(win[0].t)) / DAY_MS) : 0;
  if (win.length < minPoints || span < minSpanDays) return { enough: false, n: win.length, span };
  const tr = slopePerDay(win);
  if (!tr) return { enough: false, n: win.length, span };
  return { enough: true, kgPerWeek: tr.slope * 7, r2: tr.r2, n: win.length, span };
}

/**
 * Jak stabilní jsou podmínky vážení. Náhodný rozptyl se v průměru vyruší,
 * ale systematický posun hodiny trend padělá, a na ten je potřeba upozornit.
 */
export function hourConsistency(points) {
  if (points.length < 4) return { enough: false, n: points.length };
  const hs = points.map((p) => p.hour).sort((a, b) => a - b);
  const q = (f) => { const i = (hs.length - 1) * f, lo = Math.floor(i), hi = Math.ceil(i); return hs[lo] + (hs[hi] - hs[lo]) * (i - lo); };
  const iqr = q(0.75) - q(0.25);
  const drift = slopePerDay(points.map((p) => ({ t: p.t, v: p.hour })));
  const per4w = drift ? drift.slope * 28 : 0;
  const verdict = iqr > 2.5 ? "rozhazene" : Math.abs(per4w) >= 1 ? "posouva" : "ok";
  return { enough: true, n: points.length, median: q(0.5), iqr, driftPer4w: per4w, verdict };
}

/** Váha sama o sobě nic neříká. Teprve spolu se silou z toho je rozhodnutí. */
export function weightStrengthVerdict(kgPerWeek, strengthPct) {
  if (typeof kgPerWeek !== "number" || typeof strengthPct !== "number") return null;
  const w = kgPerWeek > 0.1 ? "roste" : kgPerWeek < -0.1 ? "klesa" : "stoji";
  const s = strengthPct > 0.5 ? "roste" : strengthPct < -0.5 ? "klesa" : "stoji";
  return { w, s, key: w + "|" + s };
}

/**
 * O kolik se vážení liší od vlastního klouzavého průměru podle toho, co bylo
 * předtím. Pracuje se s odchylkou, ne s absolutní váhou, jinak by výsledek
 * ovlivnil dlouhodobý trend.
 */
export function weightContextEffects(rolled, ctxList) {
  const dev = rolled.filter((p) => p.n >= 3).map((p) => ({ ...p, d: p.v - p.avg }));
  return ctxList.map((c) => {
    const on = dev.filter((p) => p.ctx && p.ctx[c.k]).map((p) => p.d);
    const off = dev.filter((p) => !(p.ctx && p.ctx[c.k])).map((p) => p.d);
    return { key: c.k, label: c.label, ...welch(on, off) };
  });
}
