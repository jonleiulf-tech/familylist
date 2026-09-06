-- Tilgangsreglene for økonomien, prøvd mot en ekte PostgreSQL.
--
-- Kjøres av scripts/db-test.sh etter at migrasjonene er lagt inn. Alle
-- radene skal ende på OK. En rad som sier AVVIK betyr at noen kan se
-- eller endre noe de ikke skal.
\set ON_ERROR_STOP on
\pset pager off
\t on

-- ---------- Folk og data å prøve mot ----------
insert into public.members (email, role, sport_slug, name) values
  ('admin@psi.no',   'psi_admin',    null,      'Admin'),
  ('fotball@psi.no', 'group_leader', 'fotball', 'Fotballeder'),
  ('padel@psi.no',   'group_leader', 'padel',   'Padelleder')
on conflict do nothing;

insert into public.sports (slug, sort_order, active, data) values
  ('fotball', 1, true, '{"name":"PSI Fotball"}'),
  ('padel',   2, true, '{"name":"PSI Padel"}')
on conflict (slug) do nothing;

-- Egen periode for prøvene, så tallene ikke avhenger av hva som ellers
-- ligger i basen. Migrasjon 0015 fyller inn de virkelige 2026-tallene,
-- og en test som teller «alle rader» ville brutt av det.
insert into public.budsjett_perioder (ar, semester, gjeldende) values (2099, 'var', false)
on conflict (ar, semester) do nothing;

insert into public.budsjett_tildeling (periode_id, sport_slug, innvilget)
select p.id, g.slug, g.sum from public.budsjett_perioder p,
  (values ('fotball', 22800), ('padel', 20000), (null, 20000)) as g(slug, sum)
where p.ar = 2099
on conflict do nothing;

insert into public.bilag (periode_id, sport_slug, hva, belop, dato)
select p.id, b.slug, b.hva, b.belop, '2099-01-01' from public.budsjett_perioder p,
  (values ('fotball', 'Scoreboard', 2193.75), ('padel', 'Racketer', 10000), (null, 'Rollup', 5000)) as b(slug, hva, belop)
where p.ar = 2099;

-- ---------- Å opptre som ulike innloggede ----------
create or replace function bli(epost text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    case when epost is null then '' else json_build_object('email', epost, 'role', 'authenticated')::text end, false);
end $$;

