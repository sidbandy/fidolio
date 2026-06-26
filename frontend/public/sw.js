// Fidolio service worker — minimal, network-first.
// Enables "Add to Home Screen" without serving stale data:
// API calls and navigations always hit the network; we only fall back
// to a cached app shell when offline.
// v2: only ever cache SAME-ORIGIN static assets. The backend (auth + all API) is a
// different origin, so cross-origin requests bypass the SW entirely — this fixes login
// silently failing because a stale cached /auth/me (a guest response) was served after
// sign-in. Bumping the cache name also evicts any poisoned v1 /auth/me from existing installs.
const SHELL = "fidolio-shell-v2";

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
  const url = new URL(request.url);
  // Only ever touch same-origin GETs. ALL backend traffic (auth + every API call) is
  // cross-origin, so it passes straight through to the network and is never cached —
  // this is what keeps /auth/me live so login state updates the instant you sign in.
  if (request.method !== "GET" || url.origin !== self.location.origin) {
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
