// Fidolio service worker — minimal, network-first.
// Enables "Add to Home Screen" without serving stale data:
// API calls and navigations always hit the network; we only fall back
// to a cached app shell when offline.
const SHELL = "fidolio-shell-v1";

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(SHELL).then((c) => c.add("/")));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  // Never cache API traffic — always live data
  if (request.method !== "GET" || /\/(library|stats|search|discovery|nowplaying|albums|collab|playlists)\b/.test(request.url)) {
    return; // let the browser handle it normally
  }
  // For navigations, try network, fall back to cached shell when offline
  if (request.mode === "navigate") {
    e.respondWith(fetch(request).catch(() => caches.match("/")));
    return;
  }
  // Static assets: cache-first, then network
  e.respondWith(
    caches.match(request).then((hit) =>
      hit ||
      fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(SHELL).then((c) => c.put(request, copy)).catch(() => {});
        return res;
      })
    )
  );
});
