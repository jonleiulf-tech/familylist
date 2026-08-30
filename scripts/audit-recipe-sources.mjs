#!/usr/bin/env node
// Kapabilitetsrevisjon av oppskriftskildene — kjøres FØR noen som helst
// bredere henting, per spesifikasjonen: én listeside og én detaljside per
// kilde, robots.txt og sitemap/RSS-deteksjon, og en rapport som avgjør
// anbefalt integrasjonsmodus per kilde.
//
//   npm run recipes:audit
//
// Kjøres på en vanlig maskin med internett (sandkassen til Claude har
// stengt utgående nett — da rapporteres NETWORK_BLOCKED, aldri diktede
// resultater). Skriver docs/recipe-source-report.md og .json.
//
// Høflighetsregler (aldri fravik):
//  - egen User-Agent med kontaktinfo
//  - respekter robots.txt Disallow for vår UA og *
//  - maks ~4 forespørsler per kilde, ≥1 sekund mellom hver
//  - aldri omgå innlogging, sperrer eller anti-bot
//  - MatPrat: KUN robots/sitemap-deteksjon — aldri oppskriftssider

import { writeFileSync, mkdirSync } from 'node:fs';
import { RECIPE_SOURCES } from '../src/lib/recipes/sources.js';
import { parseRecipeFromHtml } from '../src/lib/recipes/jsonld.js';
import { parseIngredientLine } from '../src/lib/recipes/ingredients.js';

const UA = 'PlukkelistenBot/0.1 (+https://plukkelisten.no)';
const DELAY_MS = 1100;
const TIMEOUT_MS = 12000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let lastFetch = 0;
export async function politeFetch(url) {
  const wait = lastFetch + DELAY_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastFetch = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': UA, accept: 'text/html,application/xml,text/plain,*/*' },
      redirect: 'follow',
      signal: ctrl.signal,
    });
    const body = await res.text();
    // Claude-sandkassens utgående proxy svarer 403 med x-deny-reason for
    // hoster utenfor allowlisten — det er IKKE et svar fra nettstedet.
    if (res.headers.get('x-deny-reason') || /not in allowlist/i.test(body)) {
      return { ok: false, status: 0, body: '', error: 'PROXY_BLOCKED (sandkasse uten utgående nett)' };
    }
    return { ok: res.ok, status: res.status, body, error: null };
  } catch (e) {
    return { ok: false, status: 0, body: '', error: e.cause?.code ?? e.name ?? String(e.message) };
  } finally {
    clearTimeout(timer);
  }
}

/** Minimal robots.txt-parser: regler for vår UA (fallback *) + Sitemap-linjer. */
export function parseRobots(text, ua = 'plukkelistenbot') {
  const groups = [];
  let current = null;
  const sitemaps = [];
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
    } else if (key === 'sitemap') {
      if (value) sitemaps.push(value);
    } else if (current && (key === 'allow' || key === 'disallow')) {
      current.done = true;
      if (value) current[key].push(value);
      else if (key === 'disallow') current.emptyDisallow = true;
    }
  }
  const forUs = groups.find((g) => g.agents.some((a) => ua.includes(a) || a.includes(ua)))
    ?? groups.find((g) => g.agents.includes('*'))
    ?? { allow: [], disallow: [] };
  return { sitemaps, allow: forUs.allow ?? [], disallow: forUs.disallow ?? [] };
}

/** Er path tillatt etter robots-reglene? Lengste regel vinner (Google-stil, forenklet). */
export function robotsAllows(rules, path) {
  const match = (pattern) => {
    if (!pattern) return -1;
    const esc = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    const re = new RegExp(`^${esc}`);
    return re.test(path) ? pattern.length : -1;
  };
  let best = { len: -1, allow: true };
  for (const p of rules.allow) { const l = match(p); if (l > best.len) best = { len: l, allow: true }; }
  for (const p of rules.disallow) { const l = match(p); if (l > best.len) best = { len: l, allow: false }; }
  return best.allow;
}

