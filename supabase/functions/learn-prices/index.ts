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
import { learnedPrice, MAX_AGE_DAYS } from '../_shared/priceLearning.ts';

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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceKey) return json({ error: 'Mangler SUPABASE_SERVICE_ROLE_KEY.' }, 500);

  // Bare service_role slipper inn: jobben skriver til fellesdata.
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.includes(serviceKey)) return json({ error: 'Ikke tillatt.' }, 403);

  const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);

  const since = new Date(Date.now() - MAX_AGE_DAYS * 864e5).toISOString();
  const { data: observations, error } = await db
    .from('price_observations')
    .select('item_name, price, unit_price, regular_unit_price, observed_at, confidence')
    .gte('observed_at', since)
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

  const names = [...byName.keys()].slice(0, MAX_ITEMS);
  const { data: items, error: itemError } = await db
    .from('item_catalog')
    .select('id, name, avg_price, price_low, price_high')
    .in('name', names);
  if (itemError) return json({ error: itemError.message }, 500);

  let updated = 0;
  let capped = 0;
  const changes: string[] = [];

  for (const item of items ?? []) {
    const rows = byName.get(item.name) ?? [];
    const res = learnedPrice(rows, item.avg_price ?? null);
    if (!res) continue;
    // Ingen skriving for en endring man ikke ser: under 1 % er støy.
    if (res.from !== null && Math.abs(res.price - res.from) / res.from < 0.01) continue;

    const { error: upError } = await db.from('item_catalog').update({
      avg_price: res.price,
      // Spennet er hva vi FAKTISK har sett betalt, ikke en beregning.
      price_low: Math.min(res.low, Number(item.price_low ?? res.low)),
      price_high: Math.max(res.high, Number(item.price_high ?? res.high)),
      price_learned_at: new Date().toISOString(),
      price_obs_count: res.n,
    }).eq('id', item.id);
    if (upError) continue;

    updated += 1;
    if (res.capped) capped += 1;
    if (changes.length < 25) {
      changes.push(`${item.name}: ${res.from ?? '—'} → ${res.price} (n=${res.n}${res.capped ? ', tak' : ''})`);
    }
  }

  // Loggen er det eneste sporet av en nattjobb — den skal si hva som skjedde.
  console.log(`learn-prices: ${byName.size} varer med observasjoner, ${updated} oppdatert, ${capped} nådde taket`);
  for (const c of changes) console.log('  ', c);

  return json({ ok: true, items: byName.size, updated, capped, changes });
});
