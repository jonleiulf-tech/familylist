-- ===========================================================================
--  audit-offers.sql — revisjon av eksisterende rader i public.offers
-- ---------------------------------------------------------------------------
--  Hva:   Finner tilbudsrader som allerede ligger i databasen og som de nye
--         reglene i src/lib/priceDrop.js ville stoppet i dag.
--  Hvem:  Limes inn i Supabase SQL Editor av eier/admin.
--  Regel: SKRIPTET LESER KUN. Ingen delete/update/insert kjøres.
--         Opprydningsforslaget nederst er utkommentert med vilje.
--
--  VIKTIG OM SUPABASE SQL EDITOR:
--    Editoren viser bare resultatet av SISTE setning når du kjører alt.
--    Kjør derfor ÉN blokk om gangen: marker blokken og trykk Ctrl/Cmd+Enter.
--    Spørring A gir hele oversikten i én tabell — start der.
--
--  Bakgrunn (to kjente feilklasser):
--    1) match_name sier hvilken katalogvare tilbudet SKAL være. Et feiltreff
--       ga «Battery 0,5 l, med/uten sukker» presentert som «dere kjøper
--       soyamelk uten sukker ofte». sameProduct() i priceDrop.js stopper
--       slikt nå, men gamle rader ligger igjen.
--    2) original_price settes av productToOffer() til familiens EGEN
--       snittpris (catalogItem.avg_price), ikke butikkens førpris. Da er
--       discount_percentage «rabatt mot eget snitt», ikke mot listepris.
--
--  Kolonner i offers (fra 20260829090000_schema.sql + senere migrasjoner):
--    id, store_code, store_name, product_name, normalized_name, brand,
--    category, match_name, price, original_price,
--    discount_percentage (GENERERT: (original_price-price)/original_price*100),
--    unit, unit_price, valid_from, valid_to, source, source_type, source_url,
--    household_id, created_at, is_sample, created_by
-- ===========================================================================


-- ===========================================================================
-- A) SAMMENDRAG — alle funn talt opp i én tabell.
--    Kjør denne først. Den sier hvor stort problemet er før du graver.
-- ===========================================================================
with total as (select count(*)::bigint n from public.offers)
select * from (
  select 1 as nr, 'Totalt antall rader i offers'                        as funn, (select n from total) as antall
  union all
  select 2, 'Eksempeldata (is_sample = true) — ikke ekte tilbud',
         count(*) from public.offers where is_sample
  union all
  select 3, '1. match_name finnes ikke i product_name (Battery-klassen)',
         count(*) from public.offers
         where match_name is not null and btrim(match_name) <> ''
           and position(lower(btrim(match_name)) in lower(product_name)) = 0
  union all
  select 4, '2. Urimelig rabatt (discount_percentage > 85)',
         count(*) from public.offers where discount_percentage > 85
  union all
  select 5, '3. original_price finnes, men price >= original_price',
         count(*) from public.offers
         where original_price is not null and price >= original_price
  union all
  select 6, '4. Utløpte tilbud (valid_to < current_date)',
         count(*) from public.offers where valid_to < current_date
  union all
  select 7, '5. Duplikatrader (product_name + store_code + valid_to)',
         coalesce(sum(c), 0) from (
           select count(*) c from public.offers
           group by lower(btrim(product_name)), coalesce(store_code, '—'),
                    coalesce(valid_to, date '1900-01-01')
           having count(*) > 1
         ) d
  union all
  select 8, '7. store_name ser fortsatt ut som en butikk-KODE',
         count(*) from public.offers
         where store_name is not null
           and (store_name like '%\_%' or store_name ~ '_NO$'
                or (store_name = upper(store_name)
                    and store_name ~ '[A-ZÆØÅ]'
                    and store_name not in ('MENY','KIWI','SPAR','REMA 1000','OBS')))
  union all
  select 9, '8. Ugyldige: price <= 0 eller tomt product_name',
         count(*) from public.offers
         where price <= 0 or product_name is null or btrim(product_name) = ''
  union all
  select 10, 'Ekstra: original_price = familiens eget snitt (ikke førpris)',
         count(*) from public.offers
         where source ilike '%snittpris%' and original_price is not null
) s
order by nr;


