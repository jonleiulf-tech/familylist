/* GET /sitemap.xml

   Sitemapet lå som en fast fil i /public. Det holdt så lenge gruppene sto
   i koden, men nå legges de til i admin – og da ville en ny gruppe aldri
   blitt oppdaget av søkemotorene før noen husket å redigere XML-en for
   hånd. PSI kan komme opp i femten grupper; dette må gå av seg selv.

   Leser gruppene og nyhetene fra Supabase når det er satt opp, ellers fra
   src/data/psi.js. Kjøres på Vercel som serverless-funksjon. */
import { sports as fileSports, site } from '../src/data/psi.js';
import { erSynlig } from '../src/lib/gruppestatus.js';

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
const SUPABASE_KEY = (process.env.VITE_SUPABASE_ANON_KEY || '').trim();

/* Faste sider. Rekkefølgen er den de står i menyen. */
export const FASTE = ['/', '/idretter', '/treningstider', '/kalender', '/nyheter', '/bli-med', '/om', '/kontakt', '/partnere', '/app'];

async function rest(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

async function hent() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return { sports: fileSports, news: [] };
  try {
    const [rader, nyheter] = await Promise.all([
      rest('sports?select=slug,sort_order,active,data&order=sort_order'),
      rest('news?select=slug,published_at,updated_at&status=eq.published&order=published_at.desc&limit=500'),
    ]);
    const sports = rader.length ? rader.map((r) => ({ ...r.data, slug: r.slug, active: r.active })) : fileSports;
    return { sports, news: nyheter };
  } catch {
    // Uten database er filas grupper bedre enn ingen sitemap.
    return { sports: fileSports, news: [] };
  }
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* Én <url> per side, på begge språk, med hreflang mellom dem. Uten
   x-default velger Google selv hvilken versjon som er «riktig». */
export function urlBlokk(domene, sti, dato) {
  const nb = `${domene}${sti === '/' ? '/' : sti}`;
  const en = `${domene}/en${sti === '/' ? '' : sti}`;
  return [nb, en]
    .map((loc) => [
      '  <url>',
      `    <loc>${esc(loc)}</loc>`,
      dato ? `    <lastmod>${esc(dato)}</lastmod>` : null,
      `    <xhtml:link rel="alternate" hreflang="nb" href="${esc(nb)}"/>`,
      `    <xhtml:link rel="alternate" hreflang="en" href="${esc(en)}"/>`,
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${esc(nb)}"/>`,
      '  </url>',
    ].filter(Boolean).join('\n'))
    .join('\n');
}

export function byggSitemap({ sports = [], news = [], domene, idag }) {
  const stier = [
    ...FASTE.map((sti) => [sti, idag]),
    // Pausede grupper er med: sidene deres står, og det er nettopp dem
    // noen skal kunne finne og starte opp igjen.
    ...sports.filter(erSynlig).map((sp) => [`/idretter/${sp.slug}`, idag]),
    ...news.map((n) => [`/nyheter/${n.slug}`, (n.updated_at || n.published_at || '').slice(0, 10) || idag]),
  ];
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...stier.map(([sti, dato]) => urlBlokk(domene, sti, dato)),
    '</urlset>',
    '',
  ].join('\n');
}

export default async function handler(req, res) {
  const { sports, news } = await hent();
  const xml = byggSitemap({ sports, news, domene: site.domain.replace(/\/+$/, ''), idag: new Date().toISOString().slice(0, 10) });
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  // En time i kanten er nok: en ny gruppe skal ikke vente et døgn på å
  // bli oppdaget, og søkemotorene henter uansett ikke oftere enn det.
  res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=3600');
  res.status(200).send(xml);
}
