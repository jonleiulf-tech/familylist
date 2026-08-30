/*
 * Service worker for Plukkelisten-appen (/app/).
 *
 * Strategi:
 *  - Navigasjoner: nett først (nye utrullinger virker umiddelbart), med
 *    bufret /app/-skall som reserve når butikken ikke har dekning.
 *  - /assets/ (hash-navngitt av Vite, uforanderlig): buffer først.
 *  - Google Fonts: buffer først (endres aldri for en gitt URL).
 *  - Alt annet (Supabase, analyse osv.): røres ikke — går rett på nettet.
 *
 * Nye utrullinger trenger ingen SW-oppdatering: navigasjonen henter ny
 * index.html fra nettet, som peker på nye hash-navngitte filer.
 */

const SHELL_CACHE = 'pl-shell-v1';
const ASSET_CACHE = 'pl-assets-v1';
const ASSET_LIMIT = 60; // eldste kastes når bufferen vokser forbi dette

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((c) => c.addAll(['/app/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png']))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE).map((k) => caches.delete(k)),
    )).then(() => self.clients.claim()),
  );
});

async function trimCache(name, limit) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length > limit) await cache.delete(keys[0]); // eldste først (innsettingsrekkefølge)
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // App-navigasjoner: nett først, bufret skall som reserve.
  if (req.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && url.pathname.startsWith('/app')) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put('/app/', copy));
          }
          return res;
        })
        .catch(() => caches.match('/app/')),
    );
    return;
  }

  // Uforanderlige byggefiler + fonter: buffer først.
  const isAsset = url.origin === self.location.origin
    && (url.pathname.startsWith('/assets/') || /\.(png|svg|woff2?)$/.test(url.pathname));
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (isAsset || isFont) {
    event.respondWith(
      caches.match(req).then((hit) => hit ?? fetch(req).then((res) => {
        if (res.ok || res.type === 'opaque') {
          const copy = res.clone();
          caches.open(ASSET_CACHE).then((c) => c.put(req, copy))
            .then(() => trimCache(ASSET_CACHE, ASSET_LIMIT));
        }
        return res;
      })),
    );
  }
  // Alt annet: ikke rør — nettverk som vanlig.
});