-- ===========================================================================
-- 1) BATTERY-KLASSEN — match_name forekommer IKKE i product_name.
--    Avslører: tilbudet er koblet til feil katalogvare. Raden sier «dere
--    kjøper soyamelk ofte», men produktet er en energidrikk. Dette er det
--    samme sameProduct() i priceDrop.js nå avviser før innsetting.
--    Sortert etter hvor ofte familien kjøper varen (item_catalog.score,
--    så receipt_count) — øverste rader er de som gjør mest skade i appen.
--    NB: substring-testen er grov med vilje. Den fanger de åpenbare
--    bommene; en rad kan være feil selv om navnet delvis matcher.
-- ===========================================================================
select
  o.id,
  o.match_name          as katalogvare,
  o.product_name        as tilbudt_produkt,
  o.store_name,
  o.price,
  o.original_price,
  o.discount_percentage as rabatt_pst,
  o.source,
  o.source_type,
  o.valid_to,
  o.is_sample,
  c.score               as kjopsfrekvens_score,   -- høyere = kjøpes oftere
  c.receipt_count       as antall_kvitteringer,
  c.frequency_sig       as frekvens_tekst          -- 'Ofte' / 'Svært ofte'
from public.offers o
left join public.item_catalog c
       on lower(c.name) = lower(btrim(o.match_name))
where o.match_name is not null
  and btrim(o.match_name) <> ''
  and position(lower(btrim(o.match_name)) in lower(o.product_name)) = 0
order by c.score desc nulls last,
         c.receipt_count desc nulls last,
         o.created_at desc;


-- ===========================================================================
-- 2) URIMELIG RABATT — discount_percentage > 85.
--    Avslører: nesten alltid en datafeil, ikke et kupp. Typisk at snittet
--    gjelder en full flaske mens treffet er en porsjonspose (11 g ketchup
--    mot flaskepris = «−97 %»). Samme grense som MAX_PLAUSIBLE_DROP = 0.85
--    i priceDrop.js. Kolonnen er GENERERT, så den kan ikke være «feilskrevet»
--    — det er original_price eller price som er feil.
-- ===========================================================================
select
  o.id,
  o.product_name,
  o.match_name,
  o.store_name,
  o.price,
  o.original_price,
  o.discount_percentage as rabatt_pst,
  round(o.original_price - o.price, 2) as kroner_avslag,
  o.unit,
  o.unit_price,
  o.source,
  o.source_type,
  o.valid_from,
  o.valid_to,
  o.is_sample
from public.offers o
where o.discount_percentage > 85
order by o.discount_percentage desc, o.created_at desc;


-- ===========================================================================
-- 3) INGEN REELL RABATT — original_price finnes, men price >= original_price.
--    Avslører: raden presenteres som tilbud, men er like dyr eller dyrere
--    enn referanseprisen. discount_percentage blir 0 eller negativ.
--    Årsaker: felt byttet om ved import, eller prisen har steget siden
--    original_price ble satt.
-- ===========================================================================
select
  o.id,
  o.product_name,
  o.match_name,
  o.store_name,
  o.price,
  o.original_price,
  o.discount_percentage as rabatt_pst,     -- 0 eller negativ = ikke tilbud
  case
    when o.price = o.original_price then 'lik pris'
    else 'dyrere enn førpris'
  end as diagnose,
  o.source,
  o.source_type,
  o.valid_to,
  o.is_sample
from public.offers o
where o.original_price is not null
  and o.price >= o.original_price
order by (o.price - o.original_price) desc, o.created_at desc;


-- ===========================================================================
-- 4) UTLØPTE TILBUD — valid_to < current_date.
--    Avslører: gammel ferskvare som aldri ble ryddet bort. Tilbud har kort
--    levetid (productToOffer() setter valid_to = i dag + 7 dager), så alt
--    som er mer enn noen uker gammelt er støy.
--    dager_utlopt hjelper deg velge en trygg opprydningsgrense.
-- ===========================================================================
select
  o.id,
  o.product_name,
  o.match_name,
  o.store_name,
  o.price,
  o.valid_from,
  o.valid_to,
  (current_date - o.valid_to) as dager_utlopt,
  o.source,
  o.source_type,
  o.is_sample,
  o.created_at
from public.offers o
where o.valid_to is not null
  and o.valid_to < current_date