create or replace function teller(hvem text, sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  perform bli(hvem);
  execute 'set local role authenticated';
  execute sql into n;
  execute 'reset role';
  return n;
end $$;

/* En UPDATE som treffer null rader er IKKE et gjennomslag: RLS filtrerer
   bort radene i stedet for å kaste feil, og da ville en test som bare ser
   etter unntak sagt god for at hvem som helst kan endre hva som helst. */
create or replace function proev(hvem text, rolle text, sql text) returns text language plpgsql as $$
declare n bigint;
begin
  begin
    perform bli(hvem);
    execute format('set local role %I', rolle);
    execute sql;
    get diagnostics n = row_count;
    execute 'reset role';
    return case when n > 0 then 'GIKK' else 'STOPPET' end;
  exception when others then
    begin execute 'reset role'; exception when others then null; end;
    return 'STOPPET';
  end;
end $$;

select rpad(navn, 46) || ' | ' || rpad(fikk, 7) || ' | ' || rpad(vil, 7) || ' | ' ||
       case when fikk = vil then 'OK' else '<<< AVVIK' end
from (
  values
    ('Leder ser bare sitt eget lags bilag',      (select teller('fotball@psi.no','select count(*) from public.bilag b join public.budsjett_perioder p on p.id = b.periode_id where p.ar = 2099'))::text, '1'),
    ('Leder ser bare sin egen tildeling',        (select teller('fotball@psi.no','select count(*) from public.budsjett_tildeling t join public.budsjett_perioder p on p.id = t.periode_id where p.ar = 2099'))::text, '1'),
    ('Admin ser alle bilag',                     (select teller('admin@psi.no','select count(*) from public.bilag b join public.budsjett_perioder p on p.id = b.periode_id where p.ar = 2099'))::text, '3'),
    ('Admin ser alle tildelinger',               (select teller('admin@psi.no','select count(*) from public.budsjett_tildeling t join public.budsjett_perioder p on p.id = t.periode_id where p.ar = 2099'))::text, '3'),
    ('Uten innlogging: ingen bilag',             (select teller(null,'select count(*) from public.bilag b join public.budsjett_perioder p on p.id = b.periode_id where p.ar = 2099'))::text, '0'),
    ('Leder fører bilag på EGEN gruppe',         proev('fotball@psi.no','authenticated', $q$insert into public.bilag (sport_slug,hva,belop,dato) values ('fotball','Baller',500,'2026-09-06')$q$), 'GIKK'),
    ('Leder fører bilag på ANNEN gruppe',        proev('fotball@psi.no','authenticated', $q$insert into public.bilag (sport_slug,hva,belop,dato) values ('padel','Snik',100,'2026-09-06')$q$), 'STOPPET'),
    ('Leder fører bilag på Felles PSI',          proev('fotball@psi.no','authenticated', $q$insert into public.bilag (sport_slug,hva,belop,dato) values (null,'Snik',100,'2026-09-06')$q$), 'STOPPET'),
    ('Leder endrer SIN EGEN tildeling',          proev('fotball@psi.no','authenticated', $q$update public.budsjett_tildeling t set innvilget=999999 from public.budsjett_perioder p where p.id=t.periode_id and p.ar=2099 and t.sport_slug='fotball'$q$), 'STOPPET'),
    ('Leder endrer et ANNET lags bilag',         proev('fotball@psi.no','authenticated', $q$update public.bilag set belop=1 where sport_slug='padel'$q$), 'STOPPET'),
    ('Leder sletter et ANNET lags bilag',        proev('fotball@psi.no','authenticated', $q$delete from public.bilag where sport_slug='padel'$q$), 'STOPPET'),
    ('Leder oppretter budsjettperiode',          proev('fotball@psi.no','authenticated', $q$insert into public.budsjett_perioder (ar,semester) values (2098,'var')$q$), 'STOPPET'),
    ('Leder flytter eget bilag til annet lag',   proev('fotball@psi.no','authenticated', $q$update public.bilag set sport_slug='padel' where sport_slug='fotball'$q$), 'STOPPET'),
    ('Admin endrer tildeling',                   proev('admin@psi.no','authenticated', $q$update public.budsjett_tildeling t set innvilget=25000 from public.budsjett_perioder p where p.id=t.periode_id and p.ar=2099 and t.sport_slug='fotball'$q$), 'GIKK'),
    ('Admin fører på Felles PSI',                proev('admin@psi.no','authenticated', $q$insert into public.bilag (sport_slug,hva,belop,dato) values (null,'Felles',100,'2026-09-06')$q$), 'GIKK'),
    ('Negativt beløp avvises',                   proev('fotball@psi.no','authenticated', $q$insert into public.bilag (sport_slug,hva,belop,dato) values ('fotball','Feil',-100,'2026-09-06')$q$), 'STOPPET'),
    ('Null kroner avvises',                      proev('fotball@psi.no','authenticated', $q$insert into public.bilag (sport_slug,hva,belop,dato) values ('fotball','Null',0,'2026-09-06')$q$), 'STOPPET'),
    ('To gjeldende perioder samtidig avvises',   proev('admin@psi.no','authenticated', $q$update public.budsjett_perioder set gjeldende=true where ar=2099$q$), 'STOPPET'),
    ('Anon kommer ikke inn i tabellen',          proev(null,'anon', $q$select count(*) from public.bilag$q$), 'STOPPET')
) as t(navn, fikk, vil);

-- ---------- Hovedbok (migrasjon 0013) ----------
-- Merket med konto «PROVE», så de kan telles uten å blande seg med de
-- virkelige linjene fra 0015.
insert into public.hovedbok_linjer (nokkel, sport_slug, avdeling, konto, bilagsnr, dato, belop) values
  ('prove|10|1', 'fotball', '10', 'PROVE', '1', '2099-01-13', 2490),
  ('prove|11|2', 'padel',   '11', 'PROVE', '2', '2099-02-13', 2695),
  ('prove|9|3',  null,      '9',  'PROVE', '3', '2099-03-13', 5000)
on conflict (nokkel) do nothing;

select rpad(navn, 46) || ' | ' || rpad(fikk, 7) || ' | ' || rpad(vil, 7) || ' | ' ||
       case when fikk = vil then 'OK' else '<<< AVVIK' end
from (
  values
    ('Leder ser bare sitt eget lags hovedbok',   (select teller('fotball@psi.no',$q$select count(*) from public.hovedbok_linjer where konto = 'PROVE'$q$))::text, '1'),
    ('Admin ser alle hovedbokslinjer',           (select teller('admin@psi.no',$q$select count(*) from public.hovedbok_linjer where konto = 'PROVE'$q$))::text, '3'),
    ('Uten innlogging: ingen hovedbok',          (select teller(null,$q$select count(*) from public.hovedbok_linjer where konto = 'PROVE'$q$))::text, '0'),
    ('Leder skriver om hva SiG har bokført',     proev('fotball@psi.no','authenticated', $q$update public.hovedbok_linjer set belop=1 where sport_slug='fotball' and konto='PROVE'$q$), 'STOPPET'),
    ('Leder importerer selv',                    proev('fotball@psi.no','authenticated', $q$insert into public.hovedbok_linjer (nokkel,sport_slug,avdeling,konto,dato,belop) values ('prove-x','fotball','10','PROVE','2099-01-01',1)$q$), 'STOPPET'),
    ('Leder endrer avdelingskoblingen',          proev('fotball@psi.no','authenticated', $q$update public.hovedbok_avdeling set sport_slug='fotball' where avdeling='5'$q$), 'STOPPET'),
    ('Admin importerer',                         proev('admin@psi.no','authenticated', $q$insert into public.hovedbok_linjer (nokkel,sport_slug,avdeling,konto,dato,belop) values ('prove-y','padel','11','PROVE','2099-01-01',1)$q$), 'GIKK'),
    ('Samme linje to ganger avvises',            proev('admin@psi.no','authenticated', $q$insert into public.hovedbok_linjer (nokkel,sport_slug,avdeling,konto,dato,belop) values ('prove|10|1','fotball','10','PROVE','2099-01-01',1)$q$), 'STOPPET')
) as t(navn, fikk, vil);

-- ---------- Bilag for inntekt (migrasjon 0016) ----------
-- Et tilskuddsbrev er også et bilag, men det er penger INN. Det skal
-- aldri trekkes fra budsjettet, og aldri kunne havne i et refusjonskrav
-- til SiG. Regelen står i databasen, ikke bare i skjemaet.
insert into public.utlegg (id, sport_slug, navn, gjelder)
values ('00000000-0000-0000-0000-000000000099', 'fotball', 'Prøveleder', 'Prøvekrav')
on conflict (id) do nothing;

insert into public.bilag (id, sport_slug, hva, belop, dato) values
  ('00000000-0000-0000-0000-000000000098', 'fotball', 'Prøvekvittering', 100, '2099-06-01')
on conflict (id) do nothing;
insert into public.bilag (id, sport_slug, type, hva, belop, dato) values
  ('00000000-0000-0000-0000-000000000097', 'fotball', 'inntekt', 'Prøvevedtak', 15000, '2099-06-01')
on conflict (id) do nothing;

select rpad(navn, 46) || ' | ' || rpad(fikk, 7) || ' | ' || rpad(vil, 7) || ' | ' ||
       case when fikk = vil then 'OK' else '<<< AVVIK' end
from (
  values
    ('Bilag uten type blir utgift',              (select type from public.bilag where id = '00000000-0000-0000-0000-000000000098'), 'utgift'),
    ('Ukjent bilagstype avvises',                proev('fotball@psi.no','authenticated', $q$insert into public.bilag (sport_slug,type,hva,belop,dato) values ('fotball','gave','Feil',100,'2099-06-01')$q$), 'STOPPET'),
    ('Leder fører inntektsbilag på egen gruppe', proev('fotball@psi.no','authenticated', $q$insert into public.bilag (sport_slug,type,hva,belop,dato) values ('fotball','inntekt','Vedtak',9000,'2099-06-01')$q$), 'GIKK'),
    ('Utgiftsbilag kan bli med i et utlegg',     proev('fotball@psi.no','authenticated', $q$update public.bilag set utlegg_id='00000000-0000-0000-0000-000000000099' where id='00000000-0000-0000-0000-000000000098'$q$), 'GIKK'),
    ('Inntektsbilag i utleggskrav avvises',      proev('fotball@psi.no','authenticated', $q$update public.bilag set utlegg_id='00000000-0000-0000-0000-000000000099' where id='00000000-0000-0000-0000-000000000097'$q$), 'STOPPET'),
    ('Utgift med utlegg kan ikke bli inntekt',   proev('fotball@psi.no','authenticated', $q$update public.bilag set type='inntekt' where id='00000000-0000-0000-0000-000000000098'$q$), 'STOPPET')
) as t(navn, fikk, vil);
