-- Sikkerhets- og personvernfunn fra gjennomgangen 2. september 2026.
--
-- Elleve gjennomganger av backend før softlansering fant åtte hull som må
-- tettes FØR fremmede får slippe inn. Alt her er tettinger, ingen nye
-- funksjoner. Hvert punkt står med hva som var galt og hva det kostet.

-- ===========================================================================
-- 1) KRITISK: fire tegn holdt ikke. En fremmed kunne gjette seg inn i
--    familielisten din på under to minutter.
--
--    Regnestykket: 30 symboler i fire posisjoner er 810 000 koder. Med
--    810 gyldige invitasjoner ute i systemet treffer et tilfeldig gjett én
--    av 1 000 — altså rundt 1 000 forsøk. Bremsen skulle stoppe det, men
--    den var telt per BRUKER, og:
--      * registrering er åpen og krever ikke e-postbekreftelse, så en
--        angriper lager en ny konto per tiende gjett
--      * en vellykket innløsning slettet forsøksloggen, så én gyldig kode
--        ga uendelig med nye forsøk
--    Målt i test: 963 gjett i snitt før innbrudd, 0,46 sekunder mot en
--    lokal base, ~100 sekunder over nett med en høflig ti-per-sekund.
--
--    Seks tegn er 729 000 000 koder — 900 000 forsøk per innbrudd i stedet
--    for 1 000. To tastetrykk mer for bestemor, ni måneders arbeid for en
--    angriper. Koden er fortsatt kort nok å lese opp på telefonen, som var
--    hele poenget med å forkorte den.
-- ===========================================================================
create or replace function public.short_invite_code()
returns text
language plpgsql
set search_path = public
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  hex      text := replace(gen_random_uuid()::text, '-', '')
                || replace(gen_random_uuid()::text, '-', '');
  out_code text := '';
  i        int;
begin
  -- Seks tegn. Tilfeldigheten kommer fra gen_random_uuid(), ikke random():
  -- en kode som kan forutsies er like god som ingen kode.
  for i in 0..5 loop
    out_code := out_code || substr(
      alphabet,
      1 + (('x' || substr(hex, 1 + i * 3, 3))::bit(12)::int % length(alphabet)),
      1
    );
  end loop;
  return out_code;
end;
$$;
revoke all on function public.short_invite_code() from public;

-- Oppslaget skjer på upper(code), og da hjalp ingen av de to indeksene på
-- code — hver innløsning OG hvert gjett skannet hele tabellen.
create index if not exists household_invites_code_upper_idx
  on public.household_invites (upper(code));

-- Global brems, i tillegg til den per bruker. En familie gjør to forsøk
-- til sammen; et skript gjør tusener. Taket er satt høyt nok til at ekte
-- bruk aldri møter det, og lavt nok til at automatikk stopper.
--
-- Byttet er bevisst: en angriper som fyller taket kan forsinke ekte
-- innmeldinger en time. Det er en langt mindre skade enn et innbrudd.
create or replace function public.invite_attempt_cap() returns integer
  language sql immutable set search_path = public as $$ select 300 $$;

-- ===========================================================================
-- 2) HØY: uendelig med Plukkepoeng — altså gratis abonnement for alltid.
--
--    invites_member-policyen var «for all», og det inkluderer UPDATE. Med
--    et vanlig medlemskap kunne man lage en invitasjon til sin EGEN liste,
--    sette used_at direkte over REST-API-et, og poengtriggeren delte ut 50
--    poeng. Tre runder = 150 poeng = én måned gratis. Gjenta i det
--    uendelige.
--
--    Klienten rører aldri denne tabellen direkte — alt går gjennom
--    create_invite() og redeem_invite() — så skriveretten kan bare fjernes.
-- ===========================================================================
drop policy if exists invites_member on public.household_invites;
drop policy if exists invites_select on public.household_invites;
drop policy if exists invites_delete on public.household_invites;
create policy invites_select on public.household_invites
  for select to authenticated
  using (public.is_household_member(household_id));
-- En invitasjon man har sendt ved en feil, skal kunne trekkes tilbake.
create policy invites_delete on public.household_invites
  for delete to authenticated
  using (public.is_household_member(household_id));
revoke insert, update on public.household_invites from authenticated;