order by o.valid_to asc;

-- 4b) Utløpte tilbud gruppert per uke — viser om opprydding stoppet opp
--     på et bestemt tidspunkt, eller om det lekker jevnt.
select
  date_trunc('week', o.valid_to)::date as uke_valid_to,
  count(*)                              as antall,
  count(*) filter (where o.is_sample)   as herav_eksempeldata,
  min(o.valid_to)                       as tidligste,
  max(o.valid_to)                       as seneste
from public.offers o
where o.valid_to is not null
  and o.valid_to < current_date
group by 1
order by 1;


-- ===========================================================================
-- 5) DUPLIKATER — samme product_name + store_code + valid_to flere ganger.
--    Avslører: at samme skann/import har kjørt to ganger, eller at to
--    kilder leverer samme tilbud. Sammenligningen er case-insensitiv og
--    trimmet, siden importene ikke normaliserer likt.
--    beholdes_id = eldste raden (den ville en opprydding beholdt).
-- ===========================================================================
select
  lower(btrim(o.product_name))                 as produkt_normalisert,
  coalesce(o.store_code, '—')                  as store_code,
  coalesce(o.valid_to::text, '(ingen)')        as valid_to,
  count(*)                                     as antall_kopier,
  count(distinct o.price)                      as antall_ulike_priser,
  min(o.price)                                 as laveste_pris,
  max(o.price)                                 as hoyeste_pris,
  array_agg(distinct coalesce(o.source, '(ingen kilde)')) as kilder,
  (array_agg(o.id order by o.created_at asc))[1]          as beholdes_id,
  array_agg(o.id order by o.created_at asc)               as alle_ider
from public.offers o
group by lower(btrim(o.product_name)),
         coalesce(o.store_code, '—'),
         coalesce(o.valid_to::text, '(ingen)')
having count(*) > 1
order by count(*) desc, produkt_normalisert;

-- 5b) Samme duplikater, men rad for rad — slik at du ser hvilken konkret
--     rad som er overflødig. rad_nr = 1 er den eldste (den en opprydding
--     ville beholdt); rad_nr 2 og oppover er kopiene.
with nummerert as (
  select
    o.id, o.product_name, o.store_code, o.store_name, o.valid_to,
    o.price, o.original_price, o.source, o.source_type, o.created_at,
    row_number() over (
      partition by lower(btrim(o.product_name)),
                   coalesce(o.store_code, '—'),
                   coalesce(o.valid_to, date '1900-01-01')
      order by o.created_at asc, o.id asc
    ) as rad_nr,
    count(*) over (
      partition by lower(btrim(o.product_name)),
                   coalesce(o.store_code, '—'),
                   coalesce(o.valid_to, date '1900-01-01')
    ) as antall_i_gruppen
  from public.offers o
)
select
  rad_nr,                       -- 1 = eldste, beholdes. 2+ = overflødig kopi
  antall_i_gruppen,
  id, product_name, store_code, store_name, valid_to,
  price, original_price, source, source_type, created_at
from nummerert
where antall_i_gruppen > 1
order by lower(btrim(product_name)), store_code, valid_to, rad_nr;


-- ===========================================================================
-- 6) KILDEKVALITET — rader per source og source_type, med feilandel.
--    Avslører: hvilken kilde som produserer søpla. En kilde med høy andel
--    «feil match» eller «urimelig rabatt» bør skrus av i offer_sources
--    (enabled = false) før man rydder radene, ellers fylles tabellen igjen.
-- ===========================================================================
select
  coalesce(o.source, '(ingen source)')           as kilde,
  coalesce(o.source_type, '(ingen source_type)') as kildetype,
  count(*)                                        as antall_rader,
  count(*) filter (where o.is_sample)             as eksempeldata,
  count(*) filter (
    where o.match_name is not null and btrim(o.match_name) <> ''
      and position(lower(btrim(o.match_name)) in lower(o.product_name)) = 0
  )                                               as feil_match,
  count(*) filter (where o.discount_percentage > 85)          as urimelig_rabatt,
  count(*) filter (where o.original_price is not null
                     and o.price >= o.original_price)         as ingen_rabatt,
  count(*) filter (where o.valid_to < current_date)           as utlopt,
  count(*) filter (where o.price <= 0
                     or o.product_name is null
                     or btrim(o.product_name) = '')           as ugyldig,
  round(
    100.0 * count(*) filter (
      where (o.match_name is not null and btrim(o.match_name) <> ''
             and position(lower(btrim(o.match_name)) in lower(o.product_name)) = 0)
         or o.discount_percentage > 85
         or (o.original_price is not null and o.price >= o.original_price)
         or o.price <= 0
         or o.product_name is null or btrim(o.product_name) = ''
    ) / nullif(count(*), 0)
  , 1)                                            as feilandel_pst,
  min(o.created_at)                               as forste_rad,
  max(o.created_at)                               as siste_rad
