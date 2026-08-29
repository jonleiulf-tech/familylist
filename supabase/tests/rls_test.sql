-- Regresjonstest for husholdningsisolasjon og invitasjoner.
--
-- Kjør mot en TOM testdatabase der migrasjonene er lagt på:
--   ./scripts/test-db.sh
--
-- Testen sjekker kravet fra handoff-en:
--   «to brukere i samme husholdning ser hverandres avhukinger live;
--    en tredje bruker i egen husholdning ser ingenting av vårt.»

\set ON_ERROR_STOP on
\pset pager off
\set QUIET on

create or replace function assert(ok boolean, what text)
returns void language plpgsql as $$
begin
  if ok then raise notice 'OK   %', what;
  else raise exception 'FEIL %', what;
  end if;
end $$;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','jon@example.no'),
  ('22222222-2222-2222-2222-222222222222','marte@example.no'),
  ('33333333-3333-3333-3333-333333333333','sjef@example.no');
\set QUIET off

\echo ''
\echo '=== Oppsett ==='
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select public.bootstrap_household('Jon','Hansen-familien') as jon_hh \gset
select assert((select count(*) from public.meals) = 30, 'Jon fikk 30 middager seedet');

select code from public.create_invite() \gset
select set_config('familylist.test_code', :'code', false);

reset role; set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select public.accept_invite(:'code','Marte') as marte_hh \gset
select assert(:'marte_hh' = :'jon_hh', 'Marte havnet i Jons husholdning via invitasjon');

reset role; set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select public.bootstrap_household('Sjef', null) as sjef_hh \gset
select assert(:'sjef_hh' <> :'jon_hh', 'Sjefen fikk sin egen husholdning');
select assert((select count(*) from public.meals) = 30, 'Sjefen fikk sine egne 30 middager');

\echo ''
\echo '=== Deling i samme husholdning ==='
reset role; set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into public.shopping_items (household_id, name, qty, unit, category, created_by)
values (:'jon_hh','Melk',2,'liter','Meieri','11111111-1111-1111-1111-111111111111');

reset role; set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select assert((select count(*) from public.shopping_items) = 1, 'Marte ser Jons vare');
update public.shopping_items set checked = true, checked_by = '22222222-2222-2222-2222-222222222222';

reset role; set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select assert((select bool_and(checked) from public.shopping_items), 'Jon ser Martes avhuking');
select assert((select count(*) from public.members) = 2, 'Jon ser begge medlemmene');

\echo ''
\echo '=== Isolasjon mot sjefens husholdning ==='
reset role; set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select assert((select count(*) from public.shopping_items) = 0, 'Sjefen ser ingen av deres varer');
select assert((select count(*) from public.households) = 1, 'Sjefen ser kun sin egen husholdning');
select assert((select count(*) from public.members) = 1, 'Sjefen ser kun seg selv som medlem');
select assert((select count(*) from public.household_invites) = 0, 'Sjefen ser ingen invitasjoner');
select assert((select count(*) from public.meal_plan) = 0, 'Sjefen ser ingen middagsplan');

\echo ''
\echo '=== Skriveforsøk mot annen husholdning ==='
do $$
begin
  begin
    insert into public.shopping_items (household_id, name)
    values ((select id from public.households where name = 'Hansen-familien'), 'Spionvare');
    raise exception 'FEIL Sjefen fikk skrive i Jons handleliste';
  exception when insufficient_privilege or check_violation then
    raise notice 'OK   Sjefen blokkert fra å skrive i Jons handleliste';
  end;
end $$;

do $$
begin
  begin
    insert into public.members (household_id, user_id, display_name)
    values ((select id from public.households where name = 'Hansen-familien'),
            '33333333-3333-3333-3333-333333333333', 'Snik');
    raise exception 'FEIL Sjefen meldte seg inn i Jons husholdning';
  exception when insufficient_privilege or check_violation then
    raise notice 'OK   Sjefen blokkert fra å melde seg inn i Jons husholdning';
  end;
end $$;

\echo ''
\echo '=== Invitasjoner: engangsbruk og utløp ==='
-- Koden er allerede brukt av Marte.
do $$
begin
  begin
    perform public.accept_invite(current_setting('familylist.test_code'), 'Snik');
    raise exception 'FEIL Brukt invitasjonskode ble godtatt';
  exception when others then
    if sqlerrm like 'FEIL%' then raise;
    end if;
    raise notice 'OK   Brukt invitasjonskode avvist (%)', sqlerrm;
  end;
end $$;

-- Utløpt kode
reset role; set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select code as code2 from public.create_invite() \gset
select set_config('familylist.test_code2', :'code2', false);
update public.household_invites set expires_at = now() - interval '1 day' where code = :'code2';

reset role; set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$
begin
  begin
    perform public.accept_invite(current_setting('familylist.test_code2'), 'Snik');
    raise exception 'FEIL Utløpt invitasjonskode ble godtatt';
  exception when others then
    if sqlerrm like 'FEIL%' then raise;
    end if;
    raise notice 'OK   Utløpt invitasjonskode avvist (%)', sqlerrm;
  end;
end $$;

\echo ''
\echo '=== Referansedata er felles og lesbare ==='
select assert((select count(*) from public.item_catalog) = 465, 'Varekatalogen har 465 varer');
select assert((select count(*) from public.norm_rules) = 134, 'Normaliseringsreglene er 134');
select assert((select count(*) from public.meal_library) = 30, 'Middagsbiblioteket har 30 middager');

\echo ''
\echo '=== Redningsvei: manuell kode etter at man har laget egen husholdning ==='
-- Scenarioet som faktisk skjer i praksis: partneren rekker å logge inn uten
-- å klikke invitasjonslenken, og sitter da i sin egen tomme husholdning.
-- accept_invite skal flytte henne over OG rydde bort den tomme husholdningen.
\set QUIET on
reset role;
insert into auth.users (id, email) values
  ('44444444-4444-4444-4444-444444444444','kona@example.no');
\set QUIET off

reset role; set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select code as code3 from public.create_invite() \gset

reset role; set role authenticated;
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
select public.bootstrap_household('Kona', null) as kona_egen \gset
select assert(:'kona_egen' <> :'jon_hh', 'Kona fikk først sin egen husholdning');
select assert((select count(*) from public.shopping_items) = 0, 'Hun ser ikke deres liste ennå');

select public.accept_invite(:'code3','Kona') as kona_etter \gset
select assert(:'kona_etter' = :'jon_hh', 'Manuell kode flyttet henne inn i riktig husholdning');
select assert((select count(*) from public.shopping_items) = 1, 'Nå ser hun handlelisten deres');

reset role;
select assert(
  not exists (select 1 from public.households where id = :'kona_egen'),
  'Hennes tomme husholdning ble ryddet bort'
);

\echo ''
\echo '=== Tilbud og merkelapper ==='
select assert((select count(*) from public.offers where is_sample) = 20, ' 20 eksempeltilbud seedet');
select assert((select count(*) from public.item_tags where tag = 'staple') = 6, '6 faste husholdningsvarer');
select assert((select count(*) from public.item_tags where tag = 'dairy_free') = 6, '6 melkefrie varer');
select assert(
  (select count(*) from public.offers where is_sample and valid_to >= current_date) = 20,
  'Alle eksempeltilbud er gyldige i dag'
);

\echo ''
\echo 'ALLE TESTER BESTÅTT'
