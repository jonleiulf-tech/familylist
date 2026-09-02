// Edge Function: hent fremgangsmåten fra ÉN oppskriftsside familien selv
// har valgt, så den kan vises i appen som husholdningens eget utklipp.
//
// Nettleseren kan ikke hente tine.no/rema.no direkte (CORS), så denne
// funksjonen gjør oppslaget: laster siden, leser JSON-LD-oppskriften og
// returnerer stegene som ren tekst.
//
// TILLATELSESREGLENE GJELDER HER OGSÅ. Funksjonen sjekket bare at domenet
// FANTES i recipe_sources — ikke om kilden var påslått, om vi får hente
// oppskrifter fra den, eller om vi får lagre fremgangsmåten. MatPrat ligger
// i registeret med enabled = false og DISABLED_PENDING_PERMISSION, og var
// dermed hentbar herfra. Det bryter husregelen om at MatPrat står urørt til
// skriftlig tillatelse finnes, og at robots.txt-tillatelse ikke er en
// innholdslisens.
//
// Nå kreves, i denne rekkefølgen:
//   1. innlogget bruker (funksjonen koster båndbredde hos kilden)
//   2. kilden må være enabled og can_fetch_recipe
//   3. robots.txt må tillate nettopp denne adressen, og Crawl-delay følges
//   4. stegene returneres BARE når kilden har can_store_instructions

import { createClient } from 'jsr:@supabase/supabase-js@2';

/** Én felles kjenning, med kontaktadresse, slik kildene kan nå oss. */
const UA = 'PlukkelistenBot/1.0 (+https://plukkelisten.no/bot)';

/** Maks oppslag per bruker per time. Én familie trenger noen få. */
const MAX_PER_HOUR = 20;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

/** Fjern HTML-tagger og vanlige entiteter fra et tekststeg. */
const cleanText = (s: unknown) =>
  String(s ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

type Step = { section?: string; text: string };

/** recipeInstructions kan være streng, liste av steg eller seksjoner. */
function parseInstructions(raw: unknown, section?: string): Step[] {
  if (!raw) return [];
  if (typeof raw === 'string') {
    // Én lang streng: del på linjeskift, ellers behold som ett steg.
    return raw.split(/\n+/).map(cleanText).filter(Boolean)
      .map((text) => ({ ...(section ? { section } : {}), text }));
  }
  if (Array.isArray(raw)) return raw.flatMap((r) => parseInstructions(r, section));
  if (typeof raw === 'object') {
    const node = raw as Record<string, unknown>;
    const type = String(node['@type'] ?? '');
    if (type.includes('HowToSection')) {
      return parseInstructions(node.itemListElement, cleanText(node.name) || section);
    }
    const text = cleanText(node.text ?? node.name);
    return text ? [{ ...(section ? { section } : {}), text }] : [];
  }
  return [];
}

/** Finn Recipe-noden i sidens JSON-LD-blokker. */
function findRecipe(html: string): Record<string, unknown> | null {
  const blocks = html.matchAll(
    /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const m of blocks) {
    let data: unknown;
    try { data = JSON.parse(m[1]); } catch { continue; }
    const queue: unknown[] = [data];
    while (queue.length) {
      const node = queue.shift();
      if (Array.isArray(node)) { queue.push(...node); continue; }
      if (!node || typeof node !== 'object') continue;
      const obj = node as Record<string, unknown>;
      const type = obj['@type'];
      const types = Array.isArray(type) ? type.map(String) : [String(type ?? '')];
      if (types.some((t) => t.toLowerCase() === 'recipe')) return obj;
      if (obj['@graph']) queue.push(obj['@graph']);
      if (obj.mainEntity) queue.push(obj.mainEntity);
    }
  }
  return null;
}

/**
 * robots.txt for verten, tolket for VÅR kjenning.
 *
 * En 5xx betyr ikke «ingen regler» — den betyr at vi ikke vet, og da er
 * svaret nei. RFC 9309 sier det samme, og en kilde som svarer 503 er
 * gjerne en kilde under press.
 */
async function robotsFor(origin: string) {
  let res: Response;
  try {
    res = await fetch(`${origin}/robots.txt`, { headers: { 'user-agent': UA } });
  } catch {
    return { unknown: true, disallow: [] as string[], allow: [] as string[], delayMs: 0 };
  }
  if (res.status >= 500) return { unknown: true, disallow: [], allow: [], delayMs: 0 };
  if (!res.ok) return { unknown: false, disallow: [], allow: [], delayMs: 0 };

  const text = await res.text();
  const disallow: string[] = [];
  const allow: string[] = [];
  let delaySeconds = 0;
  let applies = false;
  for (const raw of text.split('\n')) {
    const line = raw.split('#')[0].trim();
    if (!line) continue;
    const [rawKey, ...rest] = line.split(':');
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'user-agent') {
      const ua = value.toLowerCase();
      applies = ua === '*' || ua.includes('plukkelisten');
      continue;
    }
    if (!applies) continue;
    if (key === 'disallow' && value) disallow.push(value);
    if (key === 'allow' && value) allow.push(value);
    // Crawl-delay ble lest bort før. Sier kilden 10 sekunder, hentet vi
    // ni ganger raskere enn den ba om.
    if (key === 'crawl-delay') {
      const n = Number(value.replace(',', '.'));
      if (Number.isFinite(n) && n > delaySeconds) delaySeconds = n;
    }
  }
  return { unknown: false, disallow, allow, delayMs: Math.min(30, delaySeconds) * 1000 };
}

