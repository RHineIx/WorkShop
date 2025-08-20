// js/sw.js
const CACHE_NAME = "workshop-v5.42.2";
const DATA_CACHE_NAME = "workshop-data-v1";

const URLS_TO_CACHE = [
  "/",
  "/index.html",
  "/offline.html",
  "/manifest.json",
  "/version.json",
  "Box.svg",
  "/css/style.css",
  "/css/variables.css",
  "/css/base.css",
  "/css/layout.css",
  "/css/components/_activity-log.css",
  "/css/components/_bulk-actions.css",
  "/css/components/_buttons.css",
  "/css/components/_cards.css",
  "/css/components/_category-filter.css",
  "/css/components/_category-input.css",
  "/css/components/_confirm-modal.css",
  "/css/components/_cropper.css",
  "/css/components/_dashboard.css",
  "/css/components/_forms.css",
  "/css/components/_header.css",
  "/css/components/_modals.css",
  "/css/components/_scroll-to-top.css",
  "/css/components/_search.css",
  "/css/components/_theme-transition.css",
  "/css/components/_utilities.css",
  "/js/main.js",
  "/js/app.js",
  "/js/api.js",
  "/js/db.js",
  "/js/dom.js",
  "/js/eventSetup.js",
  "/js/layout.js",
  "/js/logger.js",
  "/js/navigation.js",
  "/js/notifications.js",
  "/js/renderer.js",
  "/js/state.js",
  "/js/ui.js",
  "/js/ui_helpers.js",
  "/js/utils.js",
  "/js/handlers/activityLogHandlers.js",
  "/js/handlers/bulkActionHandlers.js",
  "/js/handlers/dashboardHandlers.js",
  "/js/handlers/generalHandlers.js",
  "/js/handlers/inventoryHandlers.js",
  "/js/handlers/modalHandlers.js",
  "/js/handlers/supplierHandlers.js",
  "/js/handlers/syncHandlers.js",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
  "https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.2/cropper.min.css",
  "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.2/cropper.min.js",
  "https://code.iconify.design/iconify-icon/2.1.0/iconify-icon.min.js",
  "https://fonts.googleapis.com/css2?family=Cairo:wght@400;800&family=Roboto+Mono:wght@500&display=swap",
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
          if (networkResponse.ok) {
            return caches.open(DATA_CACHE_NAME).then(cache => {
              cache.put(request, networkResponse.clone());
              return networkResponse;
            });
          }
          return caches.match(request);
        })
        .catch(() => {
          console.log("Service Worker: Network failed, trying cache for", request.url);
          return caches.match(request);
        })
    );
    return;
  }

  // Strategy for App Shell & other assets (Cache-First, Network-Fallback with App Shell Fallback)
  event.respondWith(
    caches.match(request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request)
        .then(networkResponse => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
          }
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
              cache.put(request, responseToCache);
          });
          return networkResponse;
        })
        .catch(() => {
          // If network fails, and it's a navigation request, try to serve the main app shell.
          if (request.mode === 'navigate') {
            return caches.match('/index.html').then(appShellResponse => {
              // If the app shell is cached, return it.
              if (appShellResponse) {
                return appShellResponse;
              }
              // As a last resort, if even the app shell isn't cached, show the generic offline page.
              return caches.match('/offline.html');
            });
          }
        });
    })
  );
});
