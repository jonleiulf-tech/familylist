-- Korte invitasjonskoder: «K7QP» i stedet for «83f3f58f65744008».
--
-- Fire tegn er lite å gjette på: 30^4 = 810 000 muligheter. Uten en brems
-- kunne noen prøvd seg gjennom dem og havnet i en tilfeldig families
-- handleliste. Derfor kommer kortkoden SAMMEN MED en forsøksbegrensning,
-- og innløsningen svarer nå med en status i stedet for å kaste — en
-- unntakelse ruller tilbake transaksjonen, og da forsvant også loggen
-- over forsøket som skulle bremse gjettingen.
--
-- Alfabetet er 23456789ABCDEFGHJKMNPQRSTVWXYZ: uten 0/O, 1/I/L og U/V-paret
-- (V beholdes, U droppes), så koden kan leses opp over telefon uten
-- «var det en O eller en null?».

-- ---------------------------------------------------------------------------
-- Forsøkslogg. Ingen policyer: bare security definer-funksjonene under
-- rører tabellen, og ingen skal kunne lese andres forsøk.
-- ---------------------------------------------------------------------------
create table if not exists public.invite_attempts (
  id      bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  at      timestamptz not null default now()
);
create index if not exists invite_attempts_user_at
  on public.invite_attempts (user_id, at desc);
alter table public.invite_attempts enable row level security;
revoke all on public.invite_attempts from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Kodegenerator. Tilfeldigheten hentes fra gen_random_uuid(), ikke random():
-- en kode som kan forutsies er like god som ingen kode.
-- ---------------------------------------------------------------------------
create or replace function public.short_invite_code()
returns text
language plpgsql
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  hex      text := replace(gen_random_uuid()::text, '-', '');
  out_code text := '';
  i        int;
begin
  for i in 0..3 loop
    out_code := out_code || substr(
      alphabet,
      1 + (('x' || substr(hex, 1 + i * 3, 3))::bit(12)::int % length(alphabet)),
      1
    );
  end loop;
  return out_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_invite(): kort kode, med opprydding og kollisjonsforsøk.
--
-- Kodefeltet er unikt for ALLE rader, også brukte og utløpte. Med bare
-- 810 000 muligheter må de gamle ryddes bort, ellers tetter historikken
-- til rommet etter noen år. Brukte og utløpte invitasjoner eldre enn 30
-- dager slettes derfor når en ny lages.
-- ---------------------------------------------------------------------------
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
  tries      int := 0;
begin
  hid := coalesce(list_id, public.my_household_id());
  if hid is null then
    raise exception 'Du må ha en delt liste før du kan invitere.' using errcode = 'P0002';
  end if;
  if not public.is_household_member(hid) then
    raise exception 'Du er ikke medlem av denne listen.' using errcode = '42501';
  end if;

  delete from public.household_invites i
  where i.created_at < now() - interval '30 days'
    and (i.used_at is not null or i.expires_at < now());

  new_expiry := now() + interval '7 days';

  loop
    tries := tries + 1;
    new_code := public.short_invite_code();
    begin
      insert into public.household_invites (household_id, code, created_by, expires_at)
      values (hid, new_code, auth.uid(), new_expiry);
      exit;
    exception when unique_violation then
      -- Koden var i bruk. Prøv en ny — og gi opp med en lengre kode
      -- framfor å stå fast, skulle rommet en gang bli tett.
      if tries >= 20 then
        new_code := public.short_invite_code() || public.short_invite_code();
        insert into public.household_invites (household_id, code, created_by, expires_at)
        values (hid, new_code, auth.uid(), new_expiry);
        exit;
      end if;
    end;
  end loop;

  return query select new_code, new_expiry;
end;
$$;
revoke all on function public.create_invite(uuid) from public;
grant execute on function public.create_invite(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- redeem_invite(): løser inn koden og svarer med en STATUS.
--
-- Den gamle accept_invite() kastet unntak på ugyldig kode. Et unntak
-- ruller tilbake transaksjonen, altså også raden vi nettopp skrev i
-- forsøksloggen — bremsen mot gjetting ville aldri virket. Her returneres
-- statusen i stedet, så loggen står.
--
-- Statuser: ok, already_member, not_found, used, expired, full,
--           rate_limited, not_signed_in
-- ---------------------------------------------------------------------------
create or replace function public.redeem_invite(code text, display_name text default null)
returns table (status text, household_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid          uuid := auth.uid();
  cleaned      text;
  inv          public.household_invites%rowtype;
  nm           text;
  member_count int;
  fails        int;
begin
  if uid is null then
    return query select 'not_signed_in'::text, null::uuid;
    return;
  end if;

  -- Mellomrom, bindestrek og små bokstaver skal ikke avgjøre noe. Gamle
  -- koder er 16 tegn heksadesimalt og sammenlignes i samme slengen.
  cleaned := upper(regexp_replace(coalesce(redeem_invite.code, ''), '[^a-zA-Z0-9]', '', 'g'));
  if cleaned = '' then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;

  select count(*) into fails
  from public.invite_attempts a
  where a.user_id = uid and a.at > now() - interval '1 hour';
  if fails >= 10 then
    return query select 'rate_limited'::text, null::uuid;
    return;
  end if;

  select * into inv from public.household_invites i
  where upper(i.code) = cleaned
  for update;

  if inv.id is null then
    insert into public.invite_attempts (user_id) values (uid);
    return query select 'not_found'::text, null::uuid;
    return;
  end if;
  if inv.used_at is not null then
    insert into public.invite_attempts (user_id) values (uid);
    return query select 'used'::text, null::uuid;
    return;
  end if;
  if inv.expires_at < now() then
    insert into public.invite_attempts (user_id) values (uid);
    return query select 'expired'::text, null::uuid;
    return;
  end if;

  -- Alt medlem: koden brukes opp, men ingenting endres.
  if exists (select 1 from public.members m
             where m.household_id = inv.household_id and m.user_id = uid) then
    update public.household_invites set used_at = now(), used_by = uid where id = inv.id;
    return query select 'already_member'::text, inv.household_id;
    return;
  end if;

  select count(*) into member_count from public.members m
  where m.household_id = inv.household_id;
  if member_count >= 10 then
    return query select 'full'::text, null::uuid;
    return;
  end if;

  nm := coalesce(
    nullif(trim(redeem_invite.display_name), ''),
    (select p.display_name from public.profiles p where p.user_id = uid),
    'Medlem'
  );

  -- «on conflict (household_id, ...)» går ikke her: household_id er også
  -- navnet på en av kolonnene funksjonen returnerer, og da er referansen
  -- tvetydig for plpgsql (42702). Vilkåret skrives derfor som en
  -- not exists-test i stedet.
  insert into public.members (household_id, user_id, display_name, role)
  select inv.household_id, uid, nm, 'member'
  where not exists (
    select 1 from public.members m2
    where m2.household_id = inv.household_id and m2.user_id = uid
  );

  insert into public.profiles (user_id, display_name) values (uid, nm)
    on conflict (user_id) do update set display_name = nm;

  update public.household_invites set used_at = now(), used_by = uid where id = inv.id;

  -- Vellykket innløsning tømmer bremsen: den skal stoppe gjetting, ikke
  -- den som skriver feil én gang før hen får det til.
  delete from public.invite_attempts a where a.user_id = uid;

  return query select 'ok'::text, inv.household_id;
end;
$$;
revoke all on function public.redeem_invite(text, text) from public;
grant execute on function public.redeem_invite(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- accept_invite() beholdes for appen som alt står åpen i en telefon.
--
-- Den kaster IKKE på ugyldig, brukt eller utløpt kode, men returnerer null.
-- Grunnen er bremsen: et unntak ruller tilbake transaksjonen, og da ville
-- forsøket forsvunnet fra loggen — altså kunne hvem som helst gjettet fritt
-- gjennom denne funksjonen i stedet for redeem_invite(). Den gamle klienten
-- viser da ingen feiltekst på en feil kode; det varer til siden lastes på
-- nytt, mens sperren gjelder med én gang.
-- ---------------------------------------------------------------------------
create or replace function public.accept_invite(code text, display_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  res record;
begin
  select * into res from public.redeem_invite(accept_invite.code, accept_invite.display_name);
  case res.status
    when 'ok', 'already_member' then return res.household_id;
    -- Disse tre er de eneste en gjetting treffer. De må committe, ellers
    -- mister vi forsøksloggen som bremsen bygger på.
    when 'not_found', 'used', 'expired' then return null;
    when 'not_signed_in' then raise exception 'Ikke innlogget.' using errcode = '28000';
    when 'full' then raise exception 'Listen er full (maks 10 medlemmer).' using errcode = 'P0001';
    when 'rate_limited' then raise exception 'For mange forsøk. Prøv igjen om en time.' using errcode = 'P0001';
    else raise exception 'Kunne ikke bli med i listen.' using errcode = 'P0001';
  end case;
end;
$$;
revoke all on function public.accept_invite(text, text) from public;
grant execute on function public.accept_invite(text, text) to authenticated;
