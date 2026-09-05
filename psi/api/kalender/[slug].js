/* GET /api/kalender/<psi|fotball|fotball+klatring>.ics[?type=training,match&lang=en]
   Kalenderabonnement (ICS) for Google Kalender, Outlook og Apple Kalender.
   Leser treninger og arrangementer fra Supabase når det er satt opp, ellers
   fra src/data/psi.js. Kjøres på Vercel som serverless-funksjon. */
import { buildIcs, parseFeedSlug, KINDS } from '../../src/lib/calendar.js';
import { sports as fileSports, site } from '../../src/data/psi.js';

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
const SUPABASE_KEY = (process.env.VITE_SUPABASE_ANON_KEY || '').trim();

async function rest(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

async function load() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return { sports: fileSports, events: [] };
  try {
    const since = new Date(Date.now() - 30 * 86400e3).toISOString();
    const [rows, events] = await Promise.all([
      rest('sports?select=slug,sort_order,active,data&order=sort_order'),
      rest(`events?select=*&status=neq.draft&starts_at=gte.${encodeURIComponent(since)}&order=starts_at`),
    ]);
    const sports = rows.length ? rows.map((r) => ({ ...r.data, slug: r.slug, active: r.active })) : fileSports;
    // hidden_by_admin finnes først etter schema-v3; filtreres her så
    // funksjonen virker uansett hvilke SQL-filer som er kjørt.
    return { sports, events: events.filter((e) => !e.hidden_by_admin) };
  } catch {
    return { sports: fileSports, events: [] };
  }
}

export default async function handler(req, res) {
  const slugs = parseFeedSlug(req.query.slug);
  const lang = req.query.lang === 'en' ? 'en' : 'nb';
  const kinds = String(req.query.type || '').split(',').map((k) => k.trim()).filter((k) => KINDS.includes(k));
  const { sports, events } = await load();
  const active = sports.filter((s) => s.active !== false);
  const chosen = slugs.length ? active.filter((s) => slugs.includes(s.slug)) : active;
  if (slugs.length && chosen.length === 0) { res.status(404).send('Ukjent gruppe'); return; }
  const name = slugs.length ? chosen.map((s) => s.name).join(' + ') : (lang === 'en' ? 'PSI – all groups' : 'PSI – alle grupper');
  const ics = buildIcs({ sports: active, events, slugs, kinds, name, domain: site.domain, lang });
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `inline; filename="psi-${slugs.join('-') || 'alle'}.ics"`);
  res.setHeader('Cache-Control', 'public, max-age=900, s-maxage=900');
  res.status(200).send(ics);
}
