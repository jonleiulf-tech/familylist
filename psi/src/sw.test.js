import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

/* Service workeren testes som det den er: et skript som kjøres i et
   globalt omfang og melder seg på hendelser. Vi lager omfanget selv,
   kjører fila, og driver de ekte lytterne.

   Grunnen til at det er verdt bryet: en service worker som svarer feil
   blir liggende i nettleseren til noen erstatter den. Da vil man vite at
   /api/ og /admin faktisk går utenom cachen, ikke bare tro det. */

const KILDE = readFileSync(new URL('./sw.js', import.meta.url), 'utf8');
const OPPHAV = 'https://psiusn.no';

/* Minste mulige Cache Storage. Nøkkel er hele adressen. */
function lagCaches() {
  const lager = new Map();
  const cache = (navn) => {
    if (!lager.has(navn)) lager.set(navn, new Map());
    const m = lager.get(navn);
    return {
      match: async (req) => m.get(typeof req === 'string' ? ny(req).url : req.url),
      put: async (req, svar) => void m.set(typeof req === 'string' ? ny(req).url : req.url, svar),
      add: async (u) => void m.set(ny(u).url, new Response('forhånd')),
      _m: m,
    };
  };
  return {
    _lager: lager,
    open: async (navn) => cache(navn),
    keys: async () => [...lager.keys()],
    delete: async (navn) => lager.delete(navn),
    match: async (req) => {
      for (const m of lager.values()) {
        const t = m.get(typeof req === 'string' ? ny(req).url : req.url);
        if (t) return t;
      }
      return undefined;
    },
  };
}

const ny = (sti) => new Request(new URL(sti, OPPHAV));
const nav = (sti) => {
  const r = ny(sti);
  // Request i node lar seg ikke sette mode: 'navigate', så vi later som.
  Object.defineProperty(r, 'mode', { value: 'navigate' });
  return r;
};

function kjør({ nettSvarer = async () => new Response('fra nettet', { status: 200 }) } = {}) {
  const lyttere = {};
  const self = {
    location: { origin: OPPHAV },
    addEventListener: (navn, fn) => { (lyttere[navn] ||= []).push(fn); },
    skipWaiting: () => { self._hoppet = true; },
    clients: { claim: async () => {} },
  };
  const caches = lagCaches();
  const kalt = [];
  const fetch = async (req) => { kalt.push(req.url || req); return nettSvarer(req); };
  // eslint-disable-next-line no-new-func
  new Function('self', 'caches', 'fetch', 'Response', 'Request', 'URL', KILDE)(self, caches, fetch, Response, Request, URL);

  /* Kjører fetch-lytteren og gir tilbake svaret den valgte – eller null
     når den lot forespørselen gå utenom oss. */
  const hent = async (request) => {
    let løfte = null;
    const e = { request, respondWith: (p) => { løfte = p; } };
    for (const fn of lyttere.fetch || []) fn(e);
    return løfte ? await løfte : null;
  };
  const vent = async (navn) => {
    const ventet = [];
    const e = { waitUntil: (p) => ventet.push(p) };
    for (const fn of lyttere[navn] || []) fn(e);
    await Promise.all(ventet);
  };
  return { self, caches, kalt, hent, vent, lyttere };
}

describe('service worker: hva som går utenom', () => {
  let sw;
  beforeEach(() => { sw = kjør(); });

  it('lar /api/ gå rett på nettet', async () => {
    // Kalenderfeeden må være fersk. Ligger den i cachen, abonnerer folk
    // på en kalender som aldri endrer seg.
    expect(await sw.hent(ny('/api/kalender/psi.ics'))).toBe(null);
  });

  it('lar /admin gå rett på nettet', async () => {
    expect(await sw.hent(ny('/admin'))).toBe(null);
    expect(await sw.hent(ny('/admin/nyheter/42'))).toBe(null);
  });

  it('rører ikke andre domener', async () => {
    // Supabase og Google Fonts er ikke våre å mellomlagre.
    expect(await sw.hent(new Request('https://abc.supabase.co/rest/v1/news'))).toBe(null);
    expect(await sw.hent(new Request('https://fonts.googleapis.com/css2?family=Barlow'))).toBe(null);
  });

  it('rører ikke annet enn GET', async () => {
    expect(await sw.hent(new Request(new URL('/', OPPHAV), { method: 'POST' }))).toBe(null);
  });
});