export function findRss(html, baseUrl) {
  const links = [...String(html).matchAll(/<link[^>]+type\s*=\s*["']application\/(?:rss|atom)\+xml["'][^>]*>/gi)]
    .map((m) => m[0].match(/href\s*=\s*["']([^"']+)["']/i)?.[1])
    .filter(Boolean)
    .map((href) => new URL(href, baseUrl).href);
  return [...new Set(links)];
}

/**
 * Er URL-en en sannsynlig ENKELTOPPSKRIFT-side? Utelukker statiske filer
 * (fonter, bilder, script), feeds og liste-/kategorisider — revisjonen
 * plukket i praksis en .woff2-fil hos TINE og RSS-feeds hos bloggene.
 */
export function isLikelyRecipePage(u) {
  if (!/oppskrift|recipe|middag/i.test(u)) return false;
  if (/\.(woff2?|ttf|otf|css|js|mjs|png|jpe?g|webp|gif|svg|ico|json|pdf)(\?|$)/i.test(u)) return false;
  if (/\/(_next|static|assets|wp-content|wp-json)\//i.test(u)) return false;
  if (/\/(feed|category|tag|page)\/|\/feed$/i.test(u)) return false;
  return true;
}

export function findRecipeLinks(html, baseUrl) {
  const hrefs = [...String(html).matchAll(/href\s*=\s*["']([^"'#?]+)["']/gi)].map((m) => m[1]);
  // Next.js-sider (TINE m.fl.) bærer lenker i JSON-payload: "href":"/oppskrifter/…"
  // — også med escapede anførselstegn (\"href\":\"…\").
  for (const m of String(html).matchAll(/\\?"href\\?"\s*:\s*\\?"([^"\\#?]+)/g)) hrefs.push(m[1]);
  const abs = hrefs
    .map((h) => { try { return new URL(h, baseUrl).href; } catch { return null; } })
    .filter(Boolean)
    .filter((u) => u.startsWith(new URL(baseUrl).origin))
    .filter(isLikelyRecipePage);
  return [...new Set(abs)];
}

async function auditSource(source) {
  const r = {
    id: source.id,
    name: source.name,
    country: source.country,
    enabled: source.enabled,
    status: 'OK',
    robots: null,
    robots_allows_recipes: null,
    sitemap_urls: [],
    rss_urls: [],
    jsonld_recipe: null,
    has_servings: null,
    has_quantities: null,
    has_time: null,
    has_categories: null,
    has_images: null,
    sample_detail_url: null,
    recommended_mode: null,
    notes: [],
    fetches: 0,
  };

  const linkOnly = source.integration_modes.includes('DISABLED_PENDING_PERMISSION')
    || source.can_fetch_recipe === false;

  if (!source.base_url) {
    r.status = 'NO_BASE_URL';
    r.recommended_mode = source.integration_modes[0] ?? 'LINK_DISCOVERY_ONLY';
    return r;
  }
  const origin = new URL(source.base_url).origin;

  // 1) robots.txt — alltid første og noen ganger eneste forespørsel
  const robotsRes = await politeFetch(`${origin}/robots.txt`);
  r.fetches += 1;
  if (robotsRes.status === 0) {
    r.status = 'NETWORK_BLOCKED';
    r.notes.push(`robots.txt: ${robotsRes.error} — kjør skriptet fra en maskin med internett`);
    return r;
  }
  const rules = robotsRes.ok ? parseRobots(robotsRes.body) : { sitemaps: [], allow: [], disallow: [] };
  r.robots = robotsRes.ok
    ? { fetched: true, disallow_count: rules.disallow.length, sitemap_count: rules.sitemaps.length }
    : { fetched: false, status: robotsRes.status };
  r.sitemap_urls = rules.sitemaps.slice(0, 5);

  const samplePath = source.sample_urls?.[0] ? new URL(source.sample_urls[0]).pathname : '/oppskrifter/';
  r.robots_allows_recipes = robotsAllows(rules, samplePath);

  if (linkOnly) {
    r.status = 'LINK_DISCOVERY_ONLY';
    r.recommended_mode = 'LINK_DISCOVERY_ONLY';
    r.notes.push('Kilden tillater ikke uthenting — kun robots/sitemap er sjekket, ingen oppskriftssider hentet.');
    return r;
  }
  if (!r.robots_allows_recipes) {
    r.status = 'ROBOTS_DISALLOWED';
    r.recommended_mode = 'LINK_DISCOVERY_ONLY';
    r.notes.push(`robots.txt tillater ikke ${samplePath} for oss — respekteres uten unntak.`);
    return r;
  }

  // 2) Én listeside: RSS-deteksjon + finn en detaljlenke
  let detailUrl = null;
  const listingUrl = source.sample_urls?.[0];
  if (listingUrl) {
    const listing = await politeFetch(listingUrl);
    r.fetches += 1;
    if (listing.status === 0) {
      r.status = 'NETWORK_BLOCKED';
      r.notes.push(`listeside: ${listing.error}`);
      return r;
    }
    if (listing.ok) {
      r.rss_urls = findRss(listing.body, listingUrl);
      // Er listesiden selv en oppskrift? (sample kan peke rett på detalj)
      const direct = parseRecipeFromHtml(listing.body, { sourceUrl: listingUrl });
      if (direct) {
        detailUrl = listingUrl;
        recordRecipe(r, direct);
      } else {
        const links = findRecipeLinks(listing.body, listingUrl)
          .filter((u) => u !== listingUrl && robotsAllows(rules, new URL(u).pathname));
        detailUrl = links[0] ?? null;
      }
    } else {
      r.notes.push(`listeside svarte ${listing.status}`);
    }
  }

  // 3) Én detaljside → JSON-LD-sjekk
  if (detailUrl && r.jsonld_recipe == null) {
    const detail = await politeFetch(detailUrl);
    r.fetches += 1;
    if (detail.status === 0) {
      r.status = 'NETWORK_BLOCKED';
      r.notes.push(`detaljside: ${detail.error}`);
      return r;
    }
    if (detail.ok) {
      const recipe = parseRecipeFromHtml(detail.body, { sourceUrl: detailUrl });
      if (recipe) recordRecipe(r, recipe);
      else r.notes.push('detaljside uten gjenkjennbar JSON-LD Recipe');
    } else {
      r.notes.push(`detaljside svarte ${detail.status}`);
    }
  }
  r.sample_detail_url = detailUrl;
  if (r.jsonld_recipe == null) r.jsonld_recipe = false;

  // 4) Anbefalt modus fra funnene
  if (r.jsonld_recipe) r.recommended_mode = 'STRUCTURED_DATA';
  else if (r.sitemap_urls.length) r.recommended_mode = 'SITEMAP_DISCOVERY';
  else if (r.rss_urls.length) r.recommended_mode = 'RSS_DISCOVERY';
  else r.recommended_mode = 'LINK_DISCOVERY_ONLY';
  return r;
}

function recordRecipe(r, recipe) {
  r.jsonld_recipe = true;
  r.has_servings = recipe.servings?.base_servings != null;
  r.has_time = recipe.total_time_minutes != null;
  r.has_categories = (recipe.categories?.length ?? 0) > 0 || (recipe.keywords?.length ?? 0) > 0;
  r.has_images = Boolean(recipe.image_url);
  const parsedQty = (recipe.raw_ingredients ?? [])
    .map((line) => parseIngredientLine(line))
    .filter((p) => p && p.qty != null);
  r.has_quantities = parsedQty.length >= Math.max(1, Math.floor((recipe.raw_ingredients?.length ?? 0) / 2));
}

const yesNo = (v) => (v === null ? '?' : v ? 'ja' : 'nei');

function toMarkdown(results, startedAt) {
  const lines = [
    '# Kapabilitetsrapport — oppskriftskilder',
    '',
    `Generert ${startedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC av \`npm run recipes:audit\`.`,
    'Én listeside og maks én detaljside per kilde, ≥1 s mellom forespørsler,',
    `User-Agent \`${UA}\`. MatPrat hentes aldri (kun robots-sjekk).`,
    '',
    '| Kilde | Status | robots ok | Sitemap | RSS | JSON-LD | Porsjoner | Mengder | Tid | Kategorier | Bilder | Anbefalt modus |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const r of results) {
    lines.push(`| ${r.name} | ${r.status} | ${yesNo(r.robots_allows_recipes)} | ${r.sitemap_urls.length ? 'ja' : 'nei'} | ${r.rss_urls.length ? 'ja' : 'nei'} | ${yesNo(r.jsonld_recipe)} | ${yesNo(r.has_servings)} | ${yesNo(r.has_quantities)} | ${yesNo(r.has_time)} | ${yesNo(r.has_categories)} | ${yesNo(r.has_images)} | ${r.recommended_mode ?? '—'} |`);
  }
  lines.push('', '## Notater per kilde', '');
  for (const r of results) {
    if (r.notes.length || r.sample_detail_url) {
      lines.push(`- **${r.name}**${r.sample_detail_url ? ` (prøveside: ${r.sample_detail_url})` : ''}${r.notes.length ? `: ${r.notes.join('; ')}` : ''}`);
    }
  }
  lines.push(
    '',
    '## Neste steg',
    '',
    '- `NETWORK_BLOCKED` betyr at skriptet må kjøres fra en maskin med internett.',
    '- Providere implementeres KUN for kilder med JSON-LD=ja i denne rapporten.',
    '- Ingen bred crawling før rapporten er gjennomgått — dette er hele poenget med fase 1.',
    '',
  );
  return lines.join('\n');
}

async function main() {
  const startedAt = new Date();
  const targets = RECIPE_SOURCES.filter((s) => !s.integration_modes.includes('API'));
  console.log(`Reviderer ${targets.length} kilder (API-kilder revideres ikke via HTML) …\n`);

  const results = [];
  for (const source of targets) {
    process.stdout.write(`- ${source.name} … `);
    const r = await auditSource(source);
    results.push(r);
    console.log(`${r.status}${r.recommended_mode ? ` → ${r.recommended_mode}` : ''}`);
  }

  mkdirSync('docs', { recursive: true });
  writeFileSync('docs/recipe-source-report.md', toMarkdown(results, startedAt));
  writeFileSync('docs/recipe-source-report.json', `${JSON.stringify({ generated_at: startedAt.toISOString(), user_agent: UA, results }, null, 2)}\n`);
  console.log('\nSkrev docs/recipe-source-report.md og docs/recipe-source-report.json');

  const blocked = results.filter((r) => r.status === 'NETWORK_BLOCKED').length;
  if (blocked) {
    console.log(`\n${blocked} kilder fikk NETWORK_BLOCKED — kjør skriptet fra din egen maskin:`);
    console.log('  npm run recipes:audit');
  }
}

// Kjør bare når skriptet startes direkte (ikke ved import fra høstingen).
// pathToFileURL trengs for at sammenligningen skal virke på Windows også.
import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
