-- Row Level Security.
-- Alt husholdningsdata filtreres på household_id via medlemsoppslag.
--
-- Viktig: medlemssjekken ligger i en SECURITY DEFINER-funksjon. Uten det ville
-- en policy på members som selv spør members gi uendelig rekursjon (Postgres
-- feiler med «infinite recursion detected in policy»).

create or replace function public.is_household_member(hid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.members m
    where m.household_id = hid and m.user_id = auth.uid()
  );
$$;
revoke all on function public.is_household_member(uuid) from public;
grant execute on function public.is_household_member(uuid) to authenticated;

-- Husholdningen den innloggede brukeren tilhører (appen har én per bruker).
create or replace function public.my_household_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select m.household_id from public.members m
  where m.user_id = auth.uid()
  order by m.created_at
  limit 1;
$$;
revoke all on function public.my_household_id() from public;
grant execute on function public.my_household_id() to authenticated;

-- ---------------------------------------------------------------------------
-- Slå på RLS overalt
-- ---------------------------------------------------------------------------
alter table public.households        enable row level security;
alter table public.members           enable row level security;
alter table public.shopping_items    enable row level security;
alter table public.picked_order      enable row level security;
alter table public.kassal_matches    enable row level security;
alter table public.custom_lists      enable row level security;
alter table public.saved_trips       enable row level security;
alter table public.meals             enable row level security;
alter table public.meal_plan         enable row level security;
alter table public.rules             enable row level security;
alter table public.import_queue      enable row level security;
alter table public.offers            enable row level security;
alter table public.price_observations enable row level security;
alter table public.stores            enable row level security;
alter table public.item_catalog      enable row level security;
alter table public.norm_rules        enable row level security;
alter table public.meal_library      enable row level security;
alter table public.meal_patterns     enable row level security;

-- ---------------------------------------------------------------------------
-- Husholdning og medlemmer
-- ---------------------------------------------------------------------------
drop policy if exists households_select on public.households;
create policy households_select on public.households
  for select to authenticated
  using (public.is_household_member(id));

drop policy if exists households_update on public.households;
create policy households_update on public.households
  for update to authenticated
  using (public.is_household_member(id))
  with check (public.is_household_member(id));

-- Ingen INSERT-policy på households med vilje.
-- Husholdninger opprettes utelukkende av bootstrap_household(), som er
-- SECURITY DEFINER. Da kan ingen klient lage løse husholdninger på egen hånd.

-- Egen medlemsrad: alltid synlig. Andres: kun i samme husholdning.
drop policy if exists members_select on public.members;
create policy members_select on public.members
  for select to authenticated
  using (user_id = auth.uid() or public.is_household_member(household_id));

-- Ingen INSERT-policy på members med vilje.
--
-- Medlemskap opprettes kun av bootstrap_household() og accept_invite(), som
-- begge er SECURITY DEFINER og validerer invitasjonskoden først.
--
-- Et tidligere forsøk her tillot selv-innmelding i en husholdning «uten
-- medlemmer», med sjekken «not exists (select 1 from members ...)». Den var
-- utrygg: underspørringen kjører selv under RLS, så en utenforstående så
-- alltid null medlemmer og fikk dermed alltid meldt seg inn. Undersøkelser
-- av egen tabell inne i en policy må gå via SECURITY DEFINER — eller, som
-- her, ikke finnes i det hele tatt.
drop policy if exists members_insert on public.members;

drop policy if exists members_update on public.members;
create policy members_update on public.members
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists members_delete on public.members;
create policy members_delete on public.members
  for delete to authenticated
  using (user_id = auth.uid() or public.is_household_member(household_id));

-- ---------------------------------------------------------------------------
-- Husholdningstabeller: full tilgang for medlemmer, ingenting for andre.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'shopping_items','picked_order','kassal_matches','custom_lists',
    'saved_trips','meals','meal_plan','rules','import_queue'
  ] loop
    execute format('drop policy if exists %1$s_member_all on public.%1$s;', t);
    execute format($f$
      create policy %1$s_member_all on public.%1$s
        for all to authenticated
        using (public.is_household_member(household_id))
        with check (public.is_household_member(household_id));
    $f$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Referansedata: lesbart for alle innloggede, skrives kun av service_role
-- (seed-migrasjoner og bakgrunnsjobber).
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['stores','item_catalog','norm_rules','meal_library','meal_patterns'] loop
    execute format('drop policy if exists %1$s_read on public.%1$s;', t);
    execute format($f$
      create policy %1$s_read on public.%1$s
        for select to authenticated using (true);
    $f$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Tilbud: felles tilbud leses av alle; manuelt importerte tilbud er private
-- for husholdningen som la dem inn.
-- ---------------------------------------------------------------------------
drop policy if exists offers_read on public.offers;
create policy offers_read on public.offers
  for select to authenticated
  using (household_id is null or public.is_household_member(household_id));

drop policy if exists offers_manual_write on public.offers;
create policy offers_manual_write on public.offers
  for all to authenticated
  using (household_id is not null and public.is_household_member(household_id))
  with check (household_id is not null and public.is_household_member(household_id));

-- ---------------------------------------------------------------------------
-- Prisobservasjoner: anonymt fellesgode. Alle innloggede kan lese og bidra,
-- men ingen kan endre eller slette andres observasjoner (append-only).
-- Radene inneholder bevisst ingen household_id eller user_id.
-- ---------------------------------------------------------------------------
drop policy if exists price_obs_read on public.price_observations;
create policy price_obs_read on public.price_observations
  for select to authenticated using (true);

drop policy if exists price_obs_insert on public.price_observations;
create policy price_obs_insert on public.price_observations
  for insert to authenticated with check (true);

