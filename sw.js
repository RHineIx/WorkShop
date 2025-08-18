// js/sw.js
const CACHE_NAME = "workshop-v5.39.10";
const DATA_CACHE_NAME = "workshop-data-v1";

const URLS_TO_CACHE = [
  "/",
  "/index.html",
  "/offline.html",
  "/css/style.css",
  "/js/main.js",
  "/js/api.js",
  "/js/db.js",
  "/js/state.js",
  "/js/ui.js",
  "/js/utils.js",
  "https://code.iconify.design/iconify-icon/2.1.0/iconify-icon.min.js",
  "https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&family=Roboto+Mono:wght@500&display=swap",
  "/icons/icon-192x192.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log("Service Worker: Caching app shell");
      return cache.addAll(URLS_TO_CACHE);
    })
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && cacheName !== DATA_CACHE_NAME) {
            console.log("Service Worker: Deleting old cache:", cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", event => {
  const { request } = event;

  // Ignore non-GET requests
  if (request.method !== "GET") {
    return;
  }

  // Strategy for API data (Network-First, Cache-Fallback)
  if (request.url.includes("api.github.com/repos")) {
    event.respondWith(
      fetch(request)
        .then(networkResponse => {
          // If we get a valid response, cache it and return it
          if (networkResponse.ok) {
            return caches.open(DATA_CACHE_NAME).then(cache => {
              cache.put(request, networkResponse.clone());
              return networkResponse;
            });
          }
          // If the server returns an error, try the cache
          return caches.match(request);
        })
        .catch(() => {
          // If the network request fails (offline), try to get it from the cache
          console.log("Service Worker: Network failed, trying cache for", request.url);
          return caches.match(request);
        })
    );
    return;
  }

  // Strategy for App Shell & other assets (Cache-First, Network-Fallback)
  event.respondWith(
    caches.match(request).then(cachedResponse => {
      // Return the cached response if it exists
      if (cachedResponse) {
        return cachedResponse;
      }

      // If not in cache, fetch from the network
      return fetch(request).then(networkResponse => {
          // Don't cache opaque responses (e.g., from CDNs without CORS)
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
          }
          // Cache the new response
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
              cache.put(request, responseToCache);
          });
          return networkResponse;
        })
        .catch(() => {
          // If both cache and network fail, show the offline page for navigation requests
          if (request.mode === 'navigate') {
            return caches.match('/offline.html');
          }
        });
    })
  );
});
