import pg from "pg";
import { validatePlan, carryWeights, BUILTIN_PLAN } from "../shared/plan.js";

const { Pool } = pg;

function sslConfig(url) {
  const mode = (process.env.PGSSLMODE || "").toLowerCase();
  if (mode === "disable") return false;
  if (mode === "require") return { rejectUnauthorized: false };
  // Railway: interní síť (*.railway.internal) SSL nepotřebuje, veřejný proxy ano.
  try {
    const host = new URL(url).hostname;
    if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".railway.internal")) return false;
  } catch {}
  return { rejectUnauthorized: false };
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Chybí DATABASE_URL. Na Railway přidej Postgres plugin, lokálně nastav .env.");
  process.exit(1);
}

export const pool = new Pool({ connectionString: url, ssl: sslConfig(url), max: 5 });

export async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id         BIGSERIAL PRIMARY KEY,
      date       TIMESTAMPTZ NOT NULL UNIQUE,
      day        TEXT NOT NULL,
      ctx        JSONB NOT NULL DEFAULT '{}'::jsonb,
      ex         JSONB NOT NULL DEFAULT '[]'::jsonb,
      deload     BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE sessions ADD COLUMN IF NOT EXISTS deload BOOLEAN NOT NULL DEFAULT false;
    CREATE INDEX IF NOT EXISTS sessions_date_idx ON sessions (date);
    CREATE TABLE IF NOT EXISTS plans (
      id         BIGSERIAL PRIMARY KEY,
      name       TEXT NOT NULL,
      doc        JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE sessions ADD COLUMN IF NOT EXISTS plan_id BIGINT REFERENCES plans(id) ON DELETE SET NULL;
    CREATE TABLE IF NOT EXISTS kv (
      key        TEXT PRIMARY KEY,
      value      JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

const KV_KEYS = ["weights", "fails", "draft", "nextDay", "created", "lastBackup", "cycle", "activePlan"];
const KV_DEFAULTS = { weights: {}, fails: {}, draft: null, nextDay: "A", created: null, lastBackup: null, cycle: null, activePlan: null };

/** Dnešek v Praze jako YYYY-MM-DD. */
function todayPrague() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Prague" });
}
const planDoc = (row) => ({ ...row.doc, id: Number(row.id), name: row.name, savedAt: row.created_at.toISOString() });

/** Vrátí celý stav deníku ve formátu, se kterým pracuje frontend. */
export async function loadState() {
  const [kv, sessions, plans] = await Promise.all([
    pool.query("SELECT key, value FROM kv"),
    pool.query("SELECT date, day, ctx, ex, deload, plan_id FROM sessions ORDER BY date ASC"),
    pool.query("SELECT id, name, doc, created_at FROM plans ORDER BY id ASC"),
  ]);
  const state = { ...KV_DEFAULTS };
  for (const r of kv.rows) if (KV_KEYS.includes(r.key)) state[r.key] = r.value;
  if (!state.created) state.created = new Date().toISOString();
  state.sessions = sessions.rows.map((r) => ({
    date: r.date.toISOString(),
    day: r.day,
    ctx: r.ctx || {},
    ex: r.ex || [],
    deload: !!r.deload,
    planId: r.plan_id === null ? 0 : Number(r.plan_id),
  }));
  state.plans = { 0: BUILTIN_PLAN };
  for (const r of plans.rows) state.plans[Number(r.id)] = planDoc(r);
  state.plan = state.plans[state.activePlan] || BUILTIN_PLAN;
  return state;
}

function validSession(s) {
  return (
    s && typeof s === "object" &&
    typeof s.date === "string" && !Number.isNaN(Date.parse(s.date)) &&
    typeof s.day === "string" && s.day.length <= 8 &&
    Array.isArray(s.ex)
  );
}

/** Uloží celý stav. Tréninky se párují podle data; chybějící se smažou (mazání v UI). */
export async function saveState(state) {
  if (!state || typeof state !== "object") throw new Error("bad state");
  const sessions = Array.isArray(state.sessions) ? state.sessions.filter(validSession) : [];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const key of KV_KEYS) {
      if (!(key in state)) continue;
      await client.query(
        `INSERT INTO kv (key, value) VALUES ($1, $2::jsonb)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [key, JSON.stringify(state[key] ?? null)],
      );
    }
    const dates = sessions.map((s) => new Date(s.date).toISOString());
    for (const s of sessions) {
      await client.query(
        `INSERT INTO sessions (date, day, ctx, ex, deload, plan_id) VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6)
         ON CONFLICT (date) DO UPDATE SET day = EXCLUDED.day, ctx = EXCLUDED.ctx, ex = EXCLUDED.ex, deload = EXCLUDED.deload, plan_id = EXCLUDED.plan_id, updated_at = now()`,
        [new Date(s.date).toISOString(), s.day, JSON.stringify(s.ctx || {}), JSON.stringify(s.ex), !!s.deload, s.planId > 0 ? s.planId : null],
      );
    }
    if (dates.length) {
      await client.query("DELETE FROM sessions WHERE NOT (date = ANY($1::timestamptz[]))", [dates]);
    } else {
      await client.query("DELETE FROM sessions");
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function loadSessions(from, to) {
  const conds = [], params = [];
  if (from) { params.push(from); conds.push(`date >= $${params.length}`); }
  if (to) { params.push(to); conds.push(`date < $${params.length}`); }
  const where = conds.length ? "WHERE " + conds.join(" AND ") : "";
  const r = await pool.query(`SELECT date, day, ctx, ex, deload, plan_id FROM sessions ${where} ORDER BY date ASC`, params);
  return r.rows.map((x) => ({ date: x.date.toISOString(), day: x.day, ctx: x.ctx || {}, ex: x.ex || [], deload: !!x.deload, planId: x.plan_id === null ? 0 : Number(x.plan_id) }));
}

/**
 * Nasadí nový plán: uloží ho, přenese pracovní váhy, založí nový cyklus
 * a zahodí rozdělaný trénink. Všechno v jedné transakci, takže buď projde
 * celé, nebo se nezmění nic.
 */
export async function applyPlan(input) {
  const v = validatePlan(input);
  if (!v.ok) return { ok: false, errors: v.errors };
  const plan = v.plan;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cur = await client.query("SELECT key, value FROM kv WHERE key IN ('weights','cycle')");
    const byKey = Object.fromEntries(cur.rows.map((r) => [r.key, r.value]));
    const ins = await client.query(
      "INSERT INTO plans (name, doc) VALUES ($1, $2::jsonb) RETURNING id, name, doc, created_at",
      [plan.name, JSON.stringify(plan)],
    );
    const stored = planDoc(ins.rows[0]);
    const weights = carryWeights(plan, byKey.weights || {});
    const cycle = { n: (((byKey.cycle || {}).n || 0) + 1) || 1, start: todayPrague() };
    const next = [
      ["activePlan", stored.id],
      ["weights", weights],
      ["fails", {}],
      ["draft", null],
      ["nextDay", plan.order[0]],
      ["cycle", cycle],
    ];
    for (const [key, value] of next) {
      await client.query(
        `INSERT INTO kv (key, value) VALUES ($1, $2::jsonb)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [key, JSON.stringify(value ?? null)],
      );
    }
    await client.query("COMMIT");
    return { ok: true, plan: stored };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
