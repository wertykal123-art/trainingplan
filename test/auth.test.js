import { test } from "node:test";
import assert from "node:assert/strict";

process.env.APP_PASSWORD = "tajne123";
process.env.SESSION_SECRET = "test-secret";
const auth = await import("../src/auth.js");

test("kontrola hesla", () => {
  assert.equal(auth.checkPassword("tajne123"), true);
  assert.equal(auth.checkPassword("tajne124"), false);
  assert.equal(auth.checkPassword(""), false);
  assert.equal(auth.checkPassword(undefined), false);
});

test("token se ověří a padělek ne", () => {
  const t = auth.issueToken();
  assert.equal(auth.verifyToken(t), true);
  const [exp, nonce, sig] = t.split(".");
  assert.equal(auth.verifyToken(`${Number(exp) + 999}.${nonce}.${sig}`), false, "změněná expirace");
  assert.equal(auth.verifyToken(`${exp}.${nonce}.${sig.slice(0, -2)}xx`), false, "změněný podpis");
  assert.equal(auth.verifyToken("nesmysl"), false);
  assert.equal(auth.verifyToken(undefined), false);
});

test("expirovaný token neprojde", () => {
  const t = auth.issueToken();
  const [, nonce, sig] = t.split(".");
  assert.equal(auth.verifyToken(`1.${nonce}.${sig}`), false);
});

test("limit pokusů o přihlášení", () => {
  const ip = "10.0.0.1";
  assert.equal(auth.loginAllowed(ip), true);
  for (let i = 0; i < 8; i++) auth.recordFailedLogin(ip);
  assert.equal(auth.loginAllowed(ip), false);
  auth.clearFailedLogins(ip);
  assert.equal(auth.loginAllowed(ip), true);
});

test("cookie se nastaví a smaže", () => {
  const headers = {};
  const res = { setHeader: (k, v) => { headers[k] = v; } };
  auth.setSessionCookie({ headers: {} }, res);
  assert.match(headers["Set-Cookie"], /^denik_session=.+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=\d+$/);
  auth.setSessionCookie({ headers: { "x-forwarded-proto": "https" } }, res);
  assert.match(headers["Set-Cookie"], /; Secure$/);
  auth.clearSessionCookie({ headers: {} }, res);
  assert.match(headers["Set-Cookie"], /Max-Age=0/);
});
