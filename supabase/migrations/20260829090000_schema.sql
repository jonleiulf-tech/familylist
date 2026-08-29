-- FamilyList — grunnskjema.
-- Én husholdning, to voksne brukere. Alt husholdningsdata filtreres på household_id.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Husholdning og medlemmer
-- ---------------------------------------------------------------------------
create table if not exists public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  adults      smallint not null default 2,
  children    smallint not null default 2,
  default_store text not null default 'Coop Extra',
  created_at  timestamptz not null default now()
);

create table if not exists public.members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  initials     text generated always as (upper(substring(display_name from 1 for 2))) stored,
  created_at   timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index if not exists members_user_idx on public.members(user_id);

-- ---------------------------------------------------------------------------
-- Butikker (referansedata, felles for alle)
-- ---------------------------------------------------------------------------
create table if not exists public.stores (
  code       text primary key,          -- COOP_EXTRA, KIWI, REMA_1000, MENY_NO, ...
  name       text not null,             -- visningsnavn brukt i UI: «Coop Extra»
  store_type text,
  is_default boolean not null default false,
  sort_order smallint not null default 100
);

-- ---------------------------------------------------------------------------
-- Varedatabase (seed fra fl-data.js ITEMS — 465 varer fra 51 kvitteringer)
-- Felles referansedata: samme varekatalog for alle husholdninger.
-- ---------------------------------------------------------------------------
create table if not exists public.item_catalog (
  id            bigserial primary key,
  name          text not null unique,     -- "n"
  name_en       text,                     -- "en"
  category      text,                     -- "cat" (finkategori)
  major_category text,                    -- avledet hovedkategori (ORDER-listen)
  is_food       boolean not null default true,
  line_count    integer not null default 0,  -- "ln" antall kvitteringslinjer
  receipt_count integer not null default 0,  -- "rc" antall kvitteringer
  avg_price     numeric(10,2),               -- "p"
  price_low     numeric(10,2),               -- "plo"
  price_high    numeric(10,2),               -- "phi"
  frequency_sig text,                        -- "sig": Ofte | Svært ofte | ''
  primary_store text,                        -- "prim"
  store_dist    text,                        -- "dist" rå fordelingstekst
  score         integer not null default 0,  -- "score" kjøpsfrekvens-score
  brand         text                         -- "b"
);
create index if not exists item_catalog_score_idx on public.item_catalog(score desc);
create index if not exists item_catalog_name_lower_idx on public.item_catalog(lower(name));

-- Normaliseringsregler (seed fra fl-data.js NORM — 134 regler)
create table if not exists public.norm_rules (
  id       bigserial primary key,
  from_text text not null unique,
  to_text   text not null
);
create index if not exists norm_rules_from_lower_idx on public.norm_rules(lower(from_text));

-- Middagsbibliotek (seed fra meals-library.js — 30 middager, mengder for 2+2)
create table if not exists public.meal_library (
  id          bigserial primary key,
  name        text not null unique,
  category    text,
  ingredients jsonb not null default '[]'::jsonb   -- [{n, qty}]
);

-- Middagsmønstre fra kvitteringsanalysen (fl-data.js DINNER_PATTERNS)
create table if not exists public.meal_patterns (
  id          bigserial primary key,
  name        text not null unique,
  ingredients jsonb not null default '[]'::jsonb,
  hits        integer not null default 0,
  rule_text   text
);

