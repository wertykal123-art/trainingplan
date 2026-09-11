import crypto from "node:crypto";

const COOKIE = "denik_session";
const MAX_AGE_S = 90 * 24 * 3600; // 90 dní

const password = process.env.APP_PASSWORD;
if (!password) {
  console.error("Chybí APP_PASSWORD – bez hesla se do deníku nedá přihlásit.");
  process.exit(1);
}
let secret = process.env.SESSION_SECRET;
if (!secret) {
  secret = crypto.randomBytes(32).toString("hex");
  console.warn("SESSION_SECRET není nastavený – po restartu serveru se budeš muset znovu přihlásit.");
}

const pwHash = crypto.createHash("sha256").update(password).digest();

export function checkPassword(candidate) {
  if (typeof candidate !== "string") return false;
  const h = crypto.createHash("sha256").update(candidate).digest();
  return crypto.timingSafeEqual(h, pwHash);
}

function sign(payload) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

export function issueToken() {
  const exp = String(Math.floor(Date.now() / 1000) + MAX_AGE_S);
  const nonce = crypto.randomBytes(8).toString("base64url");
  const payload = `${exp}.${nonce}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token) {
  if (typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [exp, nonce, sig] = parts;
  const expected = sign(`${exp}.${nonce}`);
  if (sig.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  return Number(exp) > Math.floor(Date.now() / 1000);
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function secure(req) {
  return process.env.NODE_ENV === "production" || req.headers["x-forwarded-proto"] === "https";
}

export function setSessionCookie(req, res) {
  const attrs = [
    `${COOKIE}=${issueToken()}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${MAX_AGE_S}`,
  ];
  if (secure(req)) attrs.push("Secure");
  res.setHeader("Set-Cookie", attrs.join("; "));
}

export function clearSessionCookie(req, res) {
  const attrs = [`${COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secure(req)) attrs.push("Secure");
  res.setHeader("Set-Cookie", attrs.join("; "));
}

export function isAuthed(req) {
  return verifyToken(parseCookies(req.headers.cookie)[COOKIE]);
}

/* jednoduchá ochrana proti hádání hesla: 8 pokusů za 15 minut na IP */
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000, LIMIT = 8;

export function loginAllowed(ip) {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || now - a.start > WINDOW_MS) return true;
  return a.count < LIMIT;
}
export function recordFailedLogin(ip) {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || now - a.start > WINDOW_MS) attempts.set(ip, { start: now, count: 1 });
  else a.count++;
  if (attempts.size > 5000) attempts.clear();
}
export function clearFailedLogins(ip) { attempts.delete(ip); }

export function requireAuth(req, res, next) {
  if (isAuthed(req)) return next();
  res.status(401).json({ error: "unauthorized" });
}
