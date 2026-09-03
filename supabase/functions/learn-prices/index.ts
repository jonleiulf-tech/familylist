// Edge Function: lær prisene fra kvitteringene.
//
// Kvitteringene har skrevet til price_observations siden dag én, men
// INGEN leste tabellen. Estimatet på handlelisten sto derfor på prisene
// fra den opprinnelige importen — og piloten 2. september viste at de lå
// 2-3 ganger for høyt på varene familien kjøper mest (havredrikk 58 mot
// 22,33, Gryr 55 mot 29,90).
//
// Denne jobben lukker sløyfen. Den kjører som service_role, fordi
// item_catalog er referansedata som bare bakgrunnsjobber får skrive.
//
// Cron (SQL-editoren, én gang):
//   select cron.schedule(
//     'learn-prices', '20 4 * * *',
//     $$ select net.http_post(
//          url := 'https://<ref>.supabase.co/functions/v1/learn-prices',
//          headers := jsonb_build_object('Authorization', 'Bearer <service_role>')
//        ) $$);
//
// Reglene ligger i _shared/priceLearning.ts, med tester i
// src/lib/priceLearning.test.js — de er de samme reglene appen bruker.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { learnedPrice, priceThresholds, priceTrend, MAX_AGE_DAYS } from '../_shared/priceLearning.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
  });

/** Hvor mange varer én kjøring tar. Holder kjøretiden forutsigbar. */
const MAX_ITEMS = 400;

/** PostgREST legger `in()`-lista i URL-en. 400 norske varenavn er 8-12 kB
 *  og sprenger URI-grensen — da svarte hele nattjobben 500 og lærte
 *  ingenting. Navnene hentes i porsjoner. */
const CHUNK = 50;

/** OCR-lesninger er merkbart dårligere enn et PDF-tekstlag. Feltet ble
 *  lagret, valgt ut — og aldri brukt. En enkelt OCR-linje kunne sette
 *  prisen på en vare som ikke hadde noen. */
const MIN_CONFIDENCE = 0.8;