-- ---------------------------------------------------------------------------
-- Handleliste
-- ---------------------------------------------------------------------------
create table if not exists public.shopping_items (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references public.households(id) on delete cascade,
  name              text not null,
  qty               numeric(10,2) not null default 1,
  unit              text not null default 'stk',
  pack_size         numeric(10,2),          -- mengden varen ble lagt til med = 1 pakke
  variant           text,                   -- f.eks. «4×1,5 l»
  category          text,
  store             text,
  price             numeric(10,2),
  price_source      text check (price_source in ('kassalapp','receipt','manual','estimate')),
  kassal_product_id bigint,
  ean               text,
  brand             text,
  kassal_name       text,
  is_offer          boolean not null default false,
  checked           boolean not null default false,
  checked_at        timestamptz,
  checked_by        uuid references auth.users(id) on delete set null,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists shopping_items_household_idx on public.shopping_items(household_id);

-- Lært plukk-rekkefølge per butikk og kategori (75/25-vekting gjøres i appen)
create table if not exists public.picked_order (
  household_id uuid not null references public.households(id) on delete cascade,
  store        text not null,
  category     text not null,
  position     numeric(6,4) not null,       -- 0..1
  trips        integer not null default 1,
  updated_at   timestamptz not null default now(),
  primary key (household_id, store, category)
);

-- Kobling varenavn -> valgt Kassalapp-produkt (gjenbrukes neste gang)
create table if not exists public.kassal_matches (
  household_id      uuid not null references public.households(id) on delete cascade,
  item_name         text not null,
  kassal_product_id bigint not null,
  ean               text,
  name              text,
  brand             text,
  store             text,
  price             numeric(10,2),
  unit_price        numeric(10,2),
  weight            numeric(10,2),
  weight_unit       text,
  url               text,
  updated_at        timestamptz not null default now(),
  primary key (household_id, item_name)
);

-- Egne lister (pakking, sport, verktøy) — kobles IKKE mot varedatabasen
create table if not exists public.custom_lists (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name         text not null,
  type         text,
  shared       boolean not null default true,
  items        jsonb not null default '[]'::jsonb,   -- [{n, chk}]
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists custom_lists_household_idx on public.custom_lists(household_id);

-- Lagrede handleturer
create table if not exists public.saved_trips (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name         text not null,
  trip_date    date not null default current_date,
  items        jsonb not null default '[]'::jsonb,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists saved_trips_household_idx on public.saved_trips(household_id);

-- ---------------------------------------------------------------------------
-- Middag
-- ---------------------------------------------------------------------------
create table if not exists public.meals (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name         text not null,
  category     text,
  ingredients  jsonb not null default '[]'::jsonb,   -- [{n, qty}] familieoppskrift
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (household_id, name)
);

create table if not exists public.meal_plan (
  household_id uuid not null references public.households(id) on delete cascade,
  plan_date    date not null,
  meal_id      uuid references public.meals(id) on delete set null,
  meal_name    text,          -- beholdes hvis middagen slettes
  reason       text,          -- «begrunnelse» vist på dagskortet
  done         boolean not null default false,
  locked       boolean not null default false,
  skipped      boolean not null default false,
  updated_at   timestamptz not null default now(),
  primary key (household_id, plan_date)
);

create table if not exists public.rules (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  scope        text not null,                  -- ingrediens/kategori regelen gjelder
  rule_type    text not null default 'min',    -- min | max | weekday
  amount       numeric(6,2) not null default 1,
  weekdays     smallint[] not null default '{}',  -- 0=søndag .. 6=lørdag
  enabled      boolean not null default true,
  created_at   timestamptz not null default now()
);
create index if not exists rules_household_idx on public.rules(household_id);

-- ---------------------------------------------------------------------------
-- Priser og tilbud
-- ---------------------------------------------------------------------------
-- Anonymiserte prisobservasjoner — delt på tvers av husholdninger (crowdsourcing).
create table if not exists public.price_observations (
  id                uuid primary key default gen_random_uuid(),
  item_name         text not null,
  kassal_product_id bigint,
  ean               text,
  store_code        text,
  price             numeric(10,2) not null,
  unit_price        numeric(10,2),
  unit_price_unit   text,
  observed_at       timestamptz not null default now(),
  source            text not null check (source in ('kassalapp','receipt','manual','estimate','offer')),
  confidence        numeric(3,2) not null default 1.0
);
create index if not exists price_obs_name_idx on public.price_observations(lower(item_name), observed_at desc);
create index if not exists price_obs_ean_idx on public.price_observations(ean);

-- Tilbud — felles referansedata, fylles av weeklyOfferScan()
create table if not exists public.offers (
  id                  uuid primary key default gen_random_uuid(),
  store_code          text,
  store_name          text,
  product_name        text not null,
  normalized_name     text,
  brand               text,
  category            text,
  match_name          text,             -- varenavn i katalogen tilbudet matcher
  price               numeric(10,2) not null,
  original_price      numeric(10,2),
  discount_percentage numeric(5,2)
    generated always as (
      case when original_price is not null and original_price > 0
           then round(((original_price - price) / original_price) * 100, 2)
      end
    ) stored,
  unit                text,
  unit_price          numeric(10,2),
  valid_from          date,
  valid_to            date,
  source              text,
  source_type         text default 'manual_import'
    check (source_type in ('api','html_page','customer_flyer','manual_import','rss','partner_feed')),
  source_url          text,
  household_id        uuid references public.households(id) on delete cascade, -- kun for manuell import
  created_at          timestamptz not null default now()
);
create index if not exists offers_valid_to_idx on public.offers(valid_to);

-- Vaskeliste for usikre importlinjer (Google Keep m.m.)
create table if not exists public.import_queue (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  raw_text     text not null,
  suggestion   text,
  status       text not null default 'pending' check (status in ('pending','accepted','dropped')),
  created_at   timestamptz not null default now()
);
create index if not exists import_queue_household_idx on public.import_queue(household_id);

-- ---------------------------------------------------------------------------
-- updated_at-trigger
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'shopping_items','custom_lists','meals','meal_plan','picked_order','kassal_matches'
  ] loop
    execute format(
      'drop trigger if exists touch_%1$s on public.%1$s;
       create trigger touch_%1$s before update on public.%1$s
       for each row execute function public.touch_updated_at();', t);
  end loop;
end $$;
