// Edge Function: weeklyOfferScan().
//
// Henter kundeaviser fra eTilbudsavis (Tjek/ShopGun) og fyller offers-tabellen.
// Ment å kjøres på timeplan — mandag 06:00:
//
//   select cron.schedule(
//     'weekly-offer-scan', '0 6 * * 1',
//     $$ select net.http_post(
//          url := 'https://<ref>.supabase.co/functions/v1/weekly-offer-scan',
//          headers := '{"Authorization":"Bearer <service_role_key>"}'::jsonb
//        ) $$);
//
// Prinsipper fra handoff-en:
//   * Én kilde som feiler stopper ikke resten. Alt logges i offer_fetch_logs.
//   * Aldri oftere enn daglig. Respekter vilkårene til kilden.
//   * Ingen auto-innlegging på handlelisten — tilbud er alltid et forslag.
//
// Secrets: TJEK_API_KEY (gratis fra developers.tjek.com)

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { hotspotToOffer, dedupeOffers } from '../_shared/tjek.ts';

const SQUID = 'https://squid-api.tjek.com/v2';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

async function squid(path: string, apiKey: string) {
  const r = await fetch(`${SQUID}${path}`, {
    headers: { 'X-Api-Key': apiKey, Accept: 'application/json' },
  });
  if (!r.ok) throw new Error(`Tjek svarte ${r.status} på ${path}`);
  return r.json();
}

Deno.serve(async (req: Request) => {
  // Kun den hemmelige nøkkelen skal kunne trigge jobben. Godtar både ny
  // (sb_secret_… via secrets) og gammel service_role i overgangen.
  const auth = req.headers.get('Authorization') ?? '';
  const keys = [Deno.env.get('SB_SECRET_KEY'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')]
    .filter((k): k is string => Boolean(k));
  const serviceKey = keys[0] ?? '';
  if (!serviceKey || !keys.some((k) => auth.includes(k))) {
    return json({ error: 'Ikke autorisert.' }, 401);
  }

  const apiKey = Deno.env.get('TJEK_API_KEY');
  if (!apiKey) {
    return json({ error: 'TJEK_API_KEY mangler i miljøvariabler.' }, 501);
  }

  const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);

  const { data: sources } = await db
    .from('offer_sources')
    .select('*')
    .eq('enabled', true)
    .eq('source_type', 'api');

  if (!sources?.length) return json({ message: 'Ingen aktive kilder.' });

  // Varenavn brukes til å koble tilbud mot familiens varer.
  const { data: catalog } = await db.from('item_catalog').select('name');
  const catalogNames = (catalog ?? []).map((c: { name: string }) => c.name);

  const results: unknown[] = [];

  for (const source of sources) {
    // Kilder uten dealer_id hører ikke til denne jobben. Kassalapp-kilden
    // er registrert med source_type 'api' og kjøres av kassal-offer-scan,
    // men ble plukket opp her og skrev en «failed»-rad ved hver kjøring.
    if (!source.dealer_id) continue;

    const { data: log, error: logErr } = await db
      .from('offer_fetch_logs')
      .insert({ source_id: source.id, status: 'running' })
      .select().single();

    // Loggraden skal aldri kunne velte jobben. Uten dette ble `log` null,
    // og `log.id` kastet en TypeError — også inne i catch-blokken, der
    // ingen fanger den. Utad ble det «Internal Server Error».
    if (logErr) console.error('offer_fetch_logs:', logErr.message);
    const logId = log?.id ?? null;

    try {
      const catalogs = await squid(
        `/catalogs?dealer_ids=${encodeURIComponent(source.dealer_id)}&limit=5`,
        apiKey,
      );
      if (!Array.isArray(catalogs) || !catalogs.length) {
        throw new Error('Ingen kundeaviser tilgjengelig');
      }

      let found: ReturnType<typeof hotspotToOffer>[] = [];

      for (const cat of catalogs) {
        const hotspots = await squid(`/catalogs/${cat.id}/hotspots`, apiKey);
        if (!Array.isArray(hotspots)) continue;

        const validFrom = cat.run_from ? String(cat.run_from).slice(0, 10) : null;
        const validTo = cat.run_till ? String(cat.run_till).slice(0, 10) : null;

        found = found.concat(
          hotspots
            .map((h) => hotspotToOffer(h, {
              dealerId: source.dealer_id,
              catalogNames,
              validFrom,
              validTo,
            }))
            .filter(Boolean) as ReturnType<typeof hotspotToOffer>[],
        );
      }

      const offers = dedupeOffers(found as Record<string, unknown>[]);

      // Erstatt forrige runde fra denne kilden i stedet for å stable opp
      // duplikater uke etter uke.
      await db.from('offers')
        .delete()
        .eq('store_code', source.store_code)
        .eq('source_type', 'api');

      let saved = 0;
      if (offers.length) {
        const { error, count } = await db
          .from('offers').insert(offers, { count: 'exact' });
        if (error) throw new Error(error.message);
        saved = count ?? offers.length;
      }

      if (logId !== null) await db.from('offer_fetch_logs').update({
        status: 'ok',
        finished_at: new Date().toISOString(),
        offers_found: found.length,
        offers_saved: saved,
      }).eq('id', logId);

      await db.from('offer_sources')
        .update({ last_fetched_at: new Date().toISOString() })
        .eq('id', source.id);

      results.push({ source: source.name, found: found.length, saved });
    } catch (e) {
      // Logg og gå videre — én død kilde skal ikke felle hele jobben.
      const message = (e as Error)?.message ?? 'Ukjent feil';
      console.error(`Kilde «${source.name}» feilet:`, message);
      if (logId !== null) await db.from('offer_fetch_logs').update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        error_message: message,
      }).eq('id', logId);
      results.push({ source: source.name, error: message });
    }
  }

  return json({ results });
});
