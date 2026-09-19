// Service Worker - Tablet Studio PWA (Cache-First / 100% Offline Resilience)
const CACHE_NAME = 'tablet-studio-v1.0.3';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/storage.js',
  './js/canvas.js',
  './js/pdf-viewer.js',
  './js/app.js',
  './libs/pdf.min.js',
  './libs/pdf.worker.min.js',
  './app-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Instalación: Cachear todos los recursos críticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[SW] Pre-cacheando activos estáticos para modo offline...');
      for (const url of ASSETS_TO_CACHE) {
        try {
          await cache.add(url);
        } catch (err) {
          console.warn(`[SW] Advertencia al cachear "${url}":`, err);
        }
      }
    }).then(() => self.skipWaiting())
  );
});

// Activación: Limpieza de versiones obsoletas de caché
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Eliminando caché antigua:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Estrategia Cache-First con fallback a red
self.addEventListener('fetch', (event) => {
  // Ignorar peticiones que no sean GET (como IndexedDB o APIs nativas)
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      // Si no está en caché, buscar en red y cachear dinámicamente si es un recurso seguro
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch(() => {
        // Modo offline total: si falla la red y se solicita HTML, servir index.html
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match('./index.html');
        }
      });
    })
  );
});