from public.offers o
group by 1, 2
order by feilandel_pst desc nulls last, antall_rader desc;

-- 6b) Kobler kildene mot offer_sources / offer_fetch_logs, slik at du ser
--     om en kilde som lager søppel fortsatt står som enabled.
select
  s.id,
  s.name,
  s.source_type,
  s.store_code,
  s.enabled,
  s.fetch_frequency,
  s.last_fetched_at,
  l.siste_status,
  l.siste_kjoring,
  l.siste_feil,
  l.antall_feilede_kjoringer
from public.offer_sources s
left join lateral (
  select
    (array_agg(f.status        order by f.started_at desc))[1] as siste_status,
    max(f.started_at)                                          as siste_kjoring,
    (array_agg(f.error_message order by f.started_at desc)
       filter (where f.error_message is not null))[1]          as siste_feil,
    count(*) filter (where f.status = 'failed')                as antall_feilede_kjoringer
  from public.offer_fetch_logs f
  where f.source_id = s.id
) l on true
order by s.enabled desc, s.name;


-- ===========================================================================
-- 7) BUTIKKNAVN SOM FORTSATT ER EN KODE.
--    Avslører: rader som ble lagret før storeLabel() ble tatt i bruk.
--    «MENY_NO», «COOP_EXTRA», «ODA_NO» skal vises som «MENY», «Coop Extra»,
--    «Oda». forslag_fra_storeLabel viser hva koden ville gjort i dag.
--    NB: MENY, KIWI, SPAR, REMA 1000 og OBS er LOVLIGE store bokstaver og
--    er derfor holdt utenfor — de er ekte kjedenavn, ikke koder.
-- ===========================================================================
select
  o.id,
  o.store_name,
  o.store_code,
  case
    when o.store_name like '%\_%'                  then 'inneholder understrek'
    when o.store_name ~ '_NO$'                     then 'landkode-suffiks'
    else 'bare VERSALER'
  end                                              as mistenkt_grunn,
  -- Speiler STORE_LABELS + fallback i src/lib/priceDrop.js (storeLabel()).
  case upper(replace(btrim(o.store_name), ' ', '_'))
    when 'MENY_NO'     then 'MENY'
    when 'ODA_NO'      then 'Oda'
    when 'KIWI_NO'     then 'KIWI'
    when 'SPAR_NO'     then 'SPAR'
    when 'JOKER_NO'    then 'Joker'
    when 'BUNNPRIS'    then 'Bunnpris'
    when 'COOP_EXTRA'  then 'Coop Extra'
    when 'COOP_MEGA'   then 'Coop Mega'
    when 'COOP_PRIX'   then 'Coop Prix'
    when 'COOP_OBS'    then 'Obs'
    when 'COOP_MARKED' then 'Coop Marked'
    when 'REMA_1000'   then 'REMA 1000'
    when 'EUROPRIS_NO' then 'Europris'
    else replace(regexp_replace(upper(o.store_name), '_NO$', ''), '_', ' ')
  end                                              as forslag_pen_visning,
  count(*) over (partition by o.store_name)        as antall_rader_med_samme_navn,
  o.product_name,
  o.source,
  o.source_type,
  o.valid_to
from public.offers o
where o.store_name is not null
  and btrim(o.store_name) <> ''
  and (
        o.store_name like '%\_%'
     or o.store_name ~ '_NO$'
     or (o.store_name = upper(o.store_name)
         and o.store_name ~ '[A-ZÆØÅ]'
         and o.store_name not in ('MENY','KIWI','SPAR','REMA 1000','OBS'))
  )
