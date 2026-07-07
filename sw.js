const CACHE = "runnr-v47";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  // Always fetch fresh HTML/JS — never serve stale app code from cache.
  if (url.pathname.endsWith(".html") || url.pathname.endsWith("/") || url.pathname.includes("/js/")) {
    e.respondWith(fetch(e.request));
    return;
  }
});
