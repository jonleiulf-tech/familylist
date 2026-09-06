/* PSI som app. Nettstedet er en progressiv nettapp: den samme siden, men
   lagt på hjemskjermen eller i Start-menyen, med eget ikon og uten
   adressefelt. Ingen App Store, ingen nedlasting, ingen egen konto.

   To ting skal til, og begge ligger i denne mappa: manifestet
   (public/manifest.webmanifest) og service workeren (src/sw.js).
   Her er bare limet – det nettleseren skal spørres om, og det brukeren
   skal få se.

   Alt som kan regnes ut av en streng er skilt ut som rene funksjoner, så
   oppskriftene kan prøves uten en nettleser. */

/* ---------- Hvilken maskin sitter de på? ---------- */

export function plattform(ua = '', touchPunkter = 0) {
  const s = String(ua);
  if (/iPhone|iPod/.test(s)) return 'ios';
  // iPad utgir seg for å være en Mac fra iPadOS 13. Berøringspunktene
  // avslører den: en ekte Mac melder null.
  if (/iPad/.test(s) || (/Macintosh/.test(s) && touchPunkter > 1)) return 'ios';
  if (/Android/.test(s)) return 'android';
  if (/Windows/.test(s)) return 'windows';
  if (/Macintosh|Mac OS X/.test(s)) return 'mac';
  return 'annet';
}

export function nettleser(ua = '') {
  const s = String(ua);
  // Rekkefølgen teller: Edge og Samsung Internet sier begge «Chrome» om
  // seg selv, og Chrome sier «Safari».
  if (/Edg\//.test(s)) return 'edge';
  if (/SamsungBrowser/.test(s)) return 'samsung';
  if (/OPR\/|Opera/.test(s)) return 'opera';
  if (/Firefox\/|FxiOS/.test(s)) return 'firefox';
  if (/CriOS/.test(s)) return 'chrome';
  if (/Chrome\//.test(s)) return 'chrome';
  if (/Safari\//.test(s)) return 'safari';
  return 'annet';
}

/* Hvilken oppskrift skal stå øverst. Nøklene finnes i i18n/strings.js.

   På iOS er det bare Safari som kan legge til på hjemskjermen – Chrome og
   Firefox der er Safari i forkledning, men mangler menyvalget. Da er det
   ærligere å si «åpne siden i Safari først» enn å vise en oppskrift som
   ikke finnes i menyen deres. */
export function oppskrift(p, n) {
  if (p === 'ios') return n === 'safari' ? 'ios' : 'iosAnnen';
  if (p === 'android') return n === 'firefox' ? 'firefox' : 'android';
  if (p === 'mac') return n === 'safari' ? 'mac' : 'skrivebord';
  if (p === 'windows') return n === 'firefox' ? 'firefox' : 'skrivebord';
  return 'skrivebord';
}

/* Alle oppskriftene, i den rekkefølgen de skal stå når vi ikke vet noe.
   Den som passer maskinen løftes til toppen. */
export const OPPSKRIFTER = ['ios', 'iosAnnen', 'android', 'skrivebord', 'mac', 'firefox'];

export function sortertEtter(valgt, alle = OPPSKRIFTER) {
  return [valgt, ...alle.filter((x) => x !== valgt)].filter((x) => alle.includes(x));
}

/* Kjører vi allerede som installert app? display-mode er det som gjelder
   overalt bortsett fra på iOS, der Safari har sin egen gamle flagg. */
export function erInstallert(vindu = typeof window !== 'undefined' ? window : null) {
  if (!vindu) return false;
  const st = vindu.matchMedia && vindu.matchMedia('(display-mode: standalone)').matches;
  return Boolean(st || vindu.navigator?.standalone);
}

/* ---------- Installasjonsvarselet fra nettleseren ---------- */

/* Chrome, Edge og Samsung Internet fyrer av beforeinstallprompt når siden
   er installerbar, og lar oss ta vare på hendelsen og bruke den senere.
   Den kommer ofte før React har rukket å montere noe som helst, så vi tar
   imot den her ved import og gir beskjed videre til den som spør. */
let ventende = null;
const lyttere = new Set();
const si = () => lyttere.forEach((f) => f(ventende));

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Uten dette viser Chrome sitt eget lille banner nederst. Vi vil ha
    // knappen på /app i stedet, der oppskriften står ved siden av.
    e.preventDefault();
    ventende = e;
    si();
  });
  window.addEventListener('appinstalled', () => {
    ventende = null;
    si();
  });
}

export function abonnerPåInstall(fn) {
  lyttere.add(fn);
  fn(ventende);
  return () => lyttere.delete(fn);
}

export async function installer() {
  if (!ventende) return 'ingen';
  const e = ventende;
  ventende = null;
  si();
  e.prompt();
  const { outcome } = await e.userChoice;
  return outcome === 'accepted' ? 'installert' : 'avslått';
}

/* ---------- Service workeren ---------- */

/* Meldes på ved oppstart. Nettleseren ser etter en ny sw.js på egen hånd,
   men bare av og til; vi ber om en sjekk når fanen kommer fram igjen, så
   en utrulling midt på dagen ikke blir stående en uke.

   onNyVersjon kalles når en ny versjon ligger klar og venter. */
export function registrerSw({ onNyVersjon } = {}) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return () => {};
  if (import.meta.env?.DEV) return () => {};

  let reg = null;
  const meldFra = (r) => {
    if (r.waiting && navigator.serviceWorker.controller) onNyVersjon?.(r.waiting);
  };

  navigator.serviceWorker
    .register('/sw.js')
    .then((r) => {
      reg = r;
      meldFra(r);
      r.addEventListener('updatefound', () => {
        const ny = r.installing;
        if (!ny) return;
        ny.addEventListener('statechange', () => {
          // «installed» med en kontroller i sving betyr at dette er en
          // oppdatering, ikke førstegangsinstallasjon.
          if (ny.state === 'installed' && navigator.serviceWorker.controller) onNyVersjon?.(ny);
        });
      });
    })
    .catch(() => {});

  const sjekk = () => {
    if (reg && document.visibilityState === 'visible') reg.update().catch(() => {});
  };
  document.addEventListener('visibilitychange', sjekk);

  navigator.serviceWorker.addEventListener(
    'controllerchange',
    kontrollerbytte({
      haddeKontroller: Boolean(navigator.serviceWorker.controller),
      last: () => window.location.reload(),
    }),
  );

  return () => document.removeEventListener('visibilitychange', sjekk);
}

/* Hva som skal skje når en service worker tar over siden.

   Første gang noen besøker psiusn.no finnes det ingen worker. Den nye
   installerer seg, kaller clients.claim(), og da fyrer controllerchange
   selv om ingenting er oppdatert. Lastet vi siden på nytt der, ville
   hvert eneste førstebesøk blinke og starte om – midt i en skjemautfylling
   i verste fall. Vi laster bare når det faktisk var en worker fra før,
   altså når dette er et bytte av versjon. Og bare én gang. */
export function kontrollerbytte({ haddeKontroller, last }) {
  let hadde = haddeKontroller;
  let gjort = false;
  return () => {
    if (!hadde) {
      hadde = true;
      return false;
    }
    if (gjort) return false;
    gjort = true;
    last();
    return true;
  };
}

export function taIBrukNyVersjon(worker) {
  worker?.postMessage({ type: 'BYTT_NÅ' });
}
