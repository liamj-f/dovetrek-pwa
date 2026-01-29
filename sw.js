// DoveTrek Service Worker
const CACHE_NAME = 'dovetrek-v1';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/css/styles.css',
    '/js/app.js',
    '/js/solver.js',
    '/js/csv-parser.js',
    '/js/bng-converter.js',
    '/js/route-card.js',
    '/js/gpx-export.js',
    '/js/github-loader.js',
    '/js/storage.js',
    '/js/distance-calc.js',
    '/icons/icon-192.png',
    '/icons/icon-512.png'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name !== CACHE_NAME)
                        .map((name) => {
                            console.log('[SW] Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => self.clients.claim())
    );
});

// Fetch event - serve from cache, fall back to network
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Handle GitHub raw content requests (data files)
    if (url.hostname === 'raw.githubusercontent.com') {
        event.respondWith(
            caches.open(CACHE_NAME)
                .then((cache) => {
                    return cache.match(request)
                        .then((cachedResponse) => {
                            // Return cached response if available
                            if (cachedResponse) {
                                // Fetch in background to update cache
                                fetch(request)
                                    .then((networkResponse) => {
                                        if (networkResponse.ok) {
                                            cache.put(request, networkResponse.clone());
                                        }
                                    })
                                    .catch(() => {});
                                return cachedResponse;
                            }

                            // Otherwise fetch from network
                            return fetch(request)
                                .then((networkResponse) => {
                                    if (networkResponse.ok) {
                                        cache.put(request, networkResponse.clone());
                                    }
                                    return networkResponse;
                                });
                        });
                })
        );
        return;
    }

    // Handle static assets
    event.respondWith(
        caches.match(request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    return cachedResponse;
                }

                return fetch(request)
                    .then((networkResponse) => {
                        // Don't cache non-GET requests or external resources
                        if (request.method !== 'GET' || !url.origin.includes(self.location.origin)) {
                            return networkResponse;
                        }

                        // Cache successful responses
                        if (networkResponse.ok) {
                            const responseToCache = networkResponse.clone();
                            caches.open(CACHE_NAME)
                                .then((cache) => {
                                    cache.put(request, responseToCache);
                                });
                        }

                        return networkResponse;
                    })
                    .catch(() => {
                        // Return offline fallback for navigation requests
                        if (request.mode === 'navigate') {
                            return caches.match('/index.html');
                        }
                        return new Response('Offline', { status: 503 });
                    });
            })
    );
});

// Handle messages from the main thread
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }

    if (event.data && event.data.type === 'CLEAR_DATA_CACHE') {
        caches.open(CACHE_NAME)
            .then((cache) => {
                cache.keys().then((keys) => {
                    keys.forEach((key) => {
                        if (key.url.includes('raw.githubusercontent.com')) {
                            cache.delete(key);
                        }
                    });
                });
            });
    }
});
