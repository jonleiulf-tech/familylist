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
//          headers := '{"x-scan-secret":"<OFFER_SCAN_SECRET>"}'::jsonb
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
  // Databaselegitimasjonen. Hvilken av de to som finnes avhenger av hvor
  // langt prosjektet er i Supabases overgang til nye nøkler — vi tar den
  // som er der.
  const serviceKey = Deno.env.get('SB_SECRET_KEY')
    ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    ?? '';

  // Adgangskontrollen er BEVISST en egen hemmelighet, ikke en Supabase-
  // nøkkel. Å sammenligne mot service-nøkkelen virket så lenge de gamle
  // JWT-ene var i bruk, men gjør at kallet slutter å virke i det øyeblikket
  // prosjektet bytter nøkkelsystem — og feilen er umulig å se utenfra,
  // fordi begge sider bare sier «401».
  //
  // OFFER_SCAN_SECRET er en streng du velger selv. Sendes som x-scan-secret.
  const wanted = Deno.env.get('OFFER_SCAN_SECRET') ?? '';
  const given = req.headers.get('x-scan-secret') ?? '';
  const auth = req.headers.get('Authorization') ?? '';
  // Den gamle veien beholdes, så en timeplan som alt kjører ikke stopper.
  const legacyOk = Boolean(serviceKey) && auth.includes(serviceKey);
  const secretOk = Boolean(wanted) && given === wanted;

  if (!serviceKey) {
    console.error('Ingen databasenøkkel i miljøet (SB_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY).');
    return json({ error: 'Funksjonen mangler databasenøkkel.' }, 500);
  }
  if (!secretOk && !legacyOk) {
    // Logger FORM, aldri verdi — nok til å se hva som mangler.
    console.error('Avvist.', JSON.stringify({
      harScanSecret: Boolean(wanted),
      fikkScanHeader: given.length > 0,
      fikkAuthHeader: auth.length > 0,
    }));
    return json({
      error: 'Ikke autorisert.',
      hint: wanted
        ? 'Send x-scan-secret med verdien i OFFER_SCAN_SECRET.'
        : 'Sett OFFER_SCAN_SECRET som secret, og send den som x-scan-secret.',
    }, 401);
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
