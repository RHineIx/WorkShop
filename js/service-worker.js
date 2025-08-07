// js/service-worker.js

const CACHE_NAME = 'workshop-cache-v1';
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  '/css/style.css',
  '/css/variables.css',
  '/css/base.css',
  '/css/layout.css',
  '/css/components/_header.css',
  '/css/components/_buttons.css',
  '/css/components/_forms.css',
  '/css/components/_cards.css',
  '/css/components/_modals.css',
  '/css/components/_utilities.css',
  '/css/components/_cropper.css',
  '/css/components/_dashboard.css',
  '/js/main.js',
  '/js/ui.js',
  '/js/api.js',
  '/js/state.js',
  '/js/utils.js',
  '/js/db.js',
  'https://code.iconify.design/iconify-icon/2.1.0/iconify-icon.min.js',
  'https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&family=Roboto+Mono:wght@500&display=swap'
];

// Install event: cache the app shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(URLS_TO_CACHE);
      })
  );
});

// Fetch event: serve cached content when offline
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        // Not in cache - fetch from network
        return fetch(event.request);
      })
  );
});