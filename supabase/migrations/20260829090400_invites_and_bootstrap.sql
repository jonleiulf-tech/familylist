-- Innlogging, husholdningsoppsett og invitasjon.
--
-- Modell:
--   * Hver bruker havner i SIN EGEN husholdning ved registrering.
--   * En invitasjonslenke (engangskode, gyldig 7 dager) flytter mottakeren
--     inn i invitererens husholdning.
--   * All husholdningsdata er isolert av RLS på household_id. Ingen data
--     lekker mellom husholdninger.

-- ---------------------------------------------------------------------------
-- Profil: visningsnavn pr. bruker, uavhengig av husholdning.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at   timestamptz not null default now()
);
alter table public.profiles enable row level security;

drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Medlemmer i samme husholdning skal kunne se hverandres navn.
drop policy if exists profiles_household_read on public.profiles;
create policy profiles_household_read on public.profiles
  for select to authenticated
  using (exists (
    select 1
    from public.members me
    join public.members them on them.household_id = me.household_id
    where me.user_id = auth.uid() and them.user_id = profiles.user_id
  ));

-- ---------------------------------------------------------------------------
-- Invitasjoner: engangskode med utløp.
-- ---------------------------------------------------------------------------
create table if not exists public.household_invites (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  code         text not null unique,
  created_by   uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  used_at      timestamptz,
  used_by      uuid references auth.users(id) on delete set null
);
create index if not exists household_invites_code_idx on public.household_invites(code);
alter table public.household_invites enable row level security;

-- Medlemmer kan se og tilbakekalle sine egne invitasjoner.
-- Mottakeren trenger IKKE lesetilgang: innløsning skjer i accept_invite(),
-- som kjører SECURITY DEFINER. Dermed kan ingen liste eller gjette koder.
drop policy if exists invites_member on public.household_invites;
create policy invites_member on public.household_invites
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- ---------------------------------------------------------------------------
-- bootstrap_household(): kalles ved første innlogging.
-- Oppretter husholdning, medlemskap, profil, og seeder husholdningens egne
-- middager fra det felles middagsbiblioteket.
-- ---------------------------------------------------------------------------
create or replace function public.bootstrap_household(display_name text, household_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  hid uuid;
  nm  text := coalesce(nullif(trim(display_name), ''), 'Meg');
begin
  if uid is null then
    raise exception 'Ikke innlogget.' using errcode = '28000';
  end if;

  -- Allerede medlem et sted? Da er vi ferdige — ingen ny husholdning.
  select m.household_id into hid from public.members m where m.user_id = uid limit 1;
  if hid is not null then
    insert into public.profiles (user_id, display_name) values (uid, nm)
      on conflict (user_id) do update set display_name = excluded.display_name;
    return hid;
  end if;

  insert into public.households (name)
  values (coalesce(nullif(trim(household_name), ''), nm || '-husholdningen'))
  returning id into hid;

  insert into public.members (household_id, user_id, display_name) values (hid, uid, nm);

  insert into public.profiles (user_id, display_name) values (uid, nm)
    on conflict (user_id) do update set display_name = excluded.display_name;

  -- Seed husholdningens egne middager fra det felles biblioteket
  -- (meals-library.js). Kopieres pr. husholdning fordi mengdene redigeres
  -- til familieoppskrifter og da må være private.
  insert into public.meals (household_id, name, category, ingredients)
  select hid, l.name, l.category, l.ingredients from public.meal_library l
  on conflict (household_id, name) do nothing;

  -- Et par fornuftige startregler, i tråd med middagsmønstrene.
  insert into public.rules (household_id, scope, rule_type, amount, weekdays, enabled)
  values (hid, 'Fisk', 'min', 2, '{}', true),
         (hid, 'Taco', 'weekday', 1, '{5}', true);

  return hid;
end;
$$;
revoke all on function public.bootstrap_household(text, text) from public;
grant execute on function public.bootstrap_household(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- create_invite(): lager engangskode gyldig i 7 dager.
-- ---------------------------------------------------------------------------
create or replace function public.create_invite()
returns table (code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  hid       uuid;
  new_code  text;
  new_expiry timestamptz;
begin
  hid := public.my_household_id();
  if hid is null then
    raise exception 'Du må ha en husholdning før du kan invitere.' using errcode = 'P0002';
  end if;

  -- 16 hex-tegn = 64 bit. Ikke praktisk mulig å gjette.
  new_code := encode(gen_random_bytes(8), 'hex');
  new_expiry := now() + interval '7 days';

  insert into public.household_invites (household_id, code, created_by, expires_at)
  values (hid, new_code, auth.uid(), new_expiry);

  return query select new_code, new_expiry;
end;
$$;
revoke all on function public.create_invite() from public;
grant execute on function public.create_invite() to authenticated;

-- ---------------------------------------------------------------------------
-- accept_invite(): løser inn koden og flytter brukeren inn i husholdningen.
--
-- SECURITY DEFINER fordi mottakeren verken kan lese household_invites eller
-- households før hen er medlem. Koden verifiseres her — den er engangsbruk
-- og utløper etter 7 dager.
-- ---------------------------------------------------------------------------
create or replace function public.accept_invite(code text, display_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  inv      public.household_invites%rowtype;
  old_hid  uuid;
  nm       text;
begin
  if uid is null then
    raise exception 'Ikke innlogget.' using errcode = '28000';
  end if;

  select * into inv from public.household_invites i
  where i.code = lower(trim(accept_invite.code))
  for update;

  if inv.id is null then
    raise exception 'Ugyldig invitasjonskode.' using errcode = 'P0002';
  end if;
  if inv.used_at is not null then
    raise exception 'Invitasjonen er allerede brukt.' using errcode = 'P0001';
  end if;
  if inv.expires_at < now() then
    raise exception 'Invitasjonen er utløpt.' using errcode = 'P0001';
  end if;

  -- Allerede medlem: marker som brukt og returner.
  if exists (select 1 from public.members m where m.household_id = inv.household_id and m.user_id = uid) then
    update public.household_invites set used_at = now(), used_by = uid where id = inv.id;
    return inv.household_id;
  end if;

  nm := coalesce(
    nullif(trim(accept_invite.display_name), ''),
    (select p.display_name from public.profiles p where p.user_id = uid),
    'Medlem'
  );

  -- Flytt brukeren ut av sin egen husholdning.
  select m.household_id into old_hid from public.members m where m.user_id = uid limit 1;
  if old_hid is not null and old_hid <> inv.household_id then
    delete from public.members m where m.user_id = uid and m.household_id = old_hid;
    -- Ble den stående tom, ryddes den bort (cascade tar med tomme data).
    if not exists (select 1 from public.members m where m.household_id = old_hid) then
      delete from public.households h where h.id = old_hid;
    end if;
  end if;

  insert into public.members (household_id, user_id, display_name)
  values (inv.household_id, uid, nm)
  on conflict (household_id, user_id) do nothing;

  insert into public.profiles (user_id, display_name) values (uid, nm)
    on conflict (user_id) do update set display_name = excluded.display_name;

  update public.household_invites set used_at = now(), used_by = uid where id = inv.id;

  return inv.household_id;
end;
$$;
revoke all on function public.accept_invite(text, text) from public;
grant execute on function public.accept_invite(text, text) to authenticated;
