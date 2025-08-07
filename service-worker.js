// service-worker.js

const CACHE_NAME = 'workshop-cache-v2';
const DATA_CACHE_NAME = 'workshop-data-cache-v1';

const APP_SHELL_URLS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/main.js',
  // Add other critical CSS and JS files that are part of the main shell
];

// On install, cache the app shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching App Shell...');
        return cache.addAll(APP_SHELL_URLS);
      })
      .then(() => self.skipWaiting()) // Activate new service worker immediately
  );
});

// On activate, clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && cacheName !== DATA_CACHE_NAME) {
            console.log('Service Worker: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
    .then(() => self.clients.claim()) // Take control of all open clients
  );
});

// On fetch, apply caching strategies
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Strategy: Network First for GitHub API data
  if (url.hostname === 'api.github.com') {
    event.respondWith(
      fetch(request)
        .then(networkResponse => {
          // If successful, update the cache
          const responseToCache = networkResponse.clone();
          caches.open(DATA_CACHE_NAME).then(cache => {
            cache.put(request, responseToCache);
          });
          return networkResponse;
        })
        .catch(() => {
          // If network fails, respond with cached version
          return caches.match(request);
        })
    );
    return;
  }

  // Strategy: Stale-While-Revalidate for App Shell and local assets (CSS, JS, etc.)
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache => {
        return cache.match(request).then(cachedResponse => {
          const fetchPromise = fetch(request).then(networkResponse => {
            cache.put(request, networkResponse.clone());
            return networkResponse;
          });
          // Return cached response immediately, and update cache in background
          return cachedResponse || fetchPromise;
        });
      })
    );
    return;
  }

  // For other requests (like fonts, iconify), just fetch.
  // The browser will handle them with its own cache.
  event.respondWith(fetch(request));
});