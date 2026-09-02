-- Rekrutteringspoeng skal gis når noen FAKTISK ble med, ikke før.
--
-- Slik det virket: triggeren points_on_invite lyttet på at used_at ble satt
-- på invitasjonen. Det skjer ved innløsning, altså når mottakeren er
-- innlogget og trykker seg inn — så hovedveien ga poeng på riktig
-- tidspunkt, og ALDRI ved utsending av e-post. Så langt riktig.
--
-- Men det var et hull: «already_member» setter også used_at. Er du alt
-- medlem og løser inn en kode, brukes koden opp, ingenting endres — og
-- den som lagde koden fikk 50 poeng likevel. Et annet familiemedlem kunne
-- dermed løse inn nye koder på rad og fylle opp saldoen til den som lagde
-- dem, uten at en eneste ny person ble med.
--
-- Løsningen er å slutte å utlede det fra used_at. Poengene deles nå ut
-- inne i redeem_invite(), på den ene veien der en NY medlemsrad faktisk
-- ble opprettet. Da er betingelsen ikke lenger «koden ble brukt», men
-- «det finnes et nytt medlem i listen» — som er det poengene er for.

-- ---------------------------------------------------------------------------
-- 1) Triggeren fjernes. Den kan ikke se forskjell på «ny person ble med»
--    og «koden ble stemplet».
-- ---------------------------------------------------------------------------
drop trigger if exists points_invite on public.household_invites;

-- ---------------------------------------------------------------------------
-- 2) redeem_invite() deler ut poengene selv — bare når innmeldingen skjedde.
--
--    Resten av funksjonen er uendret fra 20260902190000. Den gjentas i sin
--    helhet fordi create or replace ikke kan lappe på en kropp.
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
  joined       int;
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

  -- Global brems i tillegg til den per bruker: registrering er åpen og
  -- uten e-postbekreftelse, så et skript kan lage en ny konto per tiende
  -- gjett. En familie gjør to forsøk til sammen; taket her møter bare
  -- automatikk.
  select count(*) into fails
  from public.invite_attempts a
  where a.at > now() - interval '1 hour';
  if fails >= public.invite_attempt_cap() then
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

  -- Alt medlem: koden brukes opp, men ingenting endres — og INGEN poeng,
  -- for ingen ny person ble med.
  if exists (select 1 from public.members m
             where m.household_id = inv.household_id and m.user_id = uid) then
    update public.household_invites set used_at = now(), used_by = uid where id = inv.id;
    return query select 'already_member'::text, inv.household_id;
    return;
  end if;

  -- Medlemstaket låses på husholdningen først. Uten låsen leste to
  -- samtidige innløsninger begge «9 medlemmer» og la inn hver sin, så
  -- listen endte på 11.
  perform 1 from public.households h where h.id = inv.household_id for update;

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
  get diagnostics joined = row_count;

  insert into public.profiles (user_id, display_name) values (uid, nm)
    on conflict (user_id) do update set display_name = nm;

  update public.household_invites set used_at = now(), used_by = uid where id = inv.id;

  -- POENGENE, her og bare her: en ny medlemsrad ble faktisk opprettet, og
  -- den som løste inn måtte være innlogget — altså har mottakeren laget
  -- seg en konto. Utsending av e-post gir ingenting, og en kode løst inn
  -- av noen som alt er medlem gir ingenting.
  if joined > 0 and inv.created_by is distinct from uid then
    perform public.award_points(inv.created_by, 'invitasjon_brukt', 50, inv.id::text,
      'Noen ble med i listen via invitasjonen din');
  end if;

  -- Vellykket innløsning tømmer bremsen for DENNE brukeren — men bare de
  -- forsøkene som er eldre enn den siste timen får stå, slik at en gyldig
  -- kode ikke lenger nullstiller gjettebudsjettet.
  delete from public.invite_attempts a
   where a.user_id = uid and a.at <= now() - interval '1 hour';

  return query select 'ok'::text, inv.household_id;
end;
$$;
revoke all on function public.redeem_invite(text, text) from public;
grant execute on function public.redeem_invite(text, text) to authenticated;

comment on function public.redeem_invite(text, text) is
  'Løser inn en invitasjonskode. Deler ut rekrutteringspoeng bare når en '
  'ny medlemsrad faktisk ble opprettet — ikke ved utsending, og ikke når '
  'den som løser inn allerede er medlem.';