-- ===========================================================================
-- 3) HØY: siste medlem kunne forlate listen og etterlate både dataene og
--    et løpende Stripe-abonnement uten eier.
--
--    leave_shared_list() fikk en sperre for nettopp dette, men RLS lot
--    fortsatt medlemmet slette sin egen rad direkte — og da kjørte sperren
--    aldri. Resultat: en husholdning med 0 medlemmer, data ingen kan nå,
--    og et kort som fortsatt trekkes hver måned.
-- ===========================================================================
-- To triggere, ikke én. Den første nekter, den andre rydder.
--
-- Første forsøk gjorde begge i én BEFORE DELETE-trigger, og da slettet
-- den husholdningen — som via kaskaden slettet nettopp den medlemsraden
-- Postgres var i ferd med å slette. «tuple to be deleted was already
-- modified by an operation triggered by the current command», og da kunne
-- ingen forlate en liste i det hele tatt.
create or replace function public.guard_last_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  others int;
  live   int;
begin
  select count(*) into others from public.members m
  where m.household_id = old.household_id and m.user_id <> old.user_id;
  if others > 0 then return old; end if;

  select count(*) into live from public.subscriptions s
  where s.household_id = old.household_id
    and s.stripe_subscription_id is not null
    and s.status in ('prøve', 'aktiv', 'forfalt');
  if live > 0 then
    raise exception 'Si opp abonnementet først — ellers fortsetter det å trekke etter at listen er borte. Du finner oppsigelsen under Min profil og Abonnement.'
      using errcode = 'P0001';
  end if;
  return old;
end;
$$;

/**
 * Rydder bort en husholdning som ikke har medlemmer igjen.
 *
 * leave_shared_list() gjør dette selv, men RLS lot medlemmet slette raden
 * sin DIREKTE over REST-API-et, og da kjørte ingenting. Resultatet var en
 * husholdning med 0 medlemmer: data ingen kan nå, og ingen vei inn igjen.
 */
create or replace function public.cleanup_empty_household()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.members m where m.household_id = old.household_id) then
    delete from public.households h where h.id = old.household_id;
  end if;
  return null;
end;
$$;

drop trigger if exists members_guard_last on public.members;
create trigger members_guard_last before delete on public.members
  for each row execute function public.guard_last_member();

drop trigger if exists members_cleanup_empty on public.members;
create trigger members_cleanup_empty after delete on public.members
  for each row execute function public.cleanup_empty_household();

-- ===========================================================================
-- 4) MIDDELS: hvem som helst kunne forgifte fellesdatabasen over priser.
--
--    price_obs_insert var «with check (true)»: ubegrenset innlegging, uten
--    kvote og uten spor. Læringsjobben leser derfra og skriver til
--    item_catalog, som ALLE husholdninger leser. Ti tusen rader som sier
--    «Melk = 99 kroner» flytter prisen for alle andre familier — og fordi
--    radene er anonyme med vilje, finnes det ingen måte å rydde etter én
--    forgifter i ettertid.
--
--    Radene skal fortsatt være anonyme. Det er SKRIVINGEN som må ha en
--    kvote, og den kvoten kan ligge i en egen tabell som ikke er koblet
--    til observasjonene.
-- ===========================================================================
create table if not exists public.price_obs_quota (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null,
  n       integer not null default 0,
  primary key (user_id, day)
);
alter table public.price_obs_quota enable row level security;
-- Ingen policy: kvoten er ikke brukerens sak å lese eller endre.
revoke all on public.price_obs_quota from authenticated, anon;

/** Så mange varelinjer får én bruker bidra med per dag. */
create or replace function public.price_obs_daily_cap() returns integer
  language sql immutable set search_path = public as $$ select 600 $$;

/**
 * Legger inn en kvitterings varelinjer i fellesdatabasen — anonymt.
 *
 * Returnerer antall rader som ble lagret, eller -1 når dagskvoten er
 * brukt opp. Kaster ikke: kvitteringen er verdt å beholde selv om
 * prisbidraget må vente til i morgen.
 */
