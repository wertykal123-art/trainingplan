/* Service worker: aplikace se načte i bez signálu, data jdou vždy ze serveru (s cache jako zálohou). */
const VERSION = "v2";
const SHELL = ["/", "/index.html", "/style.css", "/app.js", "/shared/program.js", "/shared/cycle.js", "/manifest.webmanifest", "/icons/icon.svg", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.origin !== location.origin) return; // fonty apod. – nechat prohlížeči
  if (url.pathname.startsWith("/api/")) return; // data vždy živě; offline řeší app.js
  // navigace → index.html (SPA), ostatní network-first s cache jako zálohou
  const req = e.request.mode === "navigate" ? new Request("/index.html") : e.request;
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((r) => r || caches.match("/index.html")))
  );
});
