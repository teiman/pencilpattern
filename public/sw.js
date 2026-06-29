// Service worker mínimo para PencilPattern (PWA offline).
// Estrategia: cache-first en GET del mismo origen, con relleno en segundo plano.
// Suficiente para que la app cargue sin red una vez visitada; no precachea rutas
// concretas (los assets llevan hash), sino que cachea bajo demanda.
const CACHE = 'pencilpattern-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      if (cached) {
        // Revalida en segundo plano.
        fetch(req)
          .then((res) => res.ok && cache.put(req, res.clone()))
          .catch(() => {});
        return cached;
      }
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        return cached ?? Response.error();
      }
    })(),
  );
});