/** Sammenligning uten å lekke gjennom tidsbruken. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // SB_SECRET_KEY først, som alle de andre bakgrunnsjobbene. Denne leste
  // bare SUPABASE_SERVICE_ROLE_KEY, så på et prosjekt med det nye
  // nøkkelformatet ville jobben svart 403 til cron — og et 403 til pg_net
  // forsvinner i stillhet, altså en død nattjobb som ser ut som «ingen
  // priser trengte oppdatering».
  const serviceKey = Deno.env.get('SB_SECRET_KEY')
    ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceKey) return json({ error: 'Mangler servicenøkkel.' }, 500);

  // Bare service_role slipper inn: jobben skriver til fellesdata.
  const auth = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!timingSafeEqual(auth, serviceKey)) return json({ error: 'Ikke tillatt.' }, 403);

  const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);

  const since = new Date(Date.now() - MAX_AGE_DAYS * 864e5).toISOString();
  const { data: observations, error } = await db
    .from('price_observations')
    // qty og unit MÅ med. Uten dem så dominantUnitGroup() bare «stk» på
    // alt, og kroner per kilo havnet i samme median som kroner per stykk —
    // 24,90 kr/kg og 19,90 kr/stk ble 22,40 kr per ingenting.
    .select('item_name, price, qty, unit, unit_price, regular_unit_price, observed_at, confidence, source')
    .eq('source', 'receipt')
    .gte('confidence', MIN_CONFIDENCE)
    .gte('observed_at', since)
    .lte('observed_at', new Date().toISOString())
    .order('observed_at', { ascending: false })
    .limit(5000);
  if (error) return json({ error: error.message }, 500);

  const byName = new Map<string, Record<string, unknown>[]>();
  for (const row of observations ?? []) {
    const key = String(row.item_name ?? '').trim();
    if (!key) continue;
    const list = byName.get(key) ?? [];
    list.push(row);
    byName.set(key, list);
  }
  if (!byName.size) return json({ ok: true, items: 0, updated: 0 });

  // De eldst lærte varene først. Med et fast «de 400 nyest observerte»
  // ble det alltid samme hode av lista, og resten lærte aldri noe.
  const names = [...byName.keys()];
  const items: Record<string, unknown>[] = [];
  for (let i = 0; i < names.length; i += CHUNK) {
    const { data, error: itemError } = await db
      .from('item_catalog')
      .select('id, name, avg_price, avg_price_unit, price_low, price_high, price_learned_at, good_price_threshold, price_trend')
      .in('name', names.slice(i, i + CHUNK));
    if (itemError) return json({ error: itemError.message }, 500);
    items.push(...(data ?? []));
  }
  items.sort((a, b) => String(a.price_learned_at ?? '').localeCompare(String(b.price_learned_at ?? '')));
  const batch = items.slice(0, MAX_ITEMS);

  let updated = 0;
  let capped = 0;
  const changes: string[] = [];

  for (const item of batch) {
    const rows = byName.get(String(item.name)) ?? [];
    // En SEEDPRIS er en gjetning fra et regneark, ikke noe vi har lært.
    // Havredrikken lå inne på 58 og kostet 22,33; med taket på tok det
    // fire netter å komme fram. Den første rettingen går i ett hopp.
    const seeded = !item.price_learned_at;
    const res = learnedPrice(rows, (item.avg_price as number) ?? null, { seeded });
    if (!res) continue;
    // Fase 2: hva er en god pris for denne varen, og hvor er den på vei?
    // Regnes av de samme radene, i samme enhetsgruppe som prisen.
    const gruppe = rows.filter((r) => String(r.unit ?? 'stk').toLowerCase() === String(res.unit ?? 'stk').toLowerCase()
      || (r.unit_price != null && res.unit));
    const priser = gruppe.map((r) => Number(r.regular_unit_price ?? r.unit_price ?? r.price)).filter((p) => p > 0);
    const terskler = priceThresholds(priser);
    const trend = priceTrend(gruppe);
    // Ingen skriving for en endring man ikke ser: under 1 % er støy — men
    // terskler og trend skrives første gang de finnes.
    const forsteTerskel = terskler && item.good_price_threshold == null;
    const nyTrend = trend.trend !== 'unknown' && trend.trend !== item.price_trend;
    if (res.from !== null && Math.abs(res.price - res.from) / res.from < 0.01 && !forsteTerskel && !nyTrend) continue;

    const { error: upError } = await db.from('item_catalog').update({
      avg_price: res.price,
      // Hvilken enhet prisen gjelder for. Uten dette kunne 129 kr/kg bli
      // ganget med et antall pakker og gi 129 kroner for en 400-grams
      // pakke som kostet 51,60.
      avg_price_unit: res.unit,
      // Spennet er persentiler av det vi har sett, ikke min og maks: én
      // feillest linje på 1 290 sto som «høyeste pris» for alltid, og
      // skjermen viste «kr 22–kr 1290». Historikken ratchet bare oppover
      // og kunne aldri komme tilbake.
      price_low: res.low,
      price_high: res.high,
      price_learned_at: new Date().toISOString(),
      price_obs_count: res.n,
      // Fase 2
      recent_avg_price: res.price,
      good_price_threshold: terskler?.good ?? null,
      excellent_price_threshold: terskler?.excellent ?? null,
      price_trend: trend.trend,
      price_trend_pct: trend.pct,
    }).eq('id', item.id);
    // En svelget feil per rad gjorde at jobben kunne melde suksess uten å
    // ha skrevet noe. Første feil skal i loggen.
    if (upError) {
      if (!changes.length) console.error('learn-prices: skriving feilet:', upError.message);
      continue;
    }

    updated += 1;
    if (res.capped) capped += 1;
    if (changes.length < 25) {
      changes.push(`${item.name}: ${res.from ?? '—'} → ${res.price} kr/${res.unit} (n=${res.n}, ${res.days} dager${res.capped ? ', tak' : ''}${seeded ? ', seed' : ''})`);
    }
  }

  // Loggen er det eneste sporet av en nattjobb — den skal si hva som skjedde.
  console.log(`learn-prices: ${byName.size} varer med observasjoner, ${batch.length} vurdert, ${updated} oppdatert, ${capped} nådde taket`);
  for (const c of changes) console.log('  ', c);

  return json({ ok: true, items: byName.size, updated, capped, changes });
});
