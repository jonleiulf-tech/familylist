// Edge Function: tilbudsscan mot Kassalapp.
//
// Slår opp dagens pris for de varene familien kjøper oftest, og lagrer dem
// som tilbud der prisen ligger markant under deres egen snittpris fra
// kvitteringene.
//
// Bruker samme endepunkt og nøkkel som produktsøket, som alt er i drift.
// Ingen ny tilgang, ingen godkjenning å vente på — til forskjell fra
// eTilbudsavis.
//
// Kjøres på timeplan, f.eks. daglig 06:00:
//   select cron.schedule(
//     'kassal-offer-scan', '0 6 * * *',
//     $$ select net.http_post(
//          url := 'https://<ref>.supabase.co/functions/v1/kassal-offer-scan',
//          headers := '{"Authorization":"Bearer <service_role_key>"}'::jsonb
//        ) $$);

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { productToOffer } from '../_shared/priceDrop.ts';

const KASSAL_BASE = 'https://kassal.app/api/v1';

// Hvor mange varer som sjekkes per kjøring. Kassalapp har kvote, og de
// mest kjøpte varene er også de som betyr mest for handlekurven.
const MAX_ITEMS = 60;
// Pause mellom kallene, så vi ikke hamrer på API-et.
const DELAY_MS = 350;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// deno-lint-ignore no-explicit-any
function mapProduct(p: any) {
  const price = p?.current_price && typeof p.current_price === 'object'
    ? p.current_price.price : p?.current_price;
  const unit = p?.current_unit_price && typeof p.current_unit_price === 'object'
    ? p.current_unit_price.price : p?.current_unit_price;
  return {
    name: p?.name ?? '',
    brand: p?.brand ?? '',
    store: p?.store?.code ?? p?.store?.name ?? null,
    current_price: typeof price === 'number' ? price : 0,
    current_unit_price: typeof unit === 'number' ? unit : 0,
    weight_unit: p?.weight_unit ?? '',
    url: p?.url ?? '',
  };
}

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

  const apiKey = Deno.env.get('KASSALAPP_API_KEY');
  if (!apiKey) return json({ error: 'KASSALAPP_API_KEY mangler i miljøvariabler.' }, 501);

  const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);

  const { data: source } = await db
    .from('offer_sources').select('id')
    .eq('name', 'Kassalapp – prisfall').maybeSingle();

  const { data: log } = await db.from('offer_fetch_logs')
    .insert({ source_id: source?.id ?? null, status: 'running' })
    .select().single();

  try {
    // Varer med både kjøpsfrekvens og kjent snittpris — uten snittpris har
    // vi ingenting å måle dagens pris mot.
    const { data: items } = await db
      .from('item_catalog')
      .select('name, avg_price, price_low, price_high, score')
      .gt('avg_price', 0)
      .gt('score', 0)
      .order('score', { ascending: false })
      .limit(MAX_ITEMS);

    if (!items?.length) throw new Error('Ingen varer med snittpris å sjekke');

    const offers: Record<string, unknown>[] = [];
    let checked = 0;
    let apiErrors = 0;

    for (const item of items) {
      try {
        const url = new URL(`${KASSAL_BASE}/products`);
        url.searchParams.set('search', item.name);
        url.searchParams.set('unique', '1');
        url.searchParams.set('size', '12');

        const r = await fetch(url, {
          headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
        });

        if (r.status === 429) {
          // Kvoten er brukt opp. Stopp pent i stedet for å bli utestengt.
          console.warn('Kassalapp svarte 429 — avslutter runden tidlig');
          break;
        }
        if (!r.ok) { apiErrors += 1; continue; }

        const body = await r.json();
        const products = (Array.isArray(body?.data) ? body.data : []).map(mapProduct);
        checked += 1;

        // Billigste treff avgjør om varen er på tilbud et sted.
        const cheapest = products
          .filter((p: { current_price: number }) => p.current_price > 0)
          .sort((a: { current_price: number }, b: { current_price: number }) =>
            a.current_price - b.current_price)[0];

        if (!cheapest) continue;
        const offer = productToOffer(cheapest, item);
        if (offer) offers.push(offer as Record<string, unknown>);
      } catch (_e) {
        apiErrors += 1;
      }
      await sleep(DELAY_MS);
    }

    // Erstatt forrige runde fra denne kilden framfor å stable opp duplikater.
    await db.from('offers').delete().eq('source', 'Kassalapp – under deres snittpris');

    let saved = 0;
    if (offers.length) {
      const { error, count } = await db.from('offers').insert(offers, { count: 'exact' });
      if (error) throw new Error(error.message);
      saved = count ?? offers.length;
    }

    await db.from('offer_fetch_logs').update({
      status: 'ok',
      finished_at: new Date().toISOString(),
      offers_found: offers.length,
      offers_saved: saved,
      error_message: apiErrors ? `${apiErrors} oppslag feilet` : null,
    }).eq('id', log.id);

    if (source?.id) {
      await db.from('offer_sources')
        .update({ last_fetched_at: new Date().toISOString() }).eq('id', source.id);
    }

    return json({ checked, found: offers.length, saved, apiErrors });
  } catch (e) {
    const message = (e as Error)?.message ?? 'Ukjent feil';
    console.error('Kassalapp-scan feilet:', message);
    await db.from('offer_fetch_logs').update({
      status: 'failed', finished_at: new Date().toISOString(), error_message: message,
    }).eq('id', log.id);
    return json({ error: message }, 502);
  }
});
