/* Cyklus deníku: 4 týdny, poslední je záměrně lehký (deload).
   Sdílené mezi prohlížečem a serverem. */

export const CYCLE_WEEKS = 4;
export const DELOAD_FACTOR = 0.9;
const DAY = 86400000;

/** Půlnoc daného dne jako číslo. Bere "YYYY-MM-DD" i celé ISO datum. */
export function startOfDay(d) {
  if (typeof d === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
    if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  }
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return NaN;
  return Date.UTC(x.getFullYear(), x.getMonth(), x.getDate());
}

export function todayISO(now = new Date()) {
  return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
}

/** Kolikátý den cyklu (0 = první den). */
export function dayInCycle(start, now = new Date()) {
  const a = startOfDay(start), b = startOfDay(now);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / DAY));
}

/** Kolikátý týden cyklu (1 = první). Po konci cyklu roste dál. */
export function cycleWeek(start, now = new Date()) {
  return Math.floor(dayInCycle(start, now) / 7) + 1;
}

/** Poslední týden cyklu = lehký. */
export function isDeloadWeek(start, now = new Date()) {
  return cycleWeek(start, now) === CYCLE_WEEKS;
}

/** Cyklus přetekl – je čas na export a nový plán. */
export function cycleEnded(start, now = new Date()) {
  return cycleWeek(start, now) > CYCLE_WEEKS;
}

/** Poslední den cyklu. */
export function cycleEnd(start) {
  return new Date(startOfDay(start) + (CYCLE_WEEKS * 7 - 1) * DAY);
}

/** Váha pro lehký týden, zaokrouhlená na nejmenší dostupný kotouč. */
export function deloadWeight(w, step) {
  const s = step > 0 ? step : 1;
  if (!w || w <= 0) return 0;
  return Math.max(s, Math.round((w * DELOAD_FACTOR) / s) * s);
}

/** O sérii míň, ale aspoň jedna. */
export function deloadSets(n) {
  return Math.max(1, n - 1);
}