describe('service worker: sidevisninger', () => {
  it('henter fra nettet og legger skallet i cachen', async () => {
    const sw = kjør();
    const svar = await sw.hent(nav('/kalender'));
    expect(await svar.text()).toBe('fra nettet');
    const c = await sw.caches.match('/');
    expect(c).toBeTruthy();
  });

  it('lagrer skallet under «/», ikke under hver adresse', async () => {
    // Alle stier gir samme index.html. Lagret vi dem hver for seg, ville
    // cachen fylles med identiske kopier av den samme fila.
    const sw = kjør();
    await sw.hent(nav('/kalender'));
    await sw.hent(nav('/idretter/fotball'));
    const [navn] = await sw.caches.keys();
    const cache = await sw.caches.open(navn);
    expect([...cache._m.keys()].filter((u) => u.includes('kalender'))).toEqual([]);
  });

  it('faller tilbake til skallet når nettet er borte', async () => {
    let nede = false;
    const sw = kjør({ nettSvarer: async () => { if (nede) throw new Error('offline'); return new Response('index', { status: 200 }); } });
    await sw.hent(nav('/'));           // først på nett: skallet havner i cachen
    nede = true;
    const svar = await sw.hent(nav('/idretter/klatring'));
    expect(await svar.text()).toBe('index');
  });

  it('gir et feilsvar når vi er uten nett og uten skall', async () => {
    const sw = kjør({ nettSvarer: async () => { throw new Error('offline'); } });
    const svar = await sw.hent(nav('/'));
    expect(svar.type).toBe('error');
  });

  it('lagrer ikke et svar som feilet', async () => {
    const sw = kjør({ nettSvarer: async () => new Response('ikke funnet', { status: 404 }) });
    await sw.hent(nav('/finnesikke'));
    expect(await sw.caches.match('/')).toBeFalsy();
  });
});

describe('service worker: filer', () => {
  it('leser /assets/ fra cachen uten å spørre nettet', async () => {
    const sw = kjør();
    await sw.hent(ny('/assets/index-abc123.js'));   // første gang: fra nettet
    const før = sw.kalt.length;
    await sw.hent(ny('/assets/index-abc123.js'));   // andre gang: fra cachen
    expect(sw.kalt.length).toBe(før);
  });

  it('viser bilder fra cachen og henter ny kopi i bakgrunnen', async () => {
    const sw = kjør();
    await sw.hent(ny('/images/psi/fotball/card-960.jpg'));
    const før = sw.kalt.length;
    const svar = await sw.hent(ny('/images/psi/fotball/card-960.jpg'));
    expect(await svar.text()).toBe('fra nettet');
    // Den ble hentet igjen – det er meningen: neste gang er den fersk.
    expect(sw.kalt.length).toBeGreaterThan(før);
  });

  it('viser bildet fra cachen selv om nettet er nede', async () => {
    let nede = false;
    const sw = kjør({ nettSvarer: async () => { if (nede) throw new Error('offline'); return new Response('bilde', { status: 200 }); } });
    await sw.hent(ny('/logo/psi-wordmark-white.png'));
    nede = true;
    const svar = await sw.hent(ny('/logo/psi-wordmark-white.png'));
    expect(await svar.text()).toBe('bilde');
  });
});

describe('service worker: livssyklus', () => {
  it('rydder bort cacher fra tidligere utrullinger', async () => {
    const sw = kjør();
    sw.caches._lager.set('psi-gammel1', new Map());
    sw.caches._lager.set('psi-gammel2', new Map());
    sw.caches._lager.set('noe-annet', new Map());   // ikke vår, ikke vår å slette
    await sw.vent('install');
    await sw.vent('activate');
    const igjen = await sw.caches.keys();
    expect(igjen).not.toContain('psi-gammel1');
    expect(igjen).not.toContain('psi-gammel2');
    expect(igjen).toContain('noe-annet');
  });

  it('fullfører installasjonen selv om en fil mangler', async () => {
    // addAll ryker i sin helhet om én fil er borte. Da ville en glemt
    // ikonfil hindret hele installasjonen.
    const sw = kjør();
    await expect(sw.vent('install')).resolves.toBeUndefined();
  });

  it('bytter versjon først når siden ber om det', async () => {
    const sw = kjør();
    expect(sw.self._hoppet).toBeUndefined();
    for (const fn of sw.lyttere.message) fn({ data: { type: 'BYTT_NÅ' } });
    expect(sw.self._hoppet).toBe(true);
  });

  it('bytter ikke på en tilfeldig melding', async () => {
    const sw = kjør();
    for (const fn of sw.lyttere.message) fn({ data: { type: 'noe-annet' } });
    for (const fn of sw.lyttere.message) fn({});
    expect(sw.self._hoppet).toBeUndefined();
  });
});
