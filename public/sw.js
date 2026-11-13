// Admin service worker: keeps the app shell (the page and its scripts, nothing private) so the admin opens offline,
// and always tries the network first so it is never stale. Data is never cached: it is always live.
const SHELL = 'admin-shell-v2';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== SHELL) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('message', (e) => { if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch', (e) => {
  const req = e.request; const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // data and other sites: straight to the network
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { const c = r.clone(); caches.open(SHELL).then((x) => x.put('/index.html', c)); return r; })
      .catch(async () => (await caches.match('/index.html')) || new Response('You are offline. Reconnect and reopen the app.', { status: 503, headers: { 'content-type': 'text/plain' } })));
    return;
  }
  if (url.pathname.startsWith('/assets/') || /\.(png|svg|ico|webmanifest|woff2?)$/.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok) { const c = r.clone(); caches.open(SHELL).then((x) => x.put(req, c)); } return r; })));
  }
});