create or replace function public.record_price_observations(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_n    int;
  v_used int;
  v_cap  int := public.price_obs_daily_cap();
  v_day  date := public.oslo_today();
  v_ins  int;
begin
  if v_user is null then return 0; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then return 0; end if;
  v_n := jsonb_array_length(p_rows);
  if v_n = 0 then return 0; end if;
  -- Én kvittering. Er det flere linjer enn dette, er det ikke en kvittering.
  if v_n > 400 then return -1; end if;

  select q.n into v_used from public.price_obs_quota q
  where q.user_id = v_user and q.day = v_day for update;
  v_used := coalesce(v_used, 0);
  if v_used + v_n > v_cap then return -1; end if;

  insert into public.price_obs_quota (user_id, day, n)
  values (v_user, v_day, v_n)
  on conflict (user_id, day) do update set n = public.price_obs_quota.n + v_n;

  insert into public.price_observations
    (item_name, store_code, price, qty, unit, unit_price, regular_unit_price,
     observed_at, source, confidence)
  select
    left(r.item_name, 120), left(r.store_code, 40), r.price, r.qty, left(r.unit, 12),
    r.unit_price, r.regular_unit_price,
    -- En rad datert i 2030 ville overlevd hvert eneste tidsvindu og stått
    -- først i køen for alltid. Framtiden klippes til nå.
    least(coalesce(r.observed_at, now()), now()),
    'receipt',
    least(greatest(coalesce(r.confidence, 0.6), 0), 1)
  from jsonb_to_recordset(p_rows) as r(
    item_name text, store_code text, price numeric, qty numeric, unit text,
    unit_price numeric, regular_unit_price numeric,
    observed_at timestamptz, confidence numeric
  )
  where r.item_name is not null and length(trim(r.item_name)) > 0
    and r.price > 0 and r.price < 100000
    and (r.qty is null or (r.qty > 0 and r.qty <= 500))
    and (r.unit_price is null or (r.unit_price > 0 and r.unit_price < 100000))
    and (r.regular_unit_price is null or (r.regular_unit_price > 0 and r.regular_unit_price < 100000));

  get diagnostics v_ins = row_count;
  return v_ins;
end;
$$;
revoke all on function public.record_price_observations(jsonb) from public;
grant execute on function public.record_price_observations(jsonb) to authenticated;

-- Direkte innlegging er ikke lenger veien inn.
drop policy if exists price_obs_insert on public.price_observations;
revoke insert, update, delete on public.price_observations from authenticated;

-- ===========================================================================
-- 5) MIDDELS (personvern): hele handleturer kunne leses av hvem som helst.
--
--    Alle linjene fra én kvittering fikk samme observed_at (dato kl. 12) og
--    samme store_code, og leseretten var «using (true)». Da returnerer
--    ett spørsmål én families komplette handletur, med priser. Radene har
--    ingen navn på seg, så det er ikke identifisering i seg selv — men en
--    handlekorg er et rikt objekt, og ved lansering er det få nok korger
--    at den som vet omtrent hva en familie kjøper, kan kjenne den igjen.
--
--    Ingenting i appen trenger denne leseretten: klienten skriver bare, og
--    læringsjobben kjører som service_role og går utenom RLS.
-- ===========================================================================
drop policy if exists price_obs_read on public.price_observations;
revoke select on public.price_observations from authenticated, anon;

-- ===========================================================================
-- 6) MIDDELS: item_catalog fortalte hvor familien bor.
--
--    store_dist inneholdt filialnavn med besøkstall: «Coop Extra Dr. Munk:
--    12; MENY: 8». Det er 138 rader som til sammen plasserer én
--    husholdning i et navngitt nabolag, og tabellen leses av alle
--    innloggede. Prisene er et fellesgode; hvilken filial ÉN familie går i,
--    er det ikke.
--
--    Ingen kode leser store_dist. Kolonnen tømmes, og beholdes bare fordi
--    en drop ville vært en unødvendig skjemaendring.
-- ===========================================================================
update public.item_catalog set store_dist = null where store_dist is not null;

-- Enheten prisen gjelder for. Uten den kunne en pris per KILO bli ganget
-- med et antall pakker: 129 kr/kg ble 129 kroner for en 400-grams pakke
-- som kostet 51,60.
alter table public.item_catalog
  add column if not exists avg_price_unit text;

-- Nattgjennomgangen SLETTET katalogvarer den mente var duplikater, på én
-- husholdnings ubekreftede ord. Nå skjules de i stedet, så et feilaktig
-- sammenslag kan angres.
alter table public.item_catalog
  add column if not exists active boolean not null default true;

