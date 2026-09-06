/* Service worker: gjør psiusn.no installerbar og lar den åpne uten nett.

   Skrevet for hånd, ikke generert, og uten import og export: en service
   worker kjører som vanlig skript i alle nettlesere vi bryr oss om, mens
   modulvarianten ennå ikke gjør det. Fila skal være kort nok til å leses
   i sin helhet, for en service worker som gjør noe uventet er vond å bli
   kvitt – den blir liggende i nettleseren til noen erstatter den.

   Tre regler, i denne rekkefølgen:
     1. Sidevisninger hentes fra nettet først. Da ser man alltid siste
        versjon når man har dekning, og skallet fra cachen når man ikke har.
     2. /assets/… har innholdshash i navnet og kan aldri endre innhold.
        De leses rett fra cachen.
     3. Resten av våre egne filer (ikoner, logoer, bilder) vises fra
        cachen mens en ny kopi hentes i bakgrunnen.

   Det som ALDRI havner i cachen: /api/ (kalenderfeeden må være fersk),
   /admin (styrets arbeidsflate skal ikke bli liggende på maskinen), og
   alt som ikke er vårt eget domene – Supabase og Google Fonts går rett
   på nettet, hver gang.

   __BUILD_ID__ byttes ut av vite ved bygging (se psi-serviceworker i
   vite.config.js). Fila blir dermed ulik for hver utrulling, og det er
   nettopp det nettleseren bruker for å oppdage at en ny versjon finnes. */

const BYGG = '__BUILD_ID__';
const CACHE = `psi-${BYGG}`;

/* Skallet. index.html ligger på '/', og ruteren tar seg av resten – alle
   stier serveres av den samme fila (se rewrites i vercel.json). */
const SKALL = '/';
const FORHÅNDS = [SKALL, '/manifest.webmanifest', '/favicon-192.png', '/icon-512.png', '/icon-maskable-512.png'];

/* Skal denne forespørselen i det hele tatt innom oss? */
function skalHåndteres(request, opphav) {
  if (request.method !== 'GET') return false;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return false;
  }
  if (url.origin !== opphav) return false;
  if (url.pathname.startsWith('/api/')) return false;
  if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) return false;
  return true;
}

/* Filer med innholdshash i navnet. Endrer de seg, endrer navnet seg. */
function erUforanderlig(sti) {
  return sti.startsWith('/assets/');
}

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      // addAll ryker i sin helhet om én eneste fil mangler, og da blir
      // hele installasjonen stående. Vi tar dem hver for seg.
      Promise.all(FORHÅNDS.map((u) => c.add(u).catch(() => {}))),
    ),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const navn = await caches.keys();
      await Promise.all(navn.filter((n) => n.startsWith('psi-') && n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

/* Siden ber om å få bytte med én gang når brukeren trykker «Oppdater».
   Uten dette blir den nye versjonen stående og venter til hver eneste
   fane er lukket, og det skjer sjelden på en mobil. */
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'BYTT_NÅ') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  const opphav = self.location.origin;
  if (!skalHåndteres(request, opphav)) return;
  const sti = new URL(request.url).pathname;

  // 1. Sidevisninger: nett først, skallet som reserve.
  if (request.mode === 'navigate') {
    e.respondWith(
      (async () => {
        try {
          const svar = await fetch(request);
          // Bare selve skallet lagres. Alle stier gir samme index.html,
          // så én kopi holder – og da slipper vi å fylle cachen med
          // identiske kopier av den under hver adresse noen har besøkt.
          if (svar && svar.ok) (await caches.open(CACHE)).put(SKALL, svar.clone());
          return svar;
        } catch {
          const cachet = await caches.match(SKALL);
          return cachet || Response.error();
        }
      })(),
    );
    return;
  }

  // 2. Filer med hash i navnet: cache først, uten å spørre nettet.
  if (erUforanderlig(sti)) {
    e.respondWith(
      caches.match(request).then(
        (treff) =>
          treff ||
          fetch(request).then(async (svar) => {
            if (svar && svar.ok) (await caches.open(CACHE)).put(request, svar.clone());
            return svar;
          }),
      ),
    );
    return;
  }

  // 3. Resten av våre egne filer: vis det vi har, hent nytt i bakgrunnen.
  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const treff = await cache.match(request);
      const nett = fetch(request)
        .then((svar) => {
          if (svar && svar.ok) cache.put(request, svar.clone());
          return svar;
        })
        .catch(() => null);
      return treff || (await nett) || Response.error();
    })(),
  );
});
