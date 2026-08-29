-- Fra «én husholdning per bruker» til «flere delte lister per bruker».
--
-- Bakgrunn: modellen antok at en bruker hører til nøyaktig ett sted. Men den
-- samme personen kan ha en familie, en hyttetur med kompiser og en
-- kontorkasse — tre adskilte lister med ulike medlemmer.
--
-- Tabellene households og members beholder navnene sine. De er interne, og
-- en full omdøping ville rørt hver eneste policy og funksjon uten å gi noe.
-- Utad heter det «delt liste».

-- ---------------------------------------------------------------------------
-- Type og eierskap
-- ---------------------------------------------------------------------------
alter table public.households
  add column if not exists kind text not null default 'familie'
    check (kind in ('familie', 'venner', 'jobb', 'annet'));

alter table public.members
  add column if not exists role text not null default 'member'
    check (role in ('owner', 'member'));

-- Den som opprettet en liste før dette fantes, blir eier av den.
update public.members m
set role = 'owner'
where role = 'member'
  and m.created_at = (
    select min(m2.created_at) from public.members m2
    where m2.household_id = m.household_id
  );

create index if not exists members_household_idx on public.members(household_id);

-- ---------------------------------------------------------------------------
-- Er brukeren eier av listen?
-- SECURITY DEFINER av samme grunn som is_household_member: en policy som
-- spør members kjører selv under RLS og blir da lett å omgå.
-- ---------------------------------------------------------------------------
create or replace function public.is_list_owner(hid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.members m
    where m.household_id = hid and m.user_id = auth.uid() and m.role = 'owner'
  );
