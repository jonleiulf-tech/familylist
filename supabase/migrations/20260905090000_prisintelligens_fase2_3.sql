-- Prisintelligens, fase 2 (læring) og fase 3 (handlekurven) — basen.
--
-- Plan: docs/prisintelligens-plan.md. Kjøres trygt flere ganger.
--
-- Fase 2 legger tallene læringen trenger på item_catalog. De REGNES av
-- nattjobben learn-prices fra price_observations (felles, anonym); det
-- husholdningsspesifikke (kjøpsfrekvens, butikkpreferanse) regnes i
-- klienten fra household_purchases, som RLS alt beskytter — ingen ny
-- tabell trengs for det.
--
-- Fase 3 legger husholdningens handleinnstillinger på households: hvor
-- mange ekstra butikker de gidder, og hva en ekstra butikk minst må spare.

-- ---------------------------------------------------------------------
-- Fase 2 · God pris, utmerket pris, trend (§8–9)
-- ---------------------------------------------------------------------
alter table public.item_catalog
  add column if not exists recent_avg_price          numeric(10,2),
  add column if not exists good_price_threshold      numeric(10,2),
  add column if not exists excellent_price_threshold numeric(10,2),
  add column if not exists price_trend               text,
  add column if not exists price_trend_pct           numeric(6,1);

alter table public.item_catalog drop constraint if exists item_catalog_price_trend_check;
alter table public.item_catalog add constraint item_catalog_price_trend_check
  check (price_trend is null or price_trend in ('falling','stable','rising','unknown'));

comment on column public.item_catalog.good_price_threshold is
  'Under denne er et tilbud «God pris» — regnet av learn-prices fra egne observasjoner, ikke fra førpriser.';
comment on column public.item_catalog.excellent_price_threshold is
  'Under denne er et tilbud «Svært god pris».';

-- ---------------------------------------------------------------------
-- Fase 3 · Husholdningens handleinnstillinger (§14)
-- ---------------------------------------------------------------------
-- En ekstra butikk koster noe selv uten gebyr: kjøring, tid, parkering.
-- Standard: én ekstra butikk, og den må spare minst 60 kr og 5 %.
alter table public.households
  add column if not exists max_extra_stores          smallint not null default 1,
  add column if not exists min_saving_extra_store    numeric(8,2) not null default 60,
  add column if not exists min_saving_pct            numeric(5,2) not null default 5,
  add column if not exists convenience_weight        numeric(4,2) not null default 1.0;

alter table public.households drop constraint if exists households_shopping_settings_sane;
alter table public.households add constraint households_shopping_settings_sane check (
  max_extra_stores between 0 and 3
  and min_saving_extra_store between 0 and 5000
  and min_saving_pct between 0 and 100
  and convenience_weight between 0 and 5
);

-- ---------------------------------------------------------------------
-- Fase 3 · Siste kjente pris per vare og kjede, for MANGE varer i ett kall
-- ---------------------------------------------------------------------
-- Optimalisereren trenger «hva koster hver av disse 30 varene i hver
-- kjede» — 30 kall til price_history ville vært for tregt. Én rad per
-- (vare, kjede): den nyeste observasjonen, med antall bak seg. Bare de
-- varene som spørres om, høyst 300 rader, bare for innloggede.
create or replace function public.price_snapshot(p_items text[], p_days int default 60)
returns table (
  item_name text, store_code text, price numeric, unit_price numeric, unit text,
  observed_at timestamptz, source text, confidence numeric, is_offer boolean, n bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with wanted as (
    select distinct left(trim(x), 120) as item_name
    from unnest(coalesce(p_items, '{}'::text[])) as x
    where coalesce(trim(x), '') <> ''
    limit 100
  ),
  rows as (
    select o.item_name, o.store_code, o.price, o.unit_price, o.unit, o.observed_at, o.source, o.confidence,
           o.is_offer,
           count(*) over (partition by o.item_name, o.store_code) as n,
           row_number() over (partition by o.item_name, o.store_code order by o.observed_at desc) as rn
    from public.price_observations o
    join wanted w on w.item_name = o.item_name
    where auth.uid() is not null
      and o.store_code is not null
      and o.observed_at >= now() - make_interval(days => least(greatest(coalesce(p_days, 60), 1), 400))
  )
  select item_name, store_code, price, unit_price, unit, observed_at, source, confidence, is_offer, n
  from rows where rn = 1
  order by item_name, store_code
  limit 300;
$$;
revoke all on function public.price_snapshot(text[], int) from public;
grant execute on function public.price_snapshot(text[], int) to authenticated;
