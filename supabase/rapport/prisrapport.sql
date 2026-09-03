-- Prisrapport v2 — svaret på punkt 30.6 i prisintelligens-spesifikasjonen,
-- etter fase 1–4-migrasjonene (20260904090000 … 20260906090000).
--
-- Lim inn HELE filen i Supabase → SQL Editor og kjør. Én spørring, ett
-- resultat: tre kolonner (seksjon, nøkkel, verdi). Ta skjermbilde av hele
-- tabellen. Ingenting endres i basen — det er bare SELECT.
--
-- Krever at fase 1–4 er kjørt (npx supabase db push). Uten dem feiler
-- spørringen på products/household_purchases — det er med vilje: da vet du
-- at migrasjonen mangler.

with
-- ---------------------------------------------------------------- A. varer
a_varer as (
  select
    count(*)                                             as alle,
    count(*) filter (where active)                       as aktive,
    count(*) filter (where avg_price is not null)        as med_pris,
    count(*) filter (where coalesce(price_obs_count,0) > 0) as laert_fra_obs,
    (select count(*) from public.norm_rules)             as aliasregler,
    (select count(*) from public.products)               as produkter,
    (select count(*) from public.products where ean is not null) as produkter_med_ean,
    (select count(*) from public.product_aliases)        as produktaliaser,
    (select count(*) from public.physical_stores)        as fysiske_butikker
  from public.item_catalog
),
-- ------------------------------------------------------ B. observasjoner
obs as (
  select o.*, trim(o.item_name) as navn,
         (o.item_name in (select name from public.item_catalog)) as kjent
  from public.price_observations o
),
b_sum as (
  select
    count(*)                                   as alle,
    count(distinct navn)                       as ulike_varer,
    count(distinct observed_at::date)          as ulike_dager,
    min(observed_at)::date                     as eldste,
    max(observed_at)::date                     as nyeste,
    count(*) filter (where ean is not null)    as med_ean,
    count(*) filter (where product_id is not null) as med_produkt,
    count(*) filter (where is_offer)           as tilbud,
    count(*) filter (where confidence >= 0.9)  as hoy,
    count(*) filter (where confidence >= 0.6 and confidence < 0.9) as middels,
    count(*) filter (where confidence < 0.6)   as lav,
    count(*) filter (where not kjent)          as uloste
  from obs
),
b_kilde as (select source, count(*) n from obs group by source),
b_butikk as (
  select coalesce(s.name, o.store_code, '(ukjent)') as butikk, count(*) n, count(distinct o.navn) varer
  from obs o left join public.stores s on s.code = o.store_code group by 1
),
-- ---------------------------------------------- C. kobling og uløste linjer
c_uloste as (
  select navn, count(*) n, max(observed_at)::date sist
  from obs where not kjent group by navn order by n desc, navn limit 15
),
c_match as (
  -- match_confidence lagres på kjøpslinjene fra og med fase 1
  select
    count(*) filter (where match_method = 'exact')  as eksakt,
    count(*) filter (where match_method in ('prefix','word')) as ordgrense,
    count(*) filter (where match_method = 'stem')   as stamme,
    count(*) filter (where match_method = 'none' or match_method is null) as uten,
    count(*) filter (where match_confidence is not null) as med_maal
  from public.household_purchases where source = 'receipt'
),
-- ------------------------------------------- D. hva husholdningene kjøper
d_kjop as (
  select p.item_name, count(*) linjer, count(distinct p.household_id) hush,
         round(avg(p.qty),1) snitt_mengde, max(p.unit) enhet,
         round(avg(p.price_paid),2) snitt_betalt
  from public.household_purchases p
  group by p.item_name order by linjer desc limit 15
),
d_kilde as (select source, count(*) n from public.household_purchases group by source),
d_grunn as (select purchase_reason, count(*) n from public.household_purchases group by purchase_reason),
d_kvitt as (
  select coalesce(s.name, r.store_code) butikk, count(*) kvitteringer,
         count(distinct r.household_id) hush, sum(r.line_count) linjer, round(sum(r.total)) sum_kr
  from public.receipt_uploads r left join public.stores s on s.code = r.store_code
  group by 1 order by kvitteringer desc
),
-- ------------------------- E. butikkpreferanse PER HUSHOLDNING (fase 1, §6)
e_grunn as (
  select p.household_id, p.item_name, coalesce(p.chain_code,'?') chain_code, count(*) n
  from public.household_purchases p where p.chain_code is not null
  group by 1,2,3
),
e_tot as (
  select household_id, item_name, sum(n) tot, count(*) kjeder, max(n) topp
  from e_grunn group by 1,2 having sum(n) >= 3
),
e_pref as (
  select h.name hush, t.item_name, t.tot, t.kjeder,
         (select coalesce(s.name, g.chain_code) from e_grunn g left join public.stores s on s.code = g.chain_code
           where g.household_id = t.household_id and g.item_name = t.item_name order by g.n desc limit 1) toppbutikk,
         round(100.0 * t.topp / t.tot) andel
  from e_tot t join public.households h on h.id = t.household_id
  order by andel desc, tot desc limit 15
),
-- --------------------------- E2. global fordeling (anonym), til sammenligning
g_grunn as (select navn, coalesce(store_code,'?') store_code, count(*) n from obs where kjent group by 1,2),
g_tot as (select navn, sum(n) tot, count(*) butikker, max(n) topp from g_grunn group by navn having sum(n) >= 5 and count(*) >= 2),
g_pref as (
  select t.navn, t.tot, t.butikker,
         (select coalesce(s.name, g.store_code) from g_grunn g left join public.stores s on s.code = g.store_code
           where g.navn = t.navn order by g.n desc limit 1) toppbutikk,
         round(100.0 * t.topp / t.tot) andel
  from g_tot t order by andel desc, tot desc limit 10
),
-- ----------------------------- F. pålitelig prishistorikk og trend
f_hist as (
  select navn, count(*) n, count(distinct observed_at::date) dager,
         round(percentile_cont(0.5) within group (order by coalesce(unit_price, price))::numeric, 2) median
  from obs where kjent group by navn having count(*) >= 5 and count(distinct observed_at::date) >= 3
),
f_trend as (
  select navn,
    round(avg(coalesce(unit_price, price)) filter (where observed_at >= now() - interval '30 days'), 2)  nylig,
    round(avg(coalesce(unit_price, price)) filter (where observed_at <  now() - interval '30 days'
                                                     and observed_at >= now() - interval '90 days'), 2) tidligere,
    count(*) filter (where observed_at >= now() - interval '30 days') n_nylig,
    count(*) filter (where observed_at <  now() - interval '30 days' and observed_at >= now() - interval '90 days') n_tidligere
  from obs where kjent group by navn
),
f_trend_ok as (
  select navn, nylig, tidligere, round(100.0 * (nylig - tidligere) / tidligere) pst
  from f_trend where n_nylig >= 2 and n_tidligere >= 2 and tidligere > 0
),
-- ------------------------------------------------------------ fase 4
-- Sparing mot egen referansepris (§24), hamstre-egnethet (§18).
h_spar as (
  select left(household_id::text, 8) hush,
         count(*) linjer,
         count(*) filter (where reference_price is not null) med_ref,
         count(*) filter (where estimated_saving > 0) spart_linjer,
         round(coalesce(sum(estimated_saving) filter (where saving_confidence >= 0.5), 0), 0) spart_kr
  from public.household_purchases
  where purchased_at >= now() - interval '30 days'
  group by household_id
),
h_ham as (
  select coalesce(stock_up_suitability, '(ikke satt)') egnethet, count(*) n
  from public.item_catalog where coalesce(active, true) group by 1
),
-- ------------------------------------------------------------ rapporten
r as (
  select 10 ord, 'A. Kanoniske varer' sek, 'varer i item_catalog' nok, alle::text verdi from a_varer
  union all select 11, 'A. Kanoniske varer', 'aktive', aktive::text from a_varer
  union all select 12, 'A. Kanoniske varer', 'med pris', med_pris::text from a_varer
  union all select 13, 'A. Kanoniske varer', 'pris lært fra observasjoner', laert_fra_obs::text from a_varer
  union all select 14, 'A. Kanoniske varer', 'aliasregler (norm_rules)', aliasregler::text from a_varer
  union all select 15, 'A. Kanoniske varer', 'produkter (Product-nivå)', produkter || ' — ' || produkter_med_ean || ' med EAN, ' || produktaliaser || ' aliaser' from a_varer
  union all select 16, 'A. Kanoniske varer', 'fysiske butikker', fysiske_butikker::text from a_varer
  union all select 20, 'B. Prisobservasjoner', 'observasjoner', alle::text from b_sum
  union all select 21, 'B. Prisobservasjoner', 'ulike varenavn', ulike_varer::text from b_sum
  union all select 22, 'B. Prisobservasjoner', 'ulike dager', ulike_dager::text from b_sum
  union all select 23, 'B. Prisobservasjoner', 'periode', coalesce(eldste::text,'—') || ' → ' || coalesce(nyeste::text,'—') from b_sum
  union all select 24, 'B. Prisobservasjoner', 'sikkerhet høy / middels / lav', hoy || ' / ' || middels || ' / ' || lav from b_sum
  union all select 24.5, 'B. Prisobservasjoner', 'merket som tilbud', tilbud::text from b_sum
  union all select 25 + row_number() over (order by n desc) * 0.01, 'B. Prisobservasjoner', 'kilde: ' || source, n::text from b_kilde
  union all select 26 + row_number() over (order by n desc) * 0.01, 'B. Prisobservasjoner', 'kjede: ' || butikk, n || ' obs, ' || varer || ' varer' from b_butikk
  union all select 30, 'C. Kobling', 'eksakte EAN-treff (observasjoner med EAN)', med_ean::text from b_sum
  union all select 31, 'C. Kobling', 'observasjoner koblet til et produkt', med_produkt::text from b_sum
  union all select 32, 'C. Kobling', 'kvitteringslinjer: eksakt / ordgrense / stamme / uten treff',
                   eksakt || ' / ' || ordgrense || ' / ' || stamme || ' / ' || uten || '  (' || med_maal || ' med mål)' from c_match
  union all select 33, 'C. Kobling', 'uløste observasjoner (navn ikke i katalogen)', uloste || ' av ' || alle from b_sum
  union all select 34 + row_number() over (order by n desc) * 0.01, 'C. Kobling', 'uløst: ' || navn, n || ' obs, sist ' || sist from c_uloste
  union all select 40 + row_number() over (order by linjer desc) * 0.01, 'D. Mest kjøpt (kjøpslinjer)', item_name,
                   linjer || ' linjer · ' || hush || ' hush. · vanlig ' || coalesce(snitt_mengde::text,'?') || ' ' || coalesce(enhet,'') || ' · snitt kr ' || coalesce(snitt_betalt::text,'?') from d_kjop
  union all select 41 + row_number() over (order by n desc) * 0.01, 'D. Kjøpslinjer per kilde', source, n::text from d_kilde
  union all select 42 + row_number() over (order by n desc) * 0.01, 'D. Kjøpsårsak', purchase_reason, n::text from d_grunn
  union all select 43 + row_number() over (order by kvitteringer desc) * 0.01, 'D. Kvitteringer per kjede', butikk,
                   kvitteringer || ' kvitt. · ' || linjer || ' linjer · kr ' || sum_kr || ' · ' || hush || ' hush.' from d_kvitt
  union all select 50, 'E. Butikkpreferanse per husholdning', 'varer med ≥3 kjøp med kjent kjede', (select count(*)::text from e_tot)
  union all select 51 + row_number() over (order by andel desc, tot desc) * 0.01, 'E. Butikkpreferanse per husholdning', hush || ': ' || item_name,
                   andel || ' % ' || toppbutikk || ' · ' || tot || ' kjøp i ' || kjeder || ' kjeder' from e_pref
  union all select 55 + row_number() over (order by andel desc, tot desc) * 0.01, 'E2. Global fordeling (anonym, til sammenligning)', navn,
                   andel || ' % ' || toppbutikk || ' · ' || tot || ' obs i ' || butikker || ' kjeder' from g_pref
  union all select 60, 'F. Pålitelig prishistorikk', 'varer med ≥5 obs på ≥3 dager', (select count(*)::text from f_hist)
  union all select 61 + row_number() over (order by n desc) * 0.01, 'F. Pålitelig prishistorikk', navn,
                   n || ' obs · ' || dager || ' dager · median kr ' || median from (select * from f_hist order by n desc limit 15) x
  union all select 70, 'F. Pristrend (30 d mot 31–90 d)', 'varer med nok data', (select count(*)::text from f_trend_ok)
  union all select 71 + row_number() over (order by pst desc) * 0.01, 'F. Pristrend', navn,
                   (case when pst > 0 then '+' else '' end) || pst || ' % (' || tidligere || ' → ' || nylig || ')' from (select * from f_trend_ok order by abs(pst) desc limit 10) y
  union all select 80 + row_number() over (order by n desc) * 0.01, 'G. Hamstre-egnethet (item_catalog)', egnethet, n::text from h_ham
  union all select 85, 'G. Sparing siste 30 dager', 'husholdninger med kjøpslinjer', (select count(*)::text from h_spar)
  union all select 86 + row_number() over (order by spart_kr desc) * 0.01, 'G. Sparing siste 30 dager', hush,
                   linjer || ' linjer · ' || med_ref || ' med referanse · ' || spart_linjer || ' billigere enn vanlig · spart ca. kr ' || spart_kr from h_spar
)
select sek as seksjon, nok as "nøkkel", verdi from r order by ord;
