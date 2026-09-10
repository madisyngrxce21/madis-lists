/*
  Service worker for offline support.

  Strategy: network-first, cache as a fallback. Every request tries the
  network first so you always see the latest deployed version while
  online (this app updates often, and a cache-first strategy would keep
  showing stale pages after every deploy). Only when the network is
  unavailable does it fall back to whatever was last cached — that's what
  makes the app usable with no signal.
*/
const CACHE_NAME = "madis-lists-v2";
const PRECACHE_URLS = [
  "./",
  "index.html",
  "moving.html",
  "budget.html",
  "fitness.html",
  "reading.html",
  "movies.html",
  "recipes.html",
  "meal-planner.html",
  "sync.js",
  "manifest.json",
  "icon-192.png",
  "icon-512.png",
  "Dashboard.dc.html",
  "support.js",
  "baking.html",
  "assets/galaxy-clouds.jpg",
  "assets/dreamy-sky.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  // Let Firestore/Firebase network requests pass straight through.
  if (event.request.url.includes("googleapis.com") || event.request.url.includes("gstatic.com")) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && response.type === "basic") {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
