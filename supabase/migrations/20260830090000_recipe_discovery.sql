-- Oppskriftsoppdaging, fase 1: kilderegister, kapabiliteter og kandidater.
--
-- Grunnprinsipp: ExternalRecipeCandidates er LETT oppdagelsesdata (tittel,
-- URL, kategorier, tid, porsjoner) — vi indekserer tusenvis av muligheter
-- uten å lagre tusenvis av opphavsrettsbeskyttede fulltekster. Full
-- oppskrift hentes kun for lovende kandidater, der kilden tillater det.

create table if not exists public.recipe_sources (
  id                     text primary key,          -- slug: 'tine', 'rema', ...
  name                   text not null,
  base_url               text not null,
  country                text not null default 'NO',
  language               text not null default 'nb',
  priority               smallint not null default 40,
  integration_modes      text[] not null default '{}',
  enabled                boolean not null default false,
  can_discover           boolean not null default false,
  can_fetch_recipe       boolean not null default false,
  can_store_metadata     boolean not null default true,
  can_store_ingredients  boolean not null default false,
  can_store_instructions boolean not null default false,
  can_store_images       boolean not null default false,
  requires_attribution   boolean not null default true,
  terms_status           text not null default 'unreviewed',
  robots_status          text not null default 'unknown',
  sample_urls            text[] not null default '{}',
  notes                  text,
  last_audited_at        timestamptz
);

-- Resultatet av auditRecipeSource() — hva kilden faktisk tilbyr teknisk.
create table if not exists public.recipe_source_capabilities (
  source_id              text primary key references public.recipe_sources(id) on delete cascade,
  audited_at             timestamptz not null default now(),
  robots                 jsonb,             -- {fetched, disallows[], crawl_delay}
  sitemap_urls           text[] not null default '{}',
  rss_urls               text[] not null default '{}',
  discovery_works        boolean,
  detail_works           boolean,
  jsonld_recipe          boolean,
  servings_available     boolean,
  ingredients_available  boolean,
  quantities_available   boolean,
  time_available         boolean,
  categories_available   boolean,
  images_available       boolean,
  api_available          boolean,
  recommended_mode       text,
  errors                 jsonb,
  report                 jsonb              -- hele råresultatet fra revisjonen
);

create table if not exists public.external_recipe_candidates (
  id                   uuid primary key default gen_random_uuid(),
  source_id            text not null references public.recipe_sources(id) on delete cascade,
  external_id          text,
  title                text not null,
  title_no             text,               -- oversatt tittel for int. kilder
  source_url           text not null,
  image_url            text,               -- kildens URL — vi kopierer ikke bilder
  category_raw         text[] not null default '{}',
  canonical_categories text[] not null default '{}',
  cuisine              text,
  total_minutes        integer,
  servings             numeric(4,1),
  servings_min         numeric(4,1),
  servings_max         numeric(4,1),
  relevance_score      numeric(6,2),
  data_quality_score   numeric(4,3),
  discovered_at        timestamptz not null default now(),
  last_seen_at         timestamptz not null default now(),
  full_recipe_loaded   boolean not null default false,
  payload              jsonb,              -- normalisert lettvekt, aldri fulltekst
  unique (source_id, source_url)
);
create index if not exists erc_source_idx on public.external_recipe_candidates(source_id);
create index if not exists erc_relevance_idx on public.external_recipe_candidates(relevance_score desc nulls last);

-- RLS: felles referansedata. Lesbart for innloggede; skrives av
-- bakgrunnsjobber og revisjonsskript (service_role går utenom RLS).
alter table public.recipe_sources              enable row level security;
alter table public.recipe_source_capabilities  enable row level security;
alter table public.external_recipe_candidates  enable row level security;

drop policy if exists recipe_sources_read on public.recipe_sources;
create policy recipe_sources_read on public.recipe_sources
  for select to authenticated using (true);

drop policy if exists recipe_caps_read on public.recipe_source_capabilities;
create policy recipe_caps_read on public.recipe_source_capabilities
  for select to authenticated using (true);

drop policy if exists erc_read on public.external_recipe_candidates;
create policy erc_read on public.external_recipe_candidates
  for select to authenticated using (true);
