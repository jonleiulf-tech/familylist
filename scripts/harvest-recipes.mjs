#!/usr/bin/env node
// Høsting av norske oppskriftskandidater til kokeboka.
//
// Fyller external_recipe_candidates i Supabase med LETTE kandidatrader
// (tittel, bilde-URL, ingredienser, porsjoner, tid — ALDRI fremgangsmåter)
// fra de aktiverte norske kildene. Revisjonen er innebygd: robots.txt
// sjekkes per kilde før noe hentes, og kilder som sier nei hoppes over.
//
// Kjøres på en maskin med internett (IKKE i Claude-sandkassen):
//
//   PowerShell:
//     $env:SUPABASE_SERVICE_ROLE_KEY = "<service_role-nøkkelen>"
//     npm run recipes:harvest
//
//   Valgfritt: -- --max 1000      (NYE oppskrifter per kilde, standard 150 — alt
//                                  som alt er høstet hoppes automatisk over)
//              -- --source tine   (bare én kilde)
//
// Nøkkelen finnes i Supabase-dashbordet → Project Settings → API →
// service_role. Den skal ALDRI inn i .env, i repoet eller i frontend —
// sett den bare i terminalvinduet som over (forsvinner når vinduet lukkes).
//
// Høflighetsregler (aldri fravik): egen User-Agent, ≥1,1 s mellom kall,
// robots.txt respekteres, MatPrat og andre DISABLED-kilder røres aldri,
// og taket per kilde holder totalen liten.

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { RECIPE_SOURCES } from '../src/lib/recipes/sources.js';
import { createJsonLdProvider } from '../src/lib/recipes/provider.js';
import { politeFetch, parseRobots, robotsAllows, findRecipeLinks, isLikelyRecipePage } from './audit-recipe-sources.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const MAX_PER_SOURCE = Math.min(1000, Number(flag('max', 150)) || 150);
const ONLY_SOURCE = flag('source', null);

// --- Supabase-tilkobling (service_role trengs for å skrive kandidater) ----
function readEnvUrl() {
  if (process.env.SUPABASE_URL) return process.env.SUPABASE_URL;
  try {
    const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
    const m = env.match(/^VITE_SUPABASE_URL\s*=\s*(.+)$/m);
    if (m) return m[1].trim();
  } catch { /* .env mangler — meldes under */ }
  return null;
}

const url = readEnvUrl();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Mangler tilkobling. Sett nøkkelen i dette terminalvinduet først:');
  console.error('  $env:SUPABASE_SERVICE_ROLE_KEY = "<service_role-nøkkelen fra dashbordet>"');
  console.error('(URL leses fra .env / VITE_SUPABASE_URL.)');
  process.exit(1);
}
const db = createClient(url, serviceKey);

