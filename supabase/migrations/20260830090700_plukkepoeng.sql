-- Plukkepoeng — belønning for å bidra til fellesskapet.
--
-- Poeng tildeles KUN av databasen selv (triggere) når bidraget faktisk er
-- godkjent/brukt — aldri fra klienten, så de kan ikke jukses til. Hver
-- hendelse kan bare gi poeng én gang (unik på kind+ref). Poengene er i
-- første omgang en synlig påskjønnelse; innløsning (gratis bruk, partner-
-- fordeler) kommer senere og loven om det avgjøres av administratoren.
--
-- Satser (kind → poeng):
--   vare_godkjent       25   ny vare foreslått og godkjent til fellesdatabasen
--   invitasjon_brukt    50   noen ble med via din invitasjon
--   feil_fikset         10   meldt varefeil som ble rettet
--   tilbakemelding_løst  5   feilrapport om appen som ble løst

create table if not exists public.point_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('vare_godkjent', 'invitasjon_brukt', 'feil_fikset', 'tilbakemelding_løst', 'bonus')),
  points     integer not null check (points between 1 and 1000),
  ref        text not null,             -- id-en til bidraget som utløste poengene
  note       text,
  created_at timestamptz not null default now(),
  unique (user_id, kind, ref)
);

create index if not exists point_events_user_idx on public.point_events(user_id);

alter table public.point_events enable row level security;

-- Egne poeng kan leses; ingenting kan skrives fra klienten.
drop policy if exists point_events_select on public.point_events;
create policy point_events_select on public.point_events
  for select to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Tildeling: triggere på bidragstabellene. security definer, så de virker
-- uansett hvem (service_role/admin-funksjonen) som endret statusen.
-- ---------------------------------------------------------------------------
create or replace function public.award_points(p_user uuid, p_kind text, p_points int, p_ref text, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user is null then return; end if;
  insert into public.point_events (user_id, kind, points, ref, note)
  values (p_user, p_kind, p_points, p_ref, p_note)
  on conflict (user_id, kind, ref) do nothing;
end;
$$;

create or replace function public.points_on_suggestion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'godkjent' and old.status is distinct from 'godkjent' then
    perform public.award_points(new.suggested_by, 'vare_godkjent', 25, new.id::text,
      'Ny vare i fellesdatabasen: ' || new.name);
  end if;
  return new;
end; $$;
drop trigger if exists points_suggestion on public.catalog_suggestions;
create trigger points_suggestion after update on public.catalog_suggestions
  for each row execute function public.points_on_suggestion();

create or replace function public.points_on_invite()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.used_at is not null and old.used_at is null and new.used_by is distinct from new.created_by then
    perform public.award_points(new.created_by, 'invitasjon_brukt', 50, new.id::text,
      'Noen ble med via invitasjonen din');
  end if;
  return new;
end; $$;
drop trigger if exists points_invite on public.household_invites;
create trigger points_invite after update on public.household_invites
  for each row execute function public.points_on_invite();

create or replace function public.points_on_item_report()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'fikset' and old.status is distinct from 'fikset' then
    perform public.award_points(new.reported_by, 'feil_fikset', 10, new.id::text,
      'Varefeil rettet: ' || new.item_name);
  end if;
  return new;
end; $$;
drop trigger if exists points_item_report on public.item_reports;
create trigger points_item_report after update on public.item_reports
  for each row execute function public.points_on_item_report();

create or replace function public.points_on_feedback()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'løst' and old.status is distinct from 'løst' then
    perform public.award_points(new.user_id, 'tilbakemelding_løst', 5, new.id::text,
      'Feilrapport løst');
  end if;
  return new;
end; $$;
drop trigger if exists points_feedback on public.app_feedback;
create trigger points_feedback after update on public.app_feedback
  for each row execute function public.points_on_feedback();