order by antall_rader_med_samme_navn desc, o.store_name, o.created_at desc;

-- 7b) Bare de distinkte navnene — kort liste å rette opp mot STORE_LABELS
--     i src/lib/priceDrop.js.
select
  o.store_name,
  o.store_code,
  count(*) as antall_rader
from public.offers o
where o.store_name is not null
  and (o.store_name like '%\_%'
       or o.store_name ~ '_NO$'
       or (o.store_name = upper(o.store_name)
           and o.store_name ~ '[A-ZÆØÅ]'
           and o.store_name not in ('MENY','KIWI','SPAR','REMA 1000','OBS')))
group by 1, 2
order by antall_rader desc;


-- ===========================================================================
-- 8) UGYLDIGE / FORELDRELØSE RADER.
--    Avslører: rader som aldri kan vises meningsfullt — pris 0 eller
--    negativ, tomt produktnavn, ugyldig datointervall, eller en
--    household_id som ikke lenger peker på en husholdning.
--    Kolonnen «feil» sier hvorfor raden er med.
-- ===========================================================================
select
  o.id,
  o.product_name,
  o.match_name,
  o.store_name,
  o.price,
  o.original_price,
  o.unit_price,
  o.valid_from,
  o.valid_to,
  o.household_id,
  o.source,
  o.source_type,
  o.created_at,
  concat_ws(' | ',
    case when o.price <= 0                                  then 'price <= 0' end,
    case when o.product_name is null
           or btrim(o.product_name) = ''                    then 'tomt product_name' end,
    case when o.match_name is null
           or btrim(o.match_name) = ''                      then 'mangler match_name' end,
    case when o.original_price is not null
           and o.original_price <= 0                        then 'original_price <= 0' end,
    case when o.unit_price is not null
           and o.unit_price <= 0                            then 'unit_price <= 0' end,
    case when o.valid_from is not null and o.valid_to is not null
           and o.valid_from > o.valid_to                    then 'valid_from etter valid_to' end,
    case when o.valid_to is null                            then 'mangler valid_to (utløper aldri)' end,
    case when o.household_id is not null
           and not exists (select 1 from public.households h
                           where h.id = o.household_id)     then 'foreldreløs household_id' end,
    case when o.created_by is not null
           and not exists (select 1 from auth.users u
                           where u.id = o.created_by)       then 'foreldreløs created_by' end
  ) as feil
from public.offers o
where o.price <= 0
   or o.product_name is null or btrim(o.product_name) = ''
   or o.match_name is null   or btrim(o.match_name) = ''
   or (o.original_price is not null and o.original_price <= 0)
   or (o.unit_price is not null and o.unit_price <= 0)
   or (o.valid_from is not null and o.valid_to is not null and o.valid_from > o.valid_to)
   or o.valid_to is null
   or (o.household_id is not null
       and not exists (select 1 from public.households h where h.id = o.household_id))
   or (o.created_by is not null
       and not exists (select 1 from auth.users u where u.id = o.created_by))
order by o.created_at desc;


-- ===========================================================================
-- 9) EKSTRA: «førpris» som egentlig er familiens EGEN snittpris.
--    Avslører: rader der original_price kommer fra item_catalog.avg_price
--    (productToOffer() gjør dette bevisst), ikke fra butikkens listepris.
--    De er ikke feil i seg selv — men rabattprosenten betyr noe annet, og
--    de bør merkes i UI som «under deres snittpris», ikke «X % avslag».
--    avvik_mot_katalog viser hvor godt original_price stemmer med snittet
--    i item_catalog i dag; stort avvik = snittet har flyttet seg siden da.
-- ===========================================================================
select
  o.id,
  o.product_name,
  o.match_name,
  o.price,
  o.original_price          as oppgitt_forpris,
  c.avg_price               as katalog_snitt,
  c.price_low               as katalog_laveste,
  c.price_high              as katalog_hoyeste,
  round(o.original_price - c.avg_price, 2) as avvik_mot_katalog,
  o.discount_percentage     as rabatt_pst,
  o.source,
  o.source_type,
  o.valid_to
from public.offers o
left join public.item_catalog c
       on lower(c.name) = lower(btrim(o.match_name))
where o.original_price is not null
  and (o.source ilike '%snittpris%' or o.source_type = 'api')