// --- Sitemap-hjelpere -------------------------------------------------------
const xmlLocs = (xml) => [...String(xml).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
const looksLikeRecipe = isLikelyRecipePage;

/** Finn oppskrifts-URL-er via sitemap(er); faller tilbake til listesiden. */
async function discoverUrls(source, rules, seen) {
  const found = new Set();

  // 0) Frø: sample_urls som selv er oppskriftssider (TINE-detaljsider o.l.)
  //    går rett i køen — snøballen i harvestSource ruller videre derfra.
  for (const u of source.sample_urls ?? []) {
    if (looksLikeRecipe(u)) found.add(u);
  }

  // 1) Sitemaps fra robots.txt; mangler de (TINE), prøv /sitemap.xml direkte
  const sitemaps = rules.sitemaps.length
    ? rules.sitemaps
    : [`${new URL(source.base_url).origin}/sitemap.xml`];
  for (const sm of sitemaps.slice(0, 4)) {
    if (found.size >= MAX_PER_SOURCE * 3) break;
    const res = await politeFetch(sm);
    if (!res.ok) continue;
    const locs = xmlLocs(res.body);
    const recipes = locs.filter(looksLikeRecipe);
    recipes.forEach((u) => found.add(u));
    // sitemapindex: undersitemaps som selv ser oppskrifts-relevante ut først
    if (!recipes.length) {
      const children = locs.filter((u) => u.endsWith('.xml'));
      const ordered = [...children.filter(looksLikeRecipe), ...children.filter((u) => !looksLikeRecipe(u))];
      for (const child of ordered.slice(0, 6)) {
        if (found.size >= MAX_PER_SOURCE * 3) break;
        const cres = await politeFetch(child);
        if (cres.ok) xmlLocs(cres.body).filter(looksLikeRecipe).forEach((u) => found.add(u));
      }
    }
  }

  // 2) Fallback: lenker fra kildens listeside(r)
  if (found.size < 5) {
    for (const listing of source.sample_urls ?? []) {
      const res = await politeFetch(listing);
      if (res.ok) findRecipeLinks(res.body, listing).forEach((u) => found.add(u));
    }
  }

  const origin = new URL(source.base_url).origin;
  // Dypeste stier først: /oppskrifter/pizza/pinsa-med-chorizo er en ekte
  // oppskrift, /oppskrifter/pizza bare en kategoriside. Med taket per
  // kjøring vil dybde-først gi langt flere treff per besøkte side.
  const depth = (u) => new URL(u).pathname.split('/').filter(Boolean).length;
  return [...found]
    .filter((u) => u.startsWith(origin))
    .filter((u) => !seen.has(u))
    .filter((u) => robotsAllows(rules, new URL(u).pathname))
    .sort((a, b) => depth(b) - depth(a))
    .slice(0, MAX_PER_SOURCE);
}

async function harvestSource(source) {
  const provider = createJsonLdProvider(source.id);
  const origin = new URL(source.base_url).origin;

  const robotsRes = await politeFetch(`${origin}/robots.txt`);
  if (robotsRes.status === 0) {
    console.log(`  ${source.name}: NETTVERK BLOKKERT (${robotsRes.error}) — hopper over`);
    return { found: 0, saved: 0 };
  }
  const rules = robotsRes.ok ? parseRobots(robotsRes.body) : { sitemaps: [], allow: [], disallow: [] };

  const samplePath = source.sample_urls?.[0] ? new URL(source.sample_urls[0]).pathname : '/oppskrifter/';
  if (!robotsAllows(rules, samplePath)) {
    console.log(`  ${source.name}: robots.txt sier nei — respekteres, hopper over`);
    return { found: 0, saved: 0 };
  }

  // Alt som alt er høstet hoppes over — hver kjøring henter NYE oppskrifter,
  // så kokeboka vokser for hver runde uten å hamre på de samme sidene.
  const { data: existing } = await db
    .from('external_recipe_candidates')
    .select('source_url')
    .eq('source_id', source.id);
  const seen = new Set((existing ?? []).map((r) => r.source_url));

  const urls = await discoverUrls(source, rules, seen);
  console.log(`  ${source.name}: fant ${urls.length} oppskrifts-URL-er (snøball kan finne flere underveis)`);

  const queued = new Set(urls);
  let saved = 0;
  let batch = [];
  const flush = async () => {
    if (!batch.length) return;
    const { error } = await db
      .from('external_recipe_candidates')
      .upsert(batch, { onConflict: 'source_id,source_url' });
    if (error) console.log(`\n  ${source.name}: lagringsfeil — ${error.message}`);
    else saved += batch.length;
    batch = [];
  };

  for (let i = 0; i < urls.length; i += 1) {
    const pageUrl = urls[i];
    const res = await politeFetch(pageUrl);
    if (!res.ok) continue;

    // Snøball: detaljsider (TINE m.fl.) lenker videre til flere oppskrifter,
    // selv når listesidene er tomme JS-skall. Nye lenker legges bakerst i
    // køen til taket er nådd — samme robots- og seen-filter som ellers.
    if (urls.length < MAX_PER_SOURCE) {
      for (const link of findRecipeLinks(res.body, pageUrl)) {
        if (urls.length >= MAX_PER_SOURCE) break;
        if (queued.has(link) || seen.has(link)) continue;
        if (!robotsAllows(rules, new URL(link).pathname)) continue;
        queued.add(link);
        urls.push(link);
      }
    }

    let row = null;
    try {
      row = provider.toCandidate(res.body, pageUrl);
    } catch { /* kilde uten lov / uparselig side — hopp over */ }
    if (!row) continue;
    batch.push(row);
    if (batch.length >= 25) await flush();
    process.stdout.write(`\r  ${source.name}: ${saved + batch.length} klare (${i + 1}/${urls.length} sider)   `);
  }
  await flush();
  if (urls.length) console.log(`\r  ${source.name}: ${saved} lagret (${urls.length} sider besøkt)        `);
  return { found: urls.length, saved };
}

async function main() {
  const targets = RECIPE_SOURCES.filter((s) =>
    s.enabled
    && s.can_fetch_recipe !== false
    && s.country === 'NO'
    && !s.integration_modes.includes('API')
    && (!ONLY_SOURCE || s.id === ONLY_SOURCE));

  console.log(`Høster fra ${targets.length} norske kilder (maks ${MAX_PER_SOURCE} per kilde) …`);
  console.log('Fremgangsmåter lagres aldri — kun tittel, bilde-URL, ingredienser, porsjoner og tid.\n');

  let total = 0;
  for (const source of targets) {
    const { saved } = await harvestSource(source);
    total += saved;
  }

  const { count } = await db
    .from('external_recipe_candidates')
    .select('*', { count: 'exact', head: true });
  console.log(`\nFerdig: ${total} lagret i denne kjøringen — kokeboka har nå ${count ?? '?'} norske kandidater.`);
  console.log('Åpne Middag → «Hent inspirasjon» i appen, så ligger de under «Norske kilder».');
}

main().catch((e) => { console.error(e); process.exit(1); });
