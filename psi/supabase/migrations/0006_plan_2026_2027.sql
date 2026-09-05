-- 0006: PSI-planen fram til sommeren 2027.
--
-- Kilde: regnearket «PSI SSN kalender» (fanen «SSN - anbefalt»), kontrollert
-- mot hallbookingene: bekreftelse 1153617 for Skienshallen og
-- Porsgrunn Arena-oversikten for fredagene.
--
-- To deler:
--   1. sports.data->schedule settes lik planen i src/data/psi.js, inkludert
--      until_date og skip_dates (datoene uten hall, ferie og eksamen).
--   2. SiGRUN sine tre enkeltarrangementer legges inn med source = 'plan'.
--
-- Spond er alltid fasiten. Kommer det et Spond-arrangement for gruppa samme
-- dag, viker både den planlagte økta og den planlagte raden for den.
-- Kjøres på nytt uten skade.

update public.sports set data = jsonb_set(data, '{schedule}', '[{"day":5,"from":"18:00","to":"20:00","venue":"Porsgrunn Arena","from_date":"2026-09-11","until_date":"2027-05-21","skip_dates":["2026-09-25","2026-12-25","2027-01-01","2027-03-12","2027-03-26","2027-04-16"],"note":{"nb":"Innendørs, pulje 1 · maks 21","en":"Indoors, group 1 · max 21"}},{"day":5,"from":"20:00","to":"22:00","venue":"Porsgrunn Arena","from_date":"2026-09-11","until_date":"2027-05-21","skip_dates":["2026-09-25","2026-12-25","2027-01-01","2027-03-12","2027-03-26","2027-04-16"],"note":{"nb":"Innendørs, pulje 2 · maks 21","en":"Indoors, group 2 · max 21"}},{"day":2,"from":"20:30","to":"22:00","venue":"Porsgrunn Arena","from_date":"2026-09-15","until_date":"2027-05-25","note":{"nb":"Innendørs · maks 21","en":"Indoors · max 21"}}]'::jsonb, true) where slug = 'fotball';
update public.sports set data = jsonb_set(data, '{schedule}', '[{"day":3,"from":"19:30","to":"22:00","venue":"Skien Fritidspark","from_date":"2026-09-09","until_date":"2027-05-26","skip_dates":["2026-09-30","2026-10-07","2026-10-14","2026-12-30","2027-01-13","2027-02-03","2027-02-24","2027-03-17","2027-03-24"],"note":{"nb":"Skienshallen, bane C","en":"Skienshallen, court C"}},{"day":5,"from":"20:30","to":"22:00","venue":"Porsgrunn Arena","from_date":"2026-09-11","until_date":"2027-05-21","skip_dates":["2026-09-25","2026-12-25","2027-01-01","2027-03-12","2027-03-26","2027-04-16"]}]'::jsonb, true) where slug = 'volleyball';
update public.sports set data = jsonb_set(data, '{schedule}', '[{"day":2,"from":"18:00","to":"20:00","venue":"Høyt Under Taket, Skien","from_date":"2026-09-01","until_date":"2027-05-25","note":{"nb":"Maks 20","en":"Max 20"}}]'::jsonb, true) where slug = 'klatring';
update public.sports set data = jsonb_set(data, '{schedule}', '[{"day":2,"from":"19:30","to":"21:00","venue":"Cage Grenland","from_date":"2026-09-01","until_date":"2026-12-17","note":{"nb":"Maks 14","en":"Max 14"}},{"day":4,"from":"17:30","to":"19:00","venue":"Cage Grenland","from_date":"2026-09-03","until_date":"2026-12-17","note":{"nb":"Maks 14","en":"Max 14"}}]'::jsonb, true) where slug = 'padel';
update public.sports set data = jsonb_set(data, '{schedule}', '[]'::jsonb, true) where slug = 'sigrun';

-- SiGRUN: tre enkeltløp fra planen.
insert into public.events (sport_slug, kind, title, description, starts_at, ends_at, venue, link_url, status, source, external_id)
select 'sigrun', 'event',
  '{"nb":"SSN-løpet Porsgrunn","en":"The SSN run, Porsgrunn"}'::jsonb,
  '{"nb":"Vi møtes utenfor FABRIKKEN Studenthus kl. 15:45. Selve løpet starter kl. 16:00.","en":"We meet outside FABRIKKEN Studenthus at 15:45. The run itself starts at 16:00."}'::jsonb,
  timestamptz '2026-09-30 15:45 Europe/Oslo', timestamptz '2026-09-30 17:00 Europe/Oslo',
  'Utenfor FABRIKKEN Studenthus', 'https://www.ssn.no/kalenderen/porsgrunn/2026-09-30/ssn-lopet-porsgrunn',
  'published', 'plan', 'plan-sigrun-ssn-lopet-2026'
where not exists (select 1 from public.events where external_id = 'plan-sigrun-ssn-lopet-2026');

insert into public.events (sport_slug, kind, title, description, starts_at, ends_at, venue, link_url, status, source, external_id)
select 'sigrun', 'event',
  '{"nb":"Geiteryggen-løpet 2026","en":"The Geiteryggen run 2026"}'::jsonb,
  '{"nb":"Felles PSI SiGRun-deltakelse. Oppmøte 17:30, offisiell løpsstart fra kl. 18:00.","en":"PSI SiGRun takes part together. Meet at 17:30, official start from 18:00."}'::jsonb,
  timestamptz '2026-11-24 17:30 Europe/Oslo', timestamptz '2026-11-24 20:00 Europe/Oslo',
  'Skien lufthavn, Geiteryggen', 'https://telemark.bedriftsidretten.no/next/events/p/1000148472/geiteryggen-loepet-2026',
  'published', 'plan', 'plan-sigrun-geiteryggen-2026'
where not exists (select 1 from public.events where external_id = 'plan-sigrun-geiteryggen-2026');

insert into public.events (sport_slug, kind, title, description, starts_at, ends_at, venue, link_url, status, source, external_id)
select 'sigrun', 'event',
  '{"nb":"Nyttårsløpet i Porsgrunn","en":"The New Year run in Porsgrunn"}'::jsonb,
  '{"nb":"Felles PSI SiGRun-deltakelse på Nyttårsløpet. Eksakt møtested står i Spond.","en":"PSI SiGRun takes part together in the New Year run. The exact meeting point is in Spond."}'::jsonb,
  timestamptz '2026-12-31 11:45 Europe/Oslo', timestamptz '2026-12-31 13:30 Europe/Oslo',
  'Porsgrunn – se Spond', null,
  'published', 'plan', 'plan-sigrun-nyttarslopet-2026'
where not exists (select 1 from public.events where external_id = 'plan-sigrun-nyttarslopet-2026');

create index if not exists events_plan on public.events (source) where source = 'plan';
