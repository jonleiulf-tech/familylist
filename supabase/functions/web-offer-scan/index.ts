// Edge Function: ukens tilbud fra butikkenes EGNE nettsider.
//
// Kjøres på timeplan (typisk mandag morgen — kundeavisukene starter da):
//
//   select cron.schedule(
//     'web-offer-scan', '45 5 * * 1',
//     $$ select net.http_post(
//          url := 'https://<ref>.supabase.co/functions/v1/web-offer-scan',
//          headers := '{"Authorization":"Bearer <hemmelig nøkkel>"}'::jsonb
//        ) $$);
//
// Høflighetsregler som for oppskriftene: robots.txt, egen User-Agent,
// >1 sekund mellom kall. Hver kjøring ERSTATTER forrige runde per kilde.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { WEB_OFFER_SOURCES } from '../_shared/offerWebSources.ts';
import { extractWebOffers } from '../_shared/offerWebOffers.ts';
import { resolveCatalogItem } from '../_shared/catalogMatch.ts';

const UA = 'PlukkelistenBot/0.1 (+https://plukkelisten.no)';
const DELAY_MS = 1100;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let lastFetch = 0;
// Pausen kilden selv ba om via Crawl-delay, ellers vår egen.
let politeDelay = DELAY_MS;
async function politeFetch(url: string) {
  const wait = lastFetch + politeDelay - Date.now();
  if (wait > 0) await sleep(wait);
  lastFetch = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': UA, accept: 'text/html,*/*' },
      redirect: 'follow',
      signal: ctrl.signal,
    });
    return { ok: res.ok, status: res.status, body: await res.text() };
  } catch {
    return { ok: false, status: 0, body: '' };
  } finally {
    clearTimeout(timer);
  }
}

// Minimal robots.txt (samme logikk som høsteskriptene)
function parseRobots(text: string, ua = 'plukkelistenbot') {
  type Group = { agents: string[]; allow: string[]; disallow: string[]; delay?: number; done?: boolean };
  const groups: Group[] = [];
  let current: Group | null = null;
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'user-agent') {
      if (!current || current.done) { current = { agents: [], allow: [], disallow: [] }; groups.push(current); }
      current.agents.push(value.toLowerCase());
    } else if (current && (key === 'allow' || key === 'disallow')) {
      current.done = true;
      if (value) current[key].push(value);
    } else if (current && key === 'crawl-delay') {
      // Ber kilden om en pause, skal den følges. Den ble lest bort før.
      const n = Number(String(value).replace(',', '.'));
      if (Number.isFinite(n) && n > 0) current.delay = Math.min(60, n);
    }
  }
  const forUs = groups.find((g) => g.agents.some((a) => ua.includes(a) || a.includes(ua)))
    ?? groups.find((g) => g.agents.includes('*'))
    ?? { allow: [], disallow: [] };
  return { allow: forUs.allow ?? [], disallow: forUs.disallow ?? [], delayMs: (forUs.delay ?? 0) * 1000 };
}

function robotsAllows(rules: { allow: string[]; disallow: string[] }, path: string) {
  const match = (pattern: string) => {
    if (!pattern) return -1;
    const esc = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${esc}`).test(path) ? pattern.length : -1;
  };
  let best = { len: -1, allow: true };
  for (const p of rules.allow) { const l = match(p); if (l > best.len) best = { len: l, allow: true }; }
  for (const p of rules.disallow) { const l = match(p); if (l > best.len) best = { len: l, allow: false }; }
  return best.allow;
}

const sundayAhead = () => {
  const d = new Date();
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7));
  return d.toISOString().slice(0, 10);
};

Deno.serve(async (req: Request) => {
  const auth = req.headers.get('Authorization') ?? '';
  // Godtar både ny hemmelig nøkkel (sb_secret_… via secrets) og gammel
  // service_role i overgangen; databaseklienten foretrekker den nye.
  const keys = [Deno.env.get('SB_SECRET_KEY'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')]
    .filter((k): k is string => Boolean(k));
  const serviceKey = keys[0] ?? '';
  if (!serviceKey || !keys.some((k) => auth.includes(k))) {
    return json({ error: 'Ikke autorisert.' }, 401);
  }

  const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);
  const { data: catalog } = await db
    .from('item_catalog')
    .select('name, major_category, avg_price, score, frequency_sig, primary_store');
  const NORM = new Map();

  const results: Record<string, number> = {};
  for (const source of WEB_OFFER_SOURCES.filter((s: any) => s.enabled)) {
    const origin = new URL(source.urls[0]).origin;
    politeDelay = DELAY_MS;
    const robotsRes = await politeFetch(`${origin}/robots.txt`);
    if (robotsRes.status === 0) { results[source.id] = -1; continue; }
    // 5xx betyr «vi vet ikke», og da er svaret nei — ikke «ingen regler».
    if (robotsRes.status >= 500) { results[source.id] = -1; continue; }
    const rules = robotsRes.ok
      ? parseRobots(robotsRes.body)
      : { allow: [], disallow: [], delayMs: 0 };
    politeDelay = Math.max(DELAY_MS, rules.delayMs ?? 0);

    const rows: Record<string, unknown>[] = [];
    for (const pageUrl of source.urls) {
      if (!robotsAllows(rules, new URL(pageUrl).pathname)) continue;
      const res = await politeFetch(pageUrl);
      if (!res.ok) continue;
      for (const o of extractWebOffers(res.body)) {
        const { name: matched, item } = resolveCatalogItem(o.product_name, catalog ?? [], NORM);
        rows.push({
          ...o,
          match_name: item ? matched : null,
          category: item?.major_category ?? null,
          store_code: source.store_code,
          store_name: source.store_name,
          source: `Butikkens nettside – ${source.store_name}`,
          source_type: 'web_page',
          source_url: pageUrl,
          valid_to: sundayAhead(),
          is_sample: false,
        });
      }
      if (rows.length) break;
    }

    await db.from('offers').delete().eq('source', `Butikkens nettside – ${source.store_name}`);
    if (rows.length) {
      const { error } = await db.from('offers').insert(rows);
      if (error) { console.error(`${source.id}: ${error.message}`); results[source.id] = 0; continue; }
    }
    results[source.id] = rows.length;
  }

  console.log(`web-tilbud: ${JSON.stringify(results)}`);
  return json({ ok: true, results });
});
