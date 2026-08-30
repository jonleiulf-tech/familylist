-- Ukemaler + kalenderabonnement for middagsplanen.
--
-- 1) meal_week_templates: en komplett uke («Hvit uke», «Vegansk uke»)
--    lagres med navn som [{offset, meal_name}] og kan settes inn igjen
--    fra en valgfri dato — planlegg én gang, gjenbruk for alltid.
--
-- 2) households.calendar_token: hemmelig nøkkel for kalender-feeden
--    (calendar-feed-funksjonen). Google/Apple-kalendere abonnerer på en
--    URL med denne — lenken er umulig å gjette, og kan byttes ved behov.

create table if not exists public.meal_week_templates (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 60),
  days         jsonb not null default '[]'::jsonb,   -- [{offset, meal_name}]
  created_at   timestamptz not null default now(),
  unique (household_id, name)
);

alter table public.meal_week_templates enable row level security;

drop policy if exists week_templates_all on public.meal_week_templates;
create policy week_templates_all on public.meal_week_templates
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

alter table public.households
  add column if not exists calendar_token uuid not null default gen_random_uuid();

create unique index if not exists households_calendar_token_idx
  on public.households(calendar_token);
