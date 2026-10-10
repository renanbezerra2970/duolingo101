/* Service worker: deixa o app instalável e funcionando offline.
   - páginas, código e lições: tenta a internet primeiro (pega sempre a versão nova), cai no cache se estiver offline
   - áudios e ícones: cache primeiro (o nome do MP3 muda quando o conteúdo muda) */
const CACHE = "d101-v3";
const SHELL = ["/", "/index.html", "/style.css", "/app.js", "/manifest.webmanifest", "/icons/icon.svg",
  "/data/units.json", "/data/levels.json", "/data/glossary.json", "/audio/manifest.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  const immutable = /\.(mp3|png|ico)$/.test(url.pathname) && url.pathname !== "/audio/manifest.json";
  e.respondWith(immutable ? cacheFirst(e.request) : networkFirst(e.request));
});

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  // o <audio> pede pedaços (Range → 206), que não podem ir pro cache; baixa o arquivo inteiro
  const res = await fetch(req.url);
  if (res.status === 200) (await caches.open(CACHE)).put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
    return res;
  } catch {
    return (await caches.match(req, { ignoreSearch: true })) || caches.match("/index.html");
  }
}
