-- Brukerforslag til fellesdatabasen.
--
-- Når noen legger til en vare som ikke finnes i item_catalog (f.eks.
-- «Sjokolademelk»), havner den på deres egen handleliste uansett — men de
-- kan samtidig foreslå den til fellesdatabasen, med eget prisestimat.
-- Forslag publiseres ALDRI direkte: administratoren godkjenner eller
-- avviser i adminpanelet, og først ved godkjenning legges varen inn i
-- item_catalog for alle.

create table if not exists public.catalog_suggestions (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid references public.households(id) on delete set null,
  suggested_by   uuid references auth.users(id) on delete set null,

  name           text not null check (char_length(name) between 2 and 80),
  category       text,                    -- hovedkategori valgt av brukeren
  price_estimate numeric(10, 2) check (price_estimate is null or (price_estimate > 0 and price_estimate < 10000)),
  store          text,

  status         text not null default 'ny' check (status in ('ny', 'godkjent', 'avvist')),
  resolution     text,
  resolved_at    timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists catalog_suggestions_status_idx on public.catalog_suggestions(status) where status = 'ny';

alter table public.catalog_suggestions enable row level security;

-- Medlemmer foreslår og ser sin egen delte listes forslag.
-- Status endres kun av admin-funksjonen (service_role).
drop policy if exists catalog_suggestions_insert on public.catalog_suggestions;
create policy catalog_suggestions_insert on public.catalog_suggestions
  for insert to authenticated
  with check (suggested_by = auth.uid() and public.is_household_member(household_id));

drop policy if exists catalog_suggestions_select on public.catalog_suggestions;
create policy catalog_suggestions_select on public.catalog_suggestions
  for select to authenticated
  using (public.is_household_member(household_id));