order by abs(coalesce(o.original_price - c.avg_price, 0)) desc nulls last,
         o.created_at desc;


-- ===========================================================================
-- 10) SAMLET «SVARTELISTE» — hver problemrad én gang, med alle grunner.
--     Kjør denne til slutt for å se hvor mange UNIKE rader som er berørt
--     (samme rad kan treffe flere sjekker). Bruk den som fasit før du
--     vurderer opprydningen nederst.
-- ===========================================================================
with dupes as (
  select id from (
    select o.id,
           row_number() over (
             partition by lower(btrim(o.product_name)),
                          coalesce(o.store_code, '—'),
                          coalesce(o.valid_to, date '1900-01-01')
             order by o.created_at asc, o.id asc
           ) rn
    from public.offers o
  ) x where rn > 1
)
select
  o.id,
  o.product_name,
  o.match_name,
  o.store_name,
  o.price,
  o.original_price,
  o.discount_percentage,
  o.valid_to,
  o.source,
  o.source_type,
  o.is_sample,
  concat_ws(' + ',
    case when o.match_name is not null and btrim(o.match_name) <> ''
          and position(lower(btrim(o.match_name)) in lower(o.product_name)) = 0
         then '1:feil-match' end,
    case when o.discount_percentage > 85              then '2:urimelig-rabatt' end,
    case when o.original_price is not null
          and o.price >= o.original_price             then '3:ingen-rabatt' end,
    case when o.valid_to < current_date               then '4:utlopt' end,
    case when o.id in (select id from dupes)          then '5:duplikat' end,
    case when o.store_name like '%\_%'
           or o.store_name ~ '_NO$'                   then '7:kode-som-butikknavn' end,
    case when o.price <= 0 or o.product_name is null
           or btrim(o.product_name) = ''              then '8:ugyldig' end
  ) as grunner
from public.offers o
where (o.match_name is not null and btrim(o.match_name) <> ''
       and position(lower(btrim(o.match_name)) in lower(o.product_name)) = 0)
   or o.discount_percentage > 85
   or (o.original_price is not null and o.price >= o.original_price)
   or o.valid_to < current_date
   or o.id in (select id from dupes)
   or o.store_name like '%\_%'
   or o.store_name ~ '_NO$'
   or o.price <= 0
   or o.product_name is null or btrim(o.product_name) = ''
order by o.created_at desc;