$$;
revoke all on function public.is_list_owner(uuid) from public;
grant execute on function public.is_list_owner(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Medlemshåndtering: bare eier kan kaste ut andre. Alle kan gå selv.
--
-- Den gamle policyen lot ethvert medlem slette ethvert annet. For to i en
-- familie gikk det bra; for ti på hyttetur er det for løst.
-- ---------------------------------------------------------------------------
drop policy if exists members_delete on public.members;
create policy members_delete on public.members
  for delete to authenticated
  using (
    user_id = auth.uid()                       -- forlate selv
    or public.is_list_owner(household_id)      -- eier fjerner andre
  );

-- Bare eier kan endre navn og type på listen.
drop policy if exists households_update on public.households;
create policy households_update on public.households
  for update to authenticated
  using (public.is_list_owner(id))
  with check (public.is_list_owner(id));

-- ---------------------------------------------------------------------------
-- Opprett en ny delt liste. Kan kalles flere ganger av samme bruker.
-- ---------------------------------------------------------------------------
create or replace function public.create_shared_list(list_name text, list_kind text default 'annet')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid  uuid := auth.uid();
  hid  uuid;
  nm   text;
begin
  if uid is null then
    raise exception 'Ikke innlogget.' using errcode = '28000';
  end if;
  if coalesce(trim(list_name), '') = '' then
    raise exception 'Listen må ha et navn.' using errcode = 'P0001';
  end if;

  -- Maks 20 lister per bruker. Ikke en forretningsregel, men en brems mot
  -- at en løpsk klient lager tusenvis.
  if (select count(*) from public.members where user_id = uid) >= 20 then
    raise exception 'Du er med i for mange lister.' using errcode = 'P0001';
  end if;

  insert into public.households (name, kind)
  values (trim(list_name), coalesce(nullif(list_kind, ''), 'annet'))
  returning id into hid;

  nm := coalesce(
    (select p.display_name from public.profiles p where p.user_id = uid),
    'Meg'
  );

  insert into public.members (household_id, user_id, display_name, role)
  values (hid, uid, nm, 'owner');

  -- Bare familielister får middagsbiblioteket. En hyttetur trenger ikke
  -- 30 familieoppskrifter.
  if list_kind = 'familie' then
    insert into public.meals (household_id, name, category, ingredients)
    select hid, l.name, l.category, l.ingredients from public.meal_library l
    on conflict (household_id, name) do nothing;
  end if;

  return hid;
end;
$$;
revoke all on function public.create_shared_list(text, text) from public;
grant execute on function public.create_shared_list(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- bootstrap_household() må sette eierrollen.
-- Uten dette blir den som oppretter sin egen liste bare «member», og har
-- ikke rett til å invitere eller fjerne noen på sin egen liste.
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

  select m.household_id into hid from public.members m where m.user_id = uid
  order by m.created_at limit 1;
  if hid is not null then
    insert into public.profiles (user_id, display_name) values (uid, nm)
      on conflict (user_id) do update set display_name = excluded.display_name;
    return hid;
  end if;

  insert into public.households (name, kind)
  values (coalesce(nullif(trim(household_name), ''), nm || '-husholdningen'), 'familie')
  returning id into hid;

  insert into public.members (household_id, user_id, display_name, role)
  values (hid, uid, nm, 'owner');

  insert into public.profiles (user_id, display_name) values (uid, nm)
    on conflict (user_id) do update set display_name = excluded.display_name;

  insert into public.meals (household_id, name, category, ingredients)
  select hid, l.name, l.category, l.ingredients from public.meal_library l
  on conflict (household_id, name) do nothing;

  insert into public.rules (household_id, scope, rule_type, amount, weekdays, enabled)
  values (hid, 'Fisk', 'min', 2, '{}', true),
         (hid, 'Taco', 'weekday', 1, '{5}', true);

  return hid;
end;
$$;
revoke all on function public.bootstrap_household(text, text) from public;
grant execute on function public.bootstrap_household(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Invitasjon knyttet til én bestemt liste.
-- Tidligere gjettet den seg til «brukerens husholdning», som ikke lenger
-- gir mening når man er med flere steder.
-- ---------------------------------------------------------------------------
-- Den gamle create_invite() uten argumenter må vekk først. Med begge to
-- blir et kall til create_invite() tvetydig, og Postgres nekter å velge.
drop function if exists public.create_invite();

create or replace function public.create_invite(list_id uuid default null)
returns table (code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  hid        uuid;
  new_code   text;
  new_expiry timestamptz;
begin
  hid := coalesce(list_id, public.my_household_id());
  if hid is null then
    raise exception 'Du må ha en delt liste før du kan invitere.' using errcode = 'P0002';
  end if;
  if not public.is_household_member(hid) then
    raise exception 'Du er ikke medlem av denne listen.' using errcode = '42501';
  end if;

  new_code := substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
  new_expiry := now() + interval '7 days';

  insert into public.household_invites (household_id, code, created_by, expires_at)
  values (hid, new_code, auth.uid(), new_expiry);

  return query select new_code, new_expiry;
end;
$$;
revoke all on function public.create_invite(uuid) from public;
grant execute on function public.create_invite(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- accept_invite LEGGER TIL et medlemskap i stedet for å flytte brukeren.
--
-- Den gamle varianten meldte deg ut av din egen husholdning og slettet den
-- hvis den ble tom. Det var riktig da man bare kunne høre til ett sted; nå
-- ville det betydd at å bli med på en hyttetur slettet familielisten din.
-- ---------------------------------------------------------------------------
create or replace function public.accept_invite(code text, display_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  inv public.household_invites%rowtype;
  nm  text;
  member_count int;
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

  if exists (select 1 from public.members m
             where m.household_id = inv.household_id and m.user_id = uid) then
    update public.household_invites set used_at = now(), used_by = uid where id = inv.id;
    return inv.household_id;
  end if;

  select count(*) into member_count from public.members m where m.household_id = inv.household_id;
  if member_count >= 10 then
    raise exception 'Listen er full (maks 10 medlemmer).' using errcode = 'P0001';
  end if;

  nm := coalesce(
    nullif(trim(accept_invite.display_name), ''),
    (select p.display_name from public.profiles p where p.user_id = uid),
    'Medlem'
  );

  insert into public.members (household_id, user_id, display_name, role)
  values (inv.household_id, uid, nm, 'member')
  on conflict (household_id, user_id) do nothing;

  insert into public.profiles (user_id, display_name) values (uid, nm)
    on conflict (user_id) do update set display_name = excluded.display_name;

  update public.household_invites set used_at = now(), used_by = uid where id = inv.id;

  return inv.household_id;
end;
$$;
revoke all on function public.accept_invite(text, text) from public;
grant execute on function public.accept_invite(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Forlat en liste. Er du siste medlem, slettes den med alt innholdet.
-- Er du eneste eier men ikke siste medlem, går eierskapet videre til det
-- eldste gjenværende medlemmet — ellers ville listen blitt uten eier.
-- ---------------------------------------------------------------------------
create or replace function public.leave_shared_list(list_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  remaining int;
  owners_left int;
begin
  if not exists (select 1 from public.members m
                 where m.household_id = list_id and m.user_id = uid) then
    raise exception 'Du er ikke medlem av denne listen.' using errcode = 'P0002';
  end if;

  delete from public.members m where m.household_id = list_id and m.user_id = uid;

  select count(*) into remaining from public.members m where m.household_id = list_id;
  if remaining = 0 then
    delete from public.households h where h.id = list_id;
    return;
  end if;

  select count(*) into owners_left from public.members m
  where m.household_id = list_id and m.role = 'owner';

  if owners_left = 0 then
    update public.members m set role = 'owner'
    where m.household_id = list_id
      and m.created_at = (select min(m2.created_at) from public.members m2
                          where m2.household_id = list_id);
  end if;
end;
$$;
revoke all on function public.leave_shared_list(uuid) from public;
grant execute on function public.leave_shared_list(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Sikring: en liste skal aldri bli stående uten eier.
--
-- leave_shared_list() flytter eierskapet videre, men et medlemskap kan også
-- slettes direkte gjennom policyen. Da ville lista blitt uten admin, og
-- ingen kunne lenger invitere eller fjerne noen. Denne triggeren fanger
-- begge veier.
-- ---------------------------------------------------------------------------
create or replace function public.ensure_list_has_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining   int;
  owners_left int;
begin
  select count(*) into remaining
  from public.members m where m.household_id = old.household_id;

  -- Siste medlem gikk ut; lista ryddes bort av seg selv andre steder.
  if remaining = 0 then return old; end if;

  select count(*) into owners_left
  from public.members m
  where m.household_id = old.household_id and m.role = 'owner';

  if owners_left = 0 then
    update public.members m set role = 'owner'
    where m.household_id = old.household_id
      and m.created_at = (
        select min(m2.created_at) from public.members m2
        where m2.household_id = old.household_id
      );
  end if;

  return old;
end;
$$;

drop trigger if exists members_ensure_owner on public.members;
create trigger members_ensure_owner
  after delete on public.members
  for each row execute function public.ensure_list_has_owner();
