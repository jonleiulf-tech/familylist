// Edge Function: automatisk dryppvis høsting av norske oppskrifter.
//
// Kjøres på timeplan og tar én kilde per kjøring — kilden med færrest
// oppskrifter i kokeboka står for tur. Per kjøring hentes maks
// HARVEST_PAGES nye sider (standard 60, godt innenfor funksjonens
// tidsgrense) med >1 sekunds pause mellom kallene, og alt stopper av
// seg selv når kokeboka har nådd HARVEST_TARGET (standard 10 000).
// Slik vokser kokeboka jevnt uten at noen kilde noensinne opplever
// oss som annet enn en høflig, langsom gjest.
//
// robots.txt sjekkes hver kjøring; kilder som sier nei hoppes over.
// Fremgangsmåter lagres aldri — provider-laget stripper dem.
//
// Tidsplan (Supabase SQL editor, én gang):
//   select cron.schedule(
//     'harvest-recipes', '20 * * * *',
//     $$ select net.http_post(
//          url := 'https://<ref>.supabase.co/functions/v1/harvest-recipes',
//          headers := '{"Authorization":"Bearer <service_role_key>"}'::jsonb
//        ) $$);
//
// Valgfrie secrets: HARVEST_PAGES (per kjøring), HARVEST_TARGET (total).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { RECIPE_SOURCES } from '../_shared/recipeSources.ts';
import { createJsonLdProvider } from '../_shared/recipeProvider.ts';