-- ===========================================================================
-- 7) LAVERE FUNN, samlet
-- ===========================================================================

-- 7a) Tilbakemelding kunne tilskrives en annen husholdning.
drop policy if exists app_feedback_insert on public.app_feedback;
create policy app_feedback_insert on public.app_feedback
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (household_id is null or public.is_household_member(household_id))
  );

-- 7b) Utsikten over hentelogger kjørte med eierrettigheter og gikk dermed
--     utenom RLS på tabellen bak. Kolonnelisten var eneste vern, og en
--     senere «select *» ville åpnet feilmeldingene igjen.
alter view public.offer_fetch_status set (security_invoker = true);
drop policy if exists offer_fetch_logs_status_read on public.offer_fetch_logs;
create policy offer_fetch_logs_status_read on public.offer_fetch_logs
  for select to authenticated using (true);
revoke select on public.offer_fetch_logs from authenticated, anon;
grant select on public.offer_fetch_status to authenticated;

-- 7c) household_has_access() svarte på spørsmål om andres husholdninger.
--     Den skal fortsatt kunne kalles for raden en policy vurderer, så
--     sperren er på medlemskap, ikke på egen husholdning.
create or replace function public.household_has_access(hid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare s public.subscriptions%rowtype;
begin
  if hid is null then return false; end if;
  -- Kalt fra en policy er det raden som spør, og da finnes ingen
  -- innlogget bruker å måle mot. Kalt fra klienten er det et spørsmål om
  -- egen husholdning, og bare det.
  if auth.uid() is not null and not public.is_household_member(hid) then
    return null;
  end if;
  select * into s from public.subscriptions where household_id = hid;
  if not found then return true; end if;
  return case s.status
    when 'grunnlegger' then true
    when 'forfalt'     then s.paid_until >= public.oslo_today() - 5
    when 'prøve'       then s.paid_until >= public.oslo_today()
    when 'aktiv'       then s.paid_until >= public.oslo_today()
    when 'poeng'       then s.paid_until >= public.oslo_today()
    else false
  end;
end;
$$;

-- 7d) search_path manglet på tre funksjoner. Ikke utnyttbart i dag, men
--     huset har en regel, og reglene gjelder alle.
alter function public.oslo_today() set search_path = public;
alter function public.touch_updated_at() set search_path = public;

-- 7e) Tilbudstabellen er den ene som fylles av høsting, og den manglet
--     indeks på begge kolonnene den slettes og filtreres på.
create index if not exists offers_source_idx on public.offers (source);
create index if not exists offers_household_idx on public.offers (household_id);

comment on function public.record_price_observations(jsonb) is
  'Anonymt prisbidrag med dagskvote. Erstatter direkte innlegging i '
  'price_observations, som var uten tak og uten spor.';

-- ===========================================================================
-- 8) Mojibake i fellesdatabasen: «Ãm Tomater Finmost»
--
--    «ÄM TOMATER FINMOST» fra en Coop-kvittering ble lest som Latin-1 i
--    stedet for UTF-8: Ä (C3 84) ble «Ã» pluss en tapt kontrollbyte.
--    Raden har stått slik i varekatalogen som alle innloggede leser, og
--    vaskeregelen for det samme navnet lever side om side med den.
-- ===========================================================================
update public.item_catalog
   set name = 'Finmoste tomater, Änglamark',
       name_en = 'Chopped tomatoes'
 where name = 'Ãm Tomater Finmost'
   and not exists (
     select 1 from public.item_catalog x where x.name = 'Finmoste tomater, Änglamark'
   );
-- Finnes den riktige raden alt, er den feilstavede et duplikat: skjul den
-- og la vaskeregelen peke dit.
update public.item_catalog set active = false where name = 'Ãm Tomater Finmost';
insert into public.norm_rules (from_text, to_text)
values ('ÃM TOMATER FINMOST', 'Finmoste tomater, Änglamark')
on conflict (from_text) do update set to_text = excluded.to_text;

-- ===========================================================================
-- 9) Indeks på kvotetellingen. ai_scan_log brukes nå av fire funksjoner
--    (kundeavis, oppskrift, invitasjon, kvittering) og telles per kind.
-- ===========================================================================
create index if not exists ai_scan_log_user_kind_idx
  on public.ai_scan_log (user_id, kind, created_at desc);