-- ###########################################################################
-- ###########################################################################
-- ##                                                                       ##
-- ##   OPPRYDNINGSFORSLAG — KJØRES IKKE. ALT UNDER ER UTKOMMENTERT.        ##
-- ##                                                                       ##
-- ###########################################################################
-- ###########################################################################
--
-- LES DETTE FØR DU FJERNER KOMMENTARTEGNENE:
--
--   1. Ta backup først. I Supabase: Database → Backups, eller lag en
--      kopitabell:
--        -- create table public.offers_backup_20260831 as
--        --   select * from public.offers;
--
--   2. Kjør ALLTID select-varianten (spørring 1–10 over) og se på radene
--      før du sletter dem. Tallene fra spørring A skal stemme.
--
--   3. Skru av kilden FØRST hvis spørring 6 peker ut en råtten kilde,
--      ellers fylles tabellen opp igjen ved neste skann:
--        -- update public.offer_sources set enabled = false where name = '...';
--
--   4. Kjør i en transaksjon, én blokk om gangen, og sjekk radantallet:
--        -- begin;
--        --   <én delete her>
--        --   -- se på «DELETE n» i utdata; rollback hvis n ser galt ut
--        -- commit;    (eller: rollback;)
--
--   5. RLS: delete på offers er ikke tillatt for vanlige innloggede
--      brukere (policyen er append-only). Kjør dette som eier/admin i
--      SQL Editor, som går via service_role.
--
--   6. Rekkefølge er med vilje: 8 → 3 → 2 → 1 → 5 → 4. Ryddes de ugyldige
--      og duplikatene sist, endrer «eldste rad»-utvelgelsen seg underveis.
--
-- ---------------------------------------------------------------------------
-- (8) Ugyldige rader: ingen pris eller intet produktnavn. Kan ikke vises.
-- ---------------------------------------------------------------------------
-- delete from public.offers
--  where price <= 0
--     or product_name is null
--     or btrim(product_name) = '';
--
-- ---------------------------------------------------------------------------
-- (3) Ingen reell rabatt: like dyrt eller dyrere enn oppgitt førpris.
-- ---------------------------------------------------------------------------
-- delete from public.offers
--  where original_price is not null
--    and price >= original_price;
--
-- ---------------------------------------------------------------------------
-- (2) Urimelig rabatt: over MAX_PLAUSIBLE_DROP (85 %) — nesten alltid at
--     tilbudet og referanseprisen gjelder to forskjellige varestørrelser.
-- ---------------------------------------------------------------------------
-- delete from public.offers
--  where discount_percentage > 85;
--
-- ---------------------------------------------------------------------------
-- (1) Battery-klassen: match_name finnes ikke i product_name.
--     ADVARSEL: dette er den grovheteste sjekken. Gå gjennom listen fra
--     spørring 1 manuelt først; substring-testen kan slå ut på riktige
--     treff der katalognavnet er skrevet annerledes enn produktnavnet
--     («ketchup» vs «Tomatketchup»). Vurder å begrense til de radene du
--     faktisk har sett på:
--       -- and id in ('...uuid...', '...uuid...');
-- ---------------------------------------------------------------------------
-- delete from public.offers
--  where match_name is not null
--    and btrim(match_name) <> ''
--    and position(lower(btrim(match_name)) in lower(product_name)) = 0;
--
-- ---------------------------------------------------------------------------
-- (5) Duplikater: behold den eldste raden i hver gruppe, slett resten.
-- ---------------------------------------------------------------------------
-- delete from public.offers o
--  using (
--    select id from (
--      select id,
--             row_number() over (
--               partition by lower(btrim(product_name)),
--                            coalesce(store_code, '—'),
--                            coalesce(valid_to, date '1900-01-01')
--               order by created_at asc, id asc
--             ) rn
--      from public.offers
--    ) x
--    where rn > 1
--  ) d
--  where o.id = d.id;
--
-- ---------------------------------------------------------------------------
-- (4) Utløpte tilbud. Grensen på 14 dager gir litt slakk mot tidssoner og
--     mot tilbud som forlenges. Sett den til current_date for hard rydding.
-- ---------------------------------------------------------------------------
-- delete from public.offers
--  where valid_to is not null
--    and valid_to < current_date - interval '14 days';
--
-- ---------------------------------------------------------------------------
-- (7) Butikknavn som er en kode: IKKE slett — dette er en RETTING.
--     Radene er ellers gyldige tilbud; bare visningsnavnet er stygt.
--     (Utkommentert som alt annet her.)
-- ---------------------------------------------------------------------------
-- update public.offers
--    set store_name = case upper(replace(btrim(store_name), ' ', '_'))
--          when 'MENY_NO'     then 'MENY'
--          when 'ODA_NO'      then 'Oda'
--          when 'KIWI_NO'     then 'KIWI'
--          when 'SPAR_NO'     then 'SPAR'
--          when 'JOKER_NO'    then 'Joker'
--          when 'BUNNPRIS'    then 'Bunnpris'
--          when 'COOP_EXTRA'  then 'Coop Extra'
--          when 'COOP_MEGA'   then 'Coop Mega'
--          when 'COOP_PRIX'   then 'Coop Prix'
--          when 'COOP_OBS'    then 'Obs'
--          when 'COOP_MARKED' then 'Coop Marked'
--          when 'REMA_1000'   then 'REMA 1000'
--          when 'EUROPRIS_NO' then 'Europris'
--          else initcap(replace(regexp_replace(upper(store_name), '_NO$', ''), '_', ' '))
--        end
--  where store_name is not null
--    and (store_name like '%\_%' or store_name ~ '_NO$');
--
-- ---------------------------------------------------------------------------
-- (Valgfritt) Eksempeldata fra seed-migrasjonen, hvis appen er i drift og
-- demo-tilbudene ikke lenger skal vises.
-- ---------------------------------------------------------------------------
-- delete from public.offers where is_sample;
--
-- ===========================================================================
-- SLUTT. Ingenting over denne linjen endrer data så lenge kommentartegnene
-- står. Etter opprydding: kjør spørring A på nytt og se at tallene er 0.
-- ===========================================================================
