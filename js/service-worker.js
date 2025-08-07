// js/service-worker.js

const CACHE_NAME = "workshop-cache-v2"; // Increment cache version
const DATA_CACHE_NAME = "workshop-data-cache-v1";

// App Shell: The essential files for the app UI to work
const APP_SHELL_URLS = [
  "/",
  "/index.html",
  "/css/style.css",
  "/css/variables.css",
  "/css/base.css",
  "/css/layout.css",
  "/css/components/_header.css",
  "/css/components/_buttons.css",
  "/css/components/_forms.css",
  "/css/components/_cards.css",
  "/css/components/_modals.css",
  "/css/components/_utilities.css",
  "/css/components/_cropper.css",
  "/css/components/_dashboard.css",
  "/js/main.js",
  "/js/ui.js",
  "/js/api.js",
  "/js/state.js",
  "/js/utils.js",
  "/js/db.js",
  "https://code.iconify.design/iconify-icon/2.1.0/iconify-icon.min.js",
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log("Opened app shell cache");
      // Add fallible resources separately to not fail the entire installation
      cache
        .add(
          "https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&family=Roboto+Mono:wght@500&display=swap"
        )
        .catch(() => console.warn("Couldn't cache Google Fonts."));
      return cache.addAll(APP_SHELL_URLS);
    })
  );
});

// Clean up old caches
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && cacheName !== DATA_CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener("fetch", event => {
  const { request } = event;
  const url = new URL(request.url);

  // Strategy 1: For GitHub API data (Network first, then cache)
  if (
    url.hostname === "api.github.com" &&
    url.pathname.includes("/contents/")
  ) {
    event.respondWith(
      caches.open(DATA_CACHE_NAME).then(cache => {
        return fetch(request)
          .then(response => {
            // If the request is successful, clone it and store in cache
            if (response.ok) {
              cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => {
            // If the network fails, try to get it from the cache
            return cache.match(request);
          });
      })
    );
    // Strategy 2: For App Shell (Cache first, then network)
  } else if (
    APP_SHELL_URLS.some(path => url.pathname.endsWith(path)) ||
    url.origin === location.origin
  ) {
    event.respondWith(
      caches.match(request).then(response => {
        return (
          response ||
          fetch(request).then(fetchResponse => {
            // Optionally, cache newly encountered local resources
            if (url.origin === location.origin) {
              caches
                .open(CACHE_NAME)
                .then(cache => cache.put(request, fetchResponse.clone()));
            }
            return fetchResponse;
          })
        );
      })
    );
  }
  // For all other requests (like external images, fonts), just go to the network.
  // The browser will handle IndexedDB requests for images separately.
});
