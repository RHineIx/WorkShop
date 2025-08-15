// js/sw.js
const CACHE_NAME = "workshop-v5.33.0";
// IMPORTANT: Remember to bump this version number with every new deployment
const URLS_TO_CACHE = [
  "/",
  "/index.html",
  "/css/style.css",
  "/js/main.js",
  "/js/api.js",
  "/js/db.js",
  "/js/state.js",
  "/js/ui.js",
  "/js/utils.js",
  "https://code.iconify.design/iconify-icon/2.1.0/iconify-icon.min.js",
  "https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&family=Roboto+Mono:wght@500&display=swap",
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(URLS_TO_CACHE);
    })
  );
  // We removed self.skipWaiting() from here to allow the user to control the update.
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log("Service Worker: Deleting old cache:", cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Take control of all open tabs immediately.
  return self.clients.claim();
});

// Listen for a message from the client to skip waiting.
self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", event => {
  // We only want to cache GET requests.
  if (event.request.method !== "GET") {
    return;
  }

  // For API calls to GitHub, always go to the network.
  if (event.request.url.includes("api.github.com")) {
    event.respondWith(fetch(event.request));
    return;
  }

  // For other requests, use a cache-first strategy.
  event.respondWith(
    caches.match(event.request).then(response => {
      // Cache hit - return response.
      if (response) {
        return response;
      }

      return fetch(event.request).then(response => {
        // Check if we received a valid response.
        if (!response || response.status !== 200 || response.type !== "basic") {
          return response;
        }

        const responseToCache = response.clone();

        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });

        return response;
      });
    })
  );
});
