import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate, loadState, saveState, loadSessions, applyPlan, pool } from "./db.js";
import { checkPassword, setSessionCookie, clearSessionCookie, isAuthed, requireAuth, loginAllowed, recordFailedLogin, clearFailedLogins } from "./auth.js";
import { toCSV, toDigest, toJSON } from "./export.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1); // Railway běží za proxy
app.use(express.json({ limit: "5mb" }));

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  next();
});

/* ---------- auth ---------- */
app.post("/api/login", (req, res) => {
  const ip = req.ip;
  if (!loginAllowed(ip)) return res.status(429).json({ error: "Moc pokusů. Zkus to za 15 minut." });
  if (!checkPassword(req.body && req.body.password)) {
    recordFailedLogin(ip);
    return res.status(401).json({ error: "Špatné heslo." });
  }
  clearFailedLogins(ip);
  setSessionCookie(req, res);
  res.json({ ok: true });
});
app.post("/api/logout", (req, res) => { clearSessionCookie(req, res); res.json({ ok: true }); });
app.get("/api/me", (req, res) => res.json({ authed: isAuthed(req) }));

/* ---------- stav deníku ---------- */
app.get("/api/state", requireAuth, async (req, res, next) => {
  try { res.json(await loadState()); } catch (e) { next(e); }
});
async function putState(req, res, next) {
  try {
    await saveState(req.body);
    res.json({ ok: true, savedAt: new Date().toISOString() });
  } catch (e) { next(e); }
}
app.put("/api/state", requireAuth, putState);
app.post("/api/state", requireAuth, putState); // navigator.sendBeacon umí jen POST

/* ---------- plán ---------- */
app.post("/api/plan", requireAuth, async (req, res, next) => {
  try {
    const body = req.body && req.body.plan !== undefined ? req.body.plan : req.body;
    const r = await applyPlan(body);
    if (!r.ok) return res.status(400).json({ error: "Plán neprošel kontrolou.", errors: r.errors });
    res.json({ ok: true, plan: r.plan, state: await loadState() });
  } catch (e) { next(e); }
});

/* ---------- export ---------- */
function parseRange(q) {
  const from = q.from && !Number.isNaN(Date.parse(q.from)) ? new Date(q.from) : null;
  let to = q.to && !Number.isNaN(Date.parse(q.to)) ? new Date(q.to) : null;
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(q.to)) to = new Date(to.getTime() + 86400000); // včetně celého dne "do"
  return { from, to };
}
function fileStamp() { return new Date().toISOString().slice(0, 10); }

app.get("/api/export.:fmt", requireAuth, async (req, res, next) => {
  try {
    const { from, to } = parseRange(req.query);
    const [state, sessions] = await Promise.all([loadState(), loadSessions(from, to)]);
    const fmt = req.params.fmt;
    if (fmt === "json") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="trenink-${fileStamp()}.json"`);
      return res.send(toJSON(state, sessions));
    }
    if (fmt === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="trenink-${fileStamp()}.csv"`);
      return res.send(toCSV(state, sessions));
    }
    if (fmt === "txt") {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      if (req.query.download) res.setHeader("Content-Disposition", `attachment; filename="trenink-rozbor-${fileStamp()}.txt"`);
      return res.send(toDigest(state, sessions));
    }
    res.status(404).json({ error: "Neznámý formát. Použij json, csv nebo txt." });
  } catch (e) { next(e); }
});

app.get("/api/health", async (req, res) => {
  try { await pool.query("SELECT 1"); res.json({ ok: true }); }
  catch { res.status(503).json({ ok: false }); }
});

/* ---------- statické soubory (PWA) ---------- */
const noCache = (res, p) => { if (p.endsWith("sw.js") || p.endsWith("index.html")) res.setHeader("Cache-Control", "no-cache"); };
app.use("/shared", express.static(path.join(ROOT, "shared"), { maxAge: "1h" }));
app.use(express.static(path.join(ROOT, "public"), { maxAge: "1h", setHeaders: noCache }));
app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(ROOT, "public", "index.html")));

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(err.type === "entity.parse.failed" ? 400 : 500).json({ error: "Chyba serveru." });
});

const port = Number(process.env.PORT) || 3000;
migrate().then(() => {
  app.listen(port, () => console.log(`Tréninkový deník běží na portu ${port}`));
}).catch((e) => { console.error("Nepodařilo se připravit databázi:", e); process.exit(1); });
