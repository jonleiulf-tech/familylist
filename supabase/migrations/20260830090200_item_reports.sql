-- «Meld feil» på matvarer.
--
-- Kryptiske kvitteringsnavn («Coop Ha.Tom.Urt.390G»), feil pris eller feil
-- kategori kan meldes rett fra redigeringsdialogen. Meldingene samles her og
-- gjennomgås hver natt av Edge-funksjonen review-item-reports, som først
-- prøver deterministiske fikser (navneregler, priser) og deretter — når
-- ANTHROPIC_API_KEY er satt — lar Claude vurdere resten. Alt som gjøres
-- skrives tilbake i resolution, så gjennomgangen kan etterprøves.

create table if not exists public.item_reports (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  reported_by   uuid references auth.users(id) on delete set null,

  item_name     text not null,            -- navnet slik det sto i appen
  catalog_id    bigint references public.item_catalog(id) on delete set null,

  report_type   text not null check (report_type in ('navn', 'pris', 'kategori', 'duplikat', 'annet')),
  suggestion    text,                     -- brukerens forslag («Hakkede tomater med urter», «24,90» …)
  comment       text,

  status        text not null default 'ny'
                check (status in ('ny', 'fikset', 'avvist', 'trenger_menneske')),
  resolution    text,                     -- hva nattgjennomgangen gjorde og hvorfor
  resolved_at   timestamptz,

  created_at    timestamptz not null default now()
);

create index if not exists item_reports_status_idx on public.item_reports(status) where status = 'ny';
create index if not exists item_reports_household_idx on public.item_reports(household_id);

alter table public.item_reports enable row level security;

-- Medlemmer ser og melder feil for sin egen delte liste. Oppdatering og
-- sletting er forbeholdt service_role (nattgjennomgangen) — en bruker kan
-- ikke overstyre status på andres meldinger.
drop policy if exists item_reports_select on public.item_reports;
create policy item_reports_select on public.item_reports
  for select to authenticated
  using (public.is_household_member(household_id));

drop policy if exists item_reports_insert on public.item_reports;
create policy item_reports_insert on public.item_reports
  for insert to authenticated
  with check (public.is_household_member(household_id) and reported_by = auth.uid());

-- Nattgjennomgangen kjøres slik (Supabase SQL editor, én gang):
--   select cron.schedule(
--     'review-item-reports', '30 3 * * *',
--     $$ select net.http_post(
--          url := 'https://<ref>.supabase.co/functions/v1/review-item-reports',
--          headers := '{"Authorization":"Bearer <service_role_key>"}'::jsonb
--        ) $$);