const UA = 'PlukkelistenBot/0.1 (+https://plukkelisten.no)';
const DELAY_MS = 1100;
const PAGES = Math.min(120, Number(Deno.env.get('HARVEST_PAGES') ?? 60) || 60);
const TARGET = Number(Deno.env.get('HARVEST_TARGET') ?? 10000) || 10000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let lastFetch = 0;
// Pausen kilden selv har bedt om, i millisekunder. Settes når robots.txt
// er lest, og gjelder resten av kjøringen mot den kilden.
let politeDelay = DELAY_MS;
async function politeFetch(url: string) {
  const wait = lastFetch + politeDelay - Date.now();
  if (wait > 0) await sleep(wait);
  lastFetch = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': UA, accept: 'text/html,application/xml,text/plain,*/*' },
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

// Minimal robots.txt (samme logikk som revisjonsskriptet)
function parseRobots(text: string, ua = 'plukkelistenbot') {
  type Group = { agents: string[]; allow: string[]; disallow: string[]; delay?: number; done?: boolean };
  const groups: Group[] = [];
  let current: Group | null = null;
  const sitemaps: string[] = [];
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
    } else if (current && key === 'crawl-delay') {
      // CRAWL-DELAY BLE LEST BORT. Ber en kilde om 10 sekunder mellom
      // kallene, hentet vi ni ganger raskere enn den ba om — og
      // husregelen er at robots.txt respekteres, for hver kilde, hver
      // gang. Ikke bare Disallow-linjene.
      const n = Number(String(value).replace(',', '.'));
      if (Number.isFinite(n) && n > 0) current.delay = Math.min(60, n);
    }
  }
  const forUs = groups.find((g) => g.agents.some((a) => ua.includes(a) || a.includes(ua)))
    ?? groups.find((g) => g.agents.includes('*'))
    ?? { allow: [], disallow: [] };
  return {
    sitemaps,
    allow: forUs.allow ?? [],
    disallow: forUs.disallow ?? [],
    delayMs: (forUs.delay ?? 0) * 1000,
  };
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

const xmlLocs = (xml: string) => [...String(xml).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
const looksLikeRecipe = (u: string) => {
  if (!/oppskrift|recipe|middag/i.test(u)) return false;
  if (/\.(woff2?|ttf|otf|css|js|mjs|png|jpe?g|webp|gif|svg|ico|json|pdf)(\?|$)/i.test(u)) return false;
  if (/\/(_next|static|assets|wp-content|wp-json)\//i.test(u)) return false;
  if (/\/(feed|category|tag|page)\/|\/feed$/i.test(u)) return false;
  return true;
};

function findRecipeLinks(html: string, baseUrl: string) {
  const hrefs = [...String(html).matchAll(/href\s*=\s*["']([^"'#?]+)["']/gi)].map((m) => m[1]);
  // Next.js-sider (TINE m.fl.) bærer lenker i JSON-payload: "href":"/oppskrifter/…"
  // — også med escapede anførselstegn (\"href\":\"…\").
  for (const m of String(html).matchAll(/\\?"href\\?"\s*:\s*\\?"([^"\\#?]+)/g)) hrefs.push(m[1]);
  const origin = new URL(baseUrl).origin;
  return [...new Set(hrefs
    .map((h) => { try { return new URL(h, baseUrl).href; } catch { return null; } })
    .filter((u): u is string => Boolean(u))
    .filter((u) => u.startsWith(origin) && looksLikeRecipe(u)))];
}

Deno.serve(async (req: Request) => {
  const auth = req.headers.get('Authorization') ?? '';
  // Godtar både ny hemmelig nøkkel (sb_secret_… via secrets) og gammel
  // service_role i overgangen; databaseklienten foretrekker den nye.
  const keys = [Deno.env.get('SB_SECRET_KEY'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')]
    .filter((k): k is string => Boolean(k));
  const serviceKey = keys[0] ?? '';
  if (!serviceKey || !keys.some((k) => auth.includes(k))) return json({ error: 'Ikke autorisert.' }, 401);

  const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);

  // Full kokebok? Da er jobben gjort — cron-en kan stå på uten kostnad.
  const { count: total } = await db
    .from('external_recipe_candidates').select('*', { count: 'exact', head: true });
  if ((total ?? 0) >= TARGET) {
    return json({ ok: true, note: `Målet på ${TARGET} er nådd (${total}). Ingen høsting.` });
  }

  // Velg kilden med færrest kandidater — jevn vekst på tvers.
  const sources = RECIPE_SOURCES.filter((s: any) =>
    s.enabled && s.can_fetch_recipe !== false && s.country === 'NO'
    && !s.integration_modes.includes('API'));
  const counts = await Promise.all(sources.map(async (s: any) => {
    const { count } = await db
      .from('external_recipe_candidates')
      .select('*', { count: 'exact', head: true })
      .eq('source_id', s.id);
    return { source: s, count: count ?? 0 };
  }));
  counts.sort((a, b) => a.count - b.count);

  /**
   * Kilden med færrest kandidater velges — men GA VI OPP der, låste hele
   * jobben seg.
   *
   * En kilde som gir null blir jo værende den med færrest, og ble derfor
   * valgt igjen neste time. Og neste. Én blokkert eller uleselig kilde
   * stoppet dermed alle de andre, døgn etter døgn — 24 tomme kjøringer om
   * dagen. Nå prøver vi neste kilde i stedet.
   */
  let source: any = null;
  let rules: any = null;
  const skipped: string[] = [];

  for (const candidate of counts) {
    const o = new URL(candidate.source.base_url).origin;
    politeDelay = DELAY_MS;   // ny kilde, ny pause
    const robotsRes = await politeFetch(`${o}/robots.txt`);
    if (robotsRes.status === 0) { skipped.push(`${candidate.source.id}: ingen kontakt`); continue; }
    // 5xx BETYR IKKE «ingen regler» — det betyr at vi ikke vet, og da er
    // svaret nei. RFC 9309 sier det samme, og en kilde som svarer 503 er
    // gjerne en kilde under press som helst vil slippe botter.
    if (robotsRes.status >= 500) {
      skipped.push(`${candidate.source.id}: robots.txt svarte ${robotsRes.status}`);
      continue;
    }
    const r = robotsRes.ok
      ? parseRobots(robotsRes.body)
      : { sitemaps: [], allow: [], disallow: [], delayMs: 0 };
    const path = candidate.source.sample_urls?.[0]
      ? new URL(candidate.source.sample_urls[0]).pathname : '/oppskrifter/';
    if (!robotsAllows(r, path)) { skipped.push(`${candidate.source.id}: robots.txt sier nei`); continue; }
    source = candidate.source;
    rules = r;
    // Ber kilden om lengre pause enn vår egen, er det kildens ord som står.
    politeDelay = Math.max(DELAY_MS, r.delayMs ?? 0);
    break;
  }
  if (!source) return json({ ok: true, note: 'Ingen kilde tilgjengelig nå.', skipped });

  const origin = new URL(source.base_url).origin;

  // Finn URL-er (sitemaps med listeside-fallback), minus det vi alt har.
  const found = new Set<string>();
  // Frø: sample_urls som selv er oppskriftssider (TINE-detaljsider o.l.)
  // går rett i køen — snøballen under ruller videre derfra.
  for (const u of source.sample_urls ?? []) {
    if (looksLikeRecipe(u)) found.add(u);
  }
  const sitemaps = rules.sitemaps.length ? rules.sitemaps : [`${origin}/sitemap.xml`];
  for (const sm of sitemaps.slice(0, 3)) {
    if (found.size >= PAGES * 4) break;
    const res = await politeFetch(sm);
    if (!res.ok) continue;
    const locs = xmlLocs(res.body);
    const recipes = locs.filter(looksLikeRecipe);
    recipes.forEach((u) => found.add(u));
    if (!recipes.length) {
      const children = locs.filter((u) => u.endsWith('.xml'));
      const ordered = [...children.filter(looksLikeRecipe), ...children.filter((u) => !looksLikeRecipe(u))];
      for (const child of ordered.slice(0, 4)) {
        if (found.size >= PAGES * 4) break;
        const cres = await politeFetch(child);
        if (cres.ok) xmlLocs(cres.body).filter(looksLikeRecipe).forEach((u) => found.add(u));
      }
    }
  }
  if (found.size < 5) {
    for (const listing of source.sample_urls ?? []) {
      const res = await politeFetch(listing);
      if (res.ok) findRecipeLinks(res.body, listing).forEach((u) => found.add(u));
    }
  }

  // MÅ pagineres. PostgREST returnerer maks 1000 rader, så så snart en
  // kilde passerte tusen kandidater, så høsteren bare de første tusen som
  // «alt hentet» — og hentet resten om igjen hver eneste time. Loggen så
  // ut som vekst mens tellingen sto stille.
  const seen = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data: page } = await db
      .from('external_recipe_candidates').select('source_url')
      .eq('source_id', source.id).range(from, from + 999);
    (page ?? []).forEach((r: any) => seen.add(r.source_url));
    if (!page || page.length < 1000) break;
  }
  // Blindveier (besøkt uten oppskrift) hoppes over i 14 dager, så
  // kategorisider med nye oppskrifter blir sett på igjen jevnlig.
  const cutoff = new Date(Date.now() - 14 * 864e5).toISOString();
  const { data: visited } = await db
    .from('harvest_visited').select('url')
    .eq('source_id', source.id).gt('visited_at', cutoff);
  (visited ?? []).forEach((r: any) => seen.add(r.url));
  // Dypeste stier først — ekte oppskrifter ligger dypere enn kategorisider.
  const depth = (u: string) => new URL(u).pathname.split('/').filter(Boolean).length;
  const usable = [...found]
    .filter((u) => u.startsWith(origin) && !seen.has(u))
    .filter((u) => robotsAllows(rules, new URL(u).pathname));

  // Frøene er valgt for hånd og er grunne (dybde 1–2). Dybdesorteringen
  // kastet dem derfor bakerst og kuttet dem bort så snart sitemapet fylte
  // køen — nettopp de kategoriene vi la inn med vilje ble aldri besøkt.
  const seeds = new Set(source.sample_urls ?? []);
  const seeded = usable.filter((u) => seeds.has(u));
  const rest = usable.filter((u) => !seeds.has(u)).sort((a, b) => depth(b) - depth(a));
  const urls = [...seeded, ...rest].slice(0, PAGES);

  const provider = createJsonLdProvider(source.id);
  const queued = new Set(urls);
  let saved = 0;
  let batch: unknown[] = [];
  const flush = async () => {
    if (!batch.length) return;
    const { error } = await db
      .from('external_recipe_candidates')
      .upsert(batch, { onConflict: 'source_id,source_url' });
    if (!error) saved += batch.length;
    batch = [];
  };
  const duds: string[] = [];   // besøkt uten oppskrift → huskes i harvest_visited
  let inARow = 0;              // påfølgende avvisninger fra kilden
  for (let i = 0; i < urls.length; i += 1) {
    const pageUrl = urls[i];
    const res = await politeFetch(pageUrl);

    /**
     * Bare 404 og 410 er blindveier. 403, 429, 5xx og timeout betyr at
     * kilden ikke ville svare NÅ — ikke at siden mangler en oppskrift.
     *
     * Før havnet alle sammen i harvest_visited og ble hoppet over i
     * fjorten dager. En kilde bak Cloudflare brant dermed seksti ekte
     * oppskrifts-URL-er per kjøring og svartelistet dem i to uker.
     *
     * Og sier kilden nei tre ganger på rad, gir vi oss for denne runden.
     * Det er både høfligere og raskere enn å banke på 57 ganger til.
     */
    if (!res.ok) {
      const permanent = res.status === 404 || res.status === 410;
      if (permanent) { duds.push(pageUrl); inARow = 0; } else {
        inARow += 1;
        if (inARow >= 3) break;
      }
    } else {
      inARow = 0;
    }
    if (res.ok) {
      // Snøball: detaljsider (TINE m.fl.) lenker videre til flere oppskrifter,
      // selv når listesidene er tomme JS-skall. Nye lenker legges bakerst i
      // køen til kjøringens tak — samme robots- og seen-filter som ellers.
      if (urls.length < PAGES) {
        for (const link of findRecipeLinks(res.body, pageUrl)) {
          if (urls.length >= PAGES) break;
          if (queued.has(link) || seen.has(link)) continue;
          if (!robotsAllows(rules, new URL(link).pathname)) continue;
          queued.add(link);
          urls.push(link);
        }
      }
      let row = null;
      try {
        row = provider.toCandidate(res.body, pageUrl);
      } catch { /* uparselig side — hopp over */ }
      if (row) batch.push(row);
      else duds.push(pageUrl);
    }
    if (batch.length >= 20) await flush();
  }
  await flush();
  if (duds.length) {
    await db.from('harvest_visited').upsert(
      duds.map((u) => ({ source_id: source.id, url: u, visited_at: new Date().toISOString() })),
      { onConflict: 'source_id,url' },
    );
  }

  console.log(`høsting: ${source.id} +${saved} (av ${urls.length} nye URL-er), totalt ${(total ?? 0) + saved}/${TARGET}`);
  return json({ ok: true, source: source.id, urls: urls.length, saved, total: (total ?? 0) + saved, target: TARGET });
});
