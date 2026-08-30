// Edge Function: hent fremgangsmåten fra ÉN oppskriftsside familien selv
// har valgt, så den kan vises i appen som husholdningens eget utklipp.
//
// Nettleseren kan ikke hente tine.no/rema.no direkte (CORS), så denne
// funksjonen gjør oppslaget: laster siden, leser JSON-LD-oppskriften og
// returnerer stegene som ren tekst. Kun domener som finnes i
// recipe_sources-registeret godtas — funksjonen kan ikke brukes til å
// hente vilkårlige adresser.

import { createClient } from 'jsr:@supabase/supabase-js@2';

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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const { url } = await req.json();
    const target = new URL(String(url ?? ''));
    if (target.protocol !== 'https:') return json({ error: 'Bare https-lenker støttes.' }, 400);

    // Kun kjente oppskriftskilder — aldri vilkårlige adresser.
    const serviceKey = Deno.env.get('SB_SECRET_KEY')
      ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);
    const { data: sources } = await db.from('recipe_sources').select('base_url');
    const host = target.hostname.replace(/^www\./, '');
    const allowed = (sources ?? []).some((s) => {
      try {
        const h = new URL(s.base_url).hostname.replace(/^www\./, '');
        return host === h || host.endsWith(`.${h}`);
      } catch { return false; }
    });
    if (!allowed) return json({ error: 'Ukjent oppskriftskilde.' }, 400);

    const res = await fetch(target, {
      headers: { 'user-agent': 'PlukkelistenBot/1.0 (+https://plukkelisten.no)' },
    });
    if (!res.ok) return json({ error: `Kilden svarte ${res.status}.` }, 502);
    const html = await res.text();

    const recipe = findRecipe(html);
    const steps = parseInstructions(recipe?.recipeInstructions).slice(0, 60);
    return json({
      steps,
      title: cleanText(recipe?.name) || null,
      servings: recipe?.recipeYield ? cleanText(recipe.recipeYield) : null,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Uventet feil.' }, 400);
  }
});
