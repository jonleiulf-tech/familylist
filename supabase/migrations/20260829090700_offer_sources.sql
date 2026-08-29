-- Tilbudskilder og kjørelogg for weeklyOfferScan().

create table if not exists public.offer_sources (
  id              bigserial primary key,
  name            text not null unique,
  source_type     text not null default 'api'
    check (source_type in ('api','html_page','customer_flyer','manual_import','rss','partner_feed')),
  dealer_id       text,                -- Tjek/eTilbudsavis business-id
  store_code      text,
  enabled         boolean not null default true,
  fetch_frequency text not null default 'weekly',
  last_fetched_at timestamptz,
  notes           text
);

-- Én kilde feiler ikke jobben; alt logges her så man ser hva som gikk galt.
create table if not exists public.offer_fetch_logs (
  id            bigserial primary key,
  source_id     bigint references public.offer_sources(id) on delete set null,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  status        text not null default 'running'
    check (status in ('running','ok','failed','skipped')),
  offers_found  integer not null default 0,
  offers_saved  integer not null default 0,
  error_message text
);
create index if not exists offer_fetch_logs_started_idx on public.offer_fetch_logs(started_at desc);

alter table public.offer_sources     enable row level security;
alter table public.offer_fetch_logs  enable row level security;

-- Lesbart for innloggede; skrives kun av bakgrunnsjobben (service_role,
-- som går utenom RLS).
drop policy if exists offer_sources_read on public.offer_sources;
create policy offer_sources_read on public.offer_sources
  for select to authenticated using (true);

drop policy if exists offer_fetch_logs_read on public.offer_fetch_logs;
create policy offer_fetch_logs_read on public.offer_fetch_logs
  for select to authenticated using (true);

-- Joker er den kilden handoff-en peker ut som neste steg.
insert into public.offer_sources (name, source_type, dealer_id, store_code, notes)
values (
  'eTilbudsavis – Joker',
  'api',
  'b3e8Fm',
  'JOKER',
  'Tjek/ShopGun squid-api. Krever TJEK_API_KEY som secret.'
)
on conflict (name) do nothing;
