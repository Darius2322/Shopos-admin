// Minimal service worker: it makes the admin installable as a full-screen app (no browser bar).
// It caches nothing, so the admin is never stale and nothing private is stored.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* network only */ });
