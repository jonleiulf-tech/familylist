-- Prisrapport — svaret på punkt 30.6 i prisintelligens-spesifikasjonen.
--
-- Lim inn HELE filen i Supabase → SQL Editor og kjør. Én spørring, ett
-- resultat: tre kolonner (seksjon, nøkkel, verdi). Ta skjermbilde av hele
-- tabellen. Ingenting endres i basen — det er bare SELECT.
--
-- Tre av tallene spesifikasjonen ber om kan ikke gis ennå, og står som
-- «ikke målt» med årsak. Se docs/prisintelligens-plan.md, punkt 4.

with
-- ---------------------------------------------------------------- A. varer
a_varer as (
  select
    count(*)                                             as alle,
    count(*) filter (where active)                       as aktive,
    count(*) filter (where avg_price is not null)        as med_pris,
    count(*) filter (where coalesce(price_obs_count,0) > 0) as laert_fra_obs,
    (select count(*) from public.norm_rules)             as aliasregler
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
    count(*) filter (where kassal_product_id is not null) as med_kassal_id,
    count(*) filter (where confidence >= 0.9)  as hoy,
    count(*) filter (where confidence >= 0.6 and confidence < 0.9) as middels,
    count(*) filter (where confidence < 0.6)   as lav,
    count(*) filter (where not kjent)          as uloste
  from obs
),
b_kilde as (
  select source, count(*) n from obs group by source
),
b_butikk as (
  select coalesce(s.name, o.store_code, '(ukjent)') as butikk, count(*) n,
         count(distinct o.navn) varer
  from obs o left join public.stores s on s.code = o.store_code
  group by 1
),
-- ---------------------------------------------- C. uløste kvitteringslinjer
c_uloste as (
  select navn, count(*) n, max(observed_at)::date sist
  from obs where not kjent
  group by navn order by n desc, navn limit 15
),
-- ------------------------------------------- D. hva husholdningene kjøper
d_vaner as (
  select h.item_name, sum(h.times_bought) ganger, count(distinct h.household_id) hush,
         round(avg(h.usual_qty),1) snitt_mengde, max(h.unit) enhet
  from public.item_habits h
  group by h.item_name order by ganger desc limit 15
),
d_kvitt as (
  select coalesce(s.name, r.store_code) butikk, count(*) kvitteringer,
         count(distinct r.household_id) hush, sum(r.line_count) linjer, round(sum(r.total)) sum_kr
  from public.receipt_uploads r left join public.stores s on s.code = r.store_code
  group by 1 order by kvitteringer desc
),
d_turer as (
  select count(*) turer, coalesce(sum(jsonb_array_length(items)),0) linjer,
         min(trip_date) forste, max(trip_date) siste, count(distinct household_id) hush
  from public.saved_trips
),
-- -------------------------- E. butikkfordeling per vare (GLOBAL, anonym)
e_grunn as (
  select navn, coalesce(store_code,'?') store_code, count(*) n
  from obs where kjent group by navn, store_code
),
e_tot as (
  select navn, sum(n) tot, count(*) butikker, max(n) topp
  from e_grunn group by navn having sum(n) >= 5 and count(*) >= 2
),
e_pref as (
  select t.navn, t.tot, t.butikker,
         (select coalesce(s.name, g.store_code) from e_grunn g left join public.stores s on s.code = g.store_code
           where g.navn = t.navn order by g.n desc limit 1) toppbutikk,
         round(100.0 * t.topp / t.tot) andel
  from e_tot t order by andel desc, tot desc limit 15
),
-- ----------------------------- F. pålitelig prishistorikk og trend
f_hist as (
  -- samme regel som priceLearning.js: minst 5 observasjoner på minst 3 ulike dager
  select navn, count(*) n, count(distinct observed_at::date) dager,
         round(percentile_cont(0.5) within group (order by coalesce(unit_price, price))::numeric, 2) median
  from obs where kjent
  group by navn having count(*) >= 5 and count(distinct observed_at::date) >= 3
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
-- ------------------------------------------------------------ rapporten
r as (
  -- A
  select 10 ord, 'A. Kanoniske varer' sek, 'varer i item_catalog' nok, alle::text verdi from a_varer
  union all select 11, 'A. Kanoniske varer', 'aktive', aktive::text from a_varer
  union all select 12, 'A. Kanoniske varer', 'med pris', med_pris::text from a_varer
  union all select 13, 'A. Kanoniske varer', 'pris lært fra observasjoner', laert_fra_obs::text from a_varer
  union all select 14, 'A. Kanoniske varer', 'aliasregler (norm_rules)', aliasregler::text from a_varer
  union all select 15, 'A. Kanoniske varer', 'produkter (Product-nivå)', 'finnes ikke ennå — fase 1'
  union all select 16, 'A. Kanoniske varer', 'kassal_matches (per husholdning)', (select count(*)::text || ' rader — ingen kode bruker tabellen' from public.kassal_matches)
  -- B
  union all select 20, 'B. Prisobservasjoner', 'observasjoner', alle::text from b_sum
  union all select 21, 'B. Prisobservasjoner', 'ulike varenavn', ulike_varer::text from b_sum
  union all select 22, 'B. Prisobservasjoner', 'ulike dager', ulike_dager::text from b_sum
  union all select 23, 'B. Prisobservasjoner', 'periode', coalesce(eldste::text,'—') || ' → ' || coalesce(nyeste::text,'—') from b_sum
  union all select 24, 'B. Prisobservasjoner', 'sikkerhet høy / middels / lav', hoy || ' / ' || middels || ' / ' || lav from b_sum
  union all select 25 + row_number() over (order by n desc) * 0.01, 'B. Prisobservasjoner', 'kilde: ' || source, n::text from b_kilde
  union all select 26 + row_number() over (order by n desc) * 0.01, 'B. Prisobservasjoner', 'kjede: ' || butikk, n || ' obs, ' || varer || ' varer' from b_butikk
  -- C
  union all select 30, 'C. Kobling', 'eksakte EAN-treff', med_ean || ' — Kassalapp-svar lagres ikke som observasjoner ennå (fase 1, pkt 6)' from b_sum
  union all select 31, 'C. Kobling', 'med kassal_product_id', med_kassal_id::text from b_sum
  union all select 32, 'C. Kobling', 'fuzzy mot eksakt', 'ikke målt — match_confidence lagres ikke (plan §2d)'
  union all select 33, 'C. Kobling', 'uløste linjer (navn ikke i katalogen)', uloste || ' av ' || alle from b_sum
  union all select 34 + row_number() over (order by n desc) * 0.01, 'C. Kobling', 'uløst: ' || navn, n || ' obs, sist ' || sist from c_uloste
  -- D
  union all select 40 + row_number() over (order by ganger desc) * 0.01, 'D. Mest kjøpt (husholdninger, fra vaner)', item_name,
                   ganger || ' kjøp · ' || hush || ' hush. · vanlig ' || snitt_mengde || ' ' || coalesce(enhet,'') from d_vaner
  union all select 41 + row_number() over (order by kvitteringer desc) * 0.01, 'D. Kvitteringer per kjede', butikk,
                   kvitteringer || ' kvitt. · ' || linjer || ' linjer · kr ' || sum_kr || ' · ' || hush || ' hush.' from d_kvitt
  union all select 42, 'D. Fullførte handleturer (saved_trips)', 'kan importeres til household_purchases',
                   turer || ' turer, ' || linjer || ' linjer, ' || coalesce(forste::text,'—') || ' → ' || coalesce(siste::text,'—') || ', ' || hush || ' hush.' from d_turer
  -- E
  union all select 50, 'E. Butikkpreferanse', 'per husholdning', 'ikke mulig — observasjonene er anonyme (plan §2a). Under: GLOBAL fordeling'
  union all select 51 + row_number() over (order by andel desc, tot desc) * 0.01, 'E. Butikkfordeling (global)', navn,
                   andel || ' % ' || toppbutikk || ' · ' || tot || ' obs i ' || butikker || ' kjeder' from e_pref
  -- F
  union all select 60, 'F. Pålitelig prishistorikk', 'varer med ≥5 obs på ≥3 dager', (select count(*)::text from f_hist)
  union all select 61 + row_number() over (order by n desc) * 0.01, 'F. Pålitelig prishistorikk', navn,
                   n || ' obs · ' || dager || ' dager · median kr ' || median from (select * from f_hist order by n desc limit 15) x
  union all select 70, 'F. Pristrend (30 d mot 31–90 d)', 'varer med nok data', (select count(*)::text from f_trend_ok)
  union all select 71 + row_number() over (order by pst desc) * 0.01, 'F. Pristrend', navn,
                   (case when pst > 0 then '+' else '' end) || pst || ' % (' || tidligere || ' → ' || nylig || ')' from (select * from f_trend_ok order by abs(pst) desc limit 10) y
)
select sek as seksjon, nok as "nøkkel", verdi from r order by ord;
