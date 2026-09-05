-- ============================================================
-- psiusn.no: Spond-synk. VALGFRITT, og kjøres etter schema-v2.sql.
-- Lim hele fila inn i Supabase → SQL Editor → Run. Trygg å kjøre flere ganger.
--
-- Legger til:
--   events.source / external_id   hvor raden kom fra (manual eller spond)
--   events.hidden_by_admin        styret kan skjule en Spond-post uten at
--                                 neste synk overstyrer dem
--   sync_runs                     siste kjøring, vises i /admin
--
-- Selve jobben ligger i psi/scripts/spond_sync.py og kjøres av
-- .github/workflows/psi-spond-sync.yml. Den bruker service_role-nøkkelen,
-- som aldri skal ligge i frontend eller i Vercel.
-- ============================================================

alter table public.events add column if not exists source      text not null default 'manual';
alter table public.events add column if not exists external_id text;
alter table public.events add column if not exists hidden_by_admin boolean not null default false;

-- Én rad per Spond-arrangement, så synken kan oppdatere i stedet for å duplisere.
create unique index if not exists events_external_id on public.events (external_id) where external_id is not null;
create index if not exists events_source on public.events (source);

create table if not exists public.sync_runs (
  id         uuid primary key default gen_random_uuid(),
  source     text not null default 'spond',
  status     text not null check (status in ('ok', 'error', 'skipped')),
  message    text,
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists sync_runs_latest on public.sync_runs (source, created_at desc);

alter table public.sync_runs enable row level security;
drop policy if exists sync_runs_read on public.sync_runs;
-- Innloggede ser status. Jobben skriver med service_role, som går utenom RLS.
create policy sync_runs_read on public.sync_runs for select to authenticated using (true);

-- Skjulte Spond-poster forsvinner fra nettsiden, men blir stående i /admin.
drop policy if exists events_read on public.events;
create policy events_read on public.events for select to anon, authenticated
  using ((status <> 'draft' and not hidden_by_admin)
         or public.can_manage_sport(sport_slug)
         or (sport_slug is null and public.is_admin()));

-- Rydd bort gamle kjøringslogger, så tabellen ikke vokser i det uendelige.
create or replace function public.trim_sync_runs()
returns trigger language plpgsql as $$
begin
  delete from public.sync_runs
  where source = new.source
    and created_at < now() - interval '30 days';
  return null;
end;
$$;
drop trigger if exists sync_runs_trim on public.sync_runs;
create trigger sync_runs_trim after insert on public.sync_runs
  for each statement execute function public.trim_sync_runs();