/** Lengste treff vinner, slik robots-standarden sier. */
function robotsAllows(rules: { allow: string[]; disallow: string[] }, path: string) {
  const match = (patterns: string[]) => patterns.reduce((best, p) => {
    const re = new RegExp(`^${p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}`);
    return re.test(path) && p.length > best ? p.length : best;
  }, 0);
  const deny = match(rules.disallow);
  return deny === 0 || match(rules.allow) >= deny;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    // 1) Innlogget bruker. Prosjektnøkkelen alene er ikke en bruker: den
    //    ligger i klientpakka og er kjent for alle.
    const auth = req.headers.get('Authorization') ?? '';
    const asUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SB_PUBLISHABLE_KEY') ?? '',
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: 'Ikke innlogget.' }, 401);

    const { url } = await req.json();
    const target = new URL(String(url ?? ''));
    if (target.protocol !== 'https:') return json({ error: 'Bare https-lenker støttes.' }, 400);

    const serviceKey = Deno.env.get('SB_SECRET_KEY')
      ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);

    // 2) Kilden må være påslått OG tillate at vi henter oppskrifter.
    const { data: sources } = await db.from('recipe_sources')
      .select('id, base_url, enabled, can_fetch_recipe, can_store_instructions, integration_modes');
    const host = target.hostname.replace(/^www\./, '');
    const source = (sources ?? []).find((s) => {
      try {
        const h = new URL(s.base_url).hostname.replace(/^www\./, '');
        return host === h || host.endsWith(`.${h}`);
      } catch { return false; }
    });
    if (!source) return json({ error: 'Ukjent oppskriftskilde.' }, 400);

    const modes = String(source.integration_modes ?? '');
    if (source.enabled === false || source.can_fetch_recipe === false
        || modes.includes('DISABLED_PENDING_PERMISSION')) {
      return json({
        error: 'Denne kilden har vi ikke tillatelse til å hente fra. Åpne oppskriften hos kilden i stedet.',
      }, 403);
    }

    // 3) Enkel kvote per bruker. Uten den kunne én løkke drive vilkårlig
    //    trafikk mot tine.no i vårt navn.
    const since = new Date(Date.now() - 3600e3).toISOString();
    const { count } = await db.from('ai_scan_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('kind', 'oppskrift').gte('created_at', since);
    if ((count ?? 0) >= MAX_PER_HOUR) {
      return json({ error: 'Du har hentet mange oppskrifter denne timen. Prøv igjen senere.' }, 429);
    }

    // 4) robots.txt for nettopp denne adressen, og pausen kilden ber om.
    const rules = await robotsFor(target.origin);
    if (rules.unknown) {
      return json({ error: 'Fikk ikke lest robots.txt hos kilden. Prøv igjen senere.' }, 503);
    }
    if (!robotsAllows(rules, target.pathname)) {
      return json({ error: 'Kilden ber oss om ikke å hente denne siden.' }, 403);
    }
    if (rules.delayMs > 0) await new Promise((r) => setTimeout(r, rules.delayMs));

    await db.from('ai_scan_log').insert({
      user_id: user.id, kind: 'oppskrift', note: host,
    });

    const res = await fetch(target, { headers: { 'user-agent': UA } });
    if (!res.ok) return json({ error: `Kilden svarte ${res.status}.` }, 502);
    const html = (await res.text()).slice(0, 2_000_000);

    const recipe = findRecipe(html);
    // 5) Fremgangsmåten er kildens redaksjonelle tekst. At siden er
    //    offentlig gir oss lov til å LESE den, ikke til å lagre og vise
    //    den. Uten can_store_instructions får appen bare lenken.
    const mayStore = source.can_store_instructions === true;
    const steps = mayStore
      ? parseInstructions(recipe?.recipeInstructions).slice(0, 60)
      : [];
    return json({
      steps,
      stored: mayStore,
      ...(mayStore ? {} : {
        note: 'Kilden har ikke gitt oss lov til å gjengi fremgangsmåten. Åpne den hos kilden.',
      }),
      title: cleanText(recipe?.name) || null,
      servings: recipe?.recipeYield ? cleanText(recipe.recipeYield) : null,
    });
  } catch (e) {
    console.error('fetch-recipe feilet:', e instanceof Error ? e.message : e);
    return json({ error: 'Klarte ikke å lese oppskriften.' }, 400);
  }
});
