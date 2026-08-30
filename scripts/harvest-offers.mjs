#!/usr/bin/env node
// Høsting av ukens tilbud fra butikkenes EGNE nettsider.
//
// Kjøres på en maskin med internett (IKKE i Claude-sandkassen):
//
//   PowerShell:
//     $env:SUPABASE_SERVICE_ROLE_KEY = "<hemmelig nøkkel (sb_secret_…)>"
//     npm run offers:harvest
//
//   Valgfritt: -- --source kiwi_web   (bare én kilde)
//
// Høflighetsregler som for oppskriftene: robots.txt respekteres, egen
// User-Agent, over ett sekund mellom kall. Hver kjøring ERSTATTER forrige
// runde fra samme kilde — tilbud er ferskvare, de skal ikke stables.

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { WEB_OFFER_SOURCES } from '../src/lib/offers/webSources.js';
import { extractWebOffers } from '../src/lib/offers/webOffers.js';
import { resolveCatalogItem } from '../src/lib/catalog.js';
import { politeFetch, parseRobots, robotsAllows } from './audit-recipe-sources.mjs';

const args = process.argv.slice(2);
const only = (() => {
  const i = args.indexOf('--source');
  return i >= 0 ? args[i + 1] : null;
})();

function readEnvUrl() {
  if (process.env.SUPABASE_URL) return process.env.SUPABASE_URL;
  try {
    const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
    const m = env.match(/^VITE_SUPABASE_URL\s*=\s*(.+)$/m);
    if (m) return m[1].trim();
  } catch { /* meldes under */ }
  return null;
}

const url = readEnvUrl();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Mangler tilkobling. Sett nøkkelen i dette terminalvinduet først:');
  console.error('  $env:SUPABASE_SERVICE_ROLE_KEY = "<hemmelig nøkkel fra dashbordet (sb_secret_…)>"');
  process.exit(1);
}
const db = createClient(url, serviceKey);

// Varedatabasen for kobling (match_name/kategori → relevans-scoringen virker).
const { data: catalog } = await db
  .from('item_catalog')
  .select('name, major_category, avg_price, score, frequency_sig, primary_store');
const NORM = new Map();

const sundayAhead = () => {
  const d = new Date();
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7));   // neste søndag
  return d.toISOString().slice(0, 10);
};

const targets = WEB_OFFER_SOURCES.filter((s) => s.enabled && (!only || s.id === only));
console.log(`Henter ukens tilbud fra ${targets.length} butikksider …\n`);

let total = 0;
for (const source of targets) {
  const origin = new URL(source.urls[0]).origin;
  const robotsRes = await politeFetch(`${origin}/robots.txt`);
  if (robotsRes.status === 0) {
    console.log(`  ${source.store_name}: NETTVERK BLOKKERT (${robotsRes.error}) — hopper over`);
    continue;
  }
  const rules = robotsRes.ok ? parseRobots(robotsRes.body) : { sitemaps: [], allow: [], disallow: [] };

  const rows = [];
  for (const pageUrl of source.urls) {
    if (!robotsAllows(rules, new URL(pageUrl).pathname)) {
      console.log(`  ${source.store_name}: robots.txt sier nei til ${pageUrl} — respekteres`);
      continue;
    }
    const res = await politeFetch(pageUrl);
    if (!res.ok) { console.log(`  ${source.store_name}: ${pageUrl} svarte ${res.status}`); continue; }
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
    if (rows.length) break;    // første side med treff holder
  }

  // Erstatt forrige runde fra denne kilden — tilbud er ferskvare.
  await db.from('offers').delete().eq('source', `Butikkens nettside – ${source.store_name}`);
  if (rows.length) {
    const { error } = await db.from('offers').insert(rows);
    if (error) { console.log(`  ${source.store_name}: lagringsfeil — ${error.message}`); continue; }
  }
  console.log(`  ${source.store_name}: ${rows.length} tilbud`);
  total += rows.length;
}

console.log(`\nFerdig: ${total} tilbud lagret. Gir en side 0, kjør`);
console.log('  npm run offers:diagnose -- "<tilbudssidens adresse>"');
console.log('og del resultatet — så justeres parseren eller adressen.');
