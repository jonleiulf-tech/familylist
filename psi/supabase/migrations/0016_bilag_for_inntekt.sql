-- ============================================================
-- 0016 Bilag for inntekt
--
-- Et bilag har til nå vært en utgift: en kvittering som trekkes fra
-- budsjettet. Men tilskuddsbrev og vedtak er også bilag – de
-- dokumenterer pengene som kommer INN. SSN krever dem tilbake sammen
-- med rapporten, og da må de ligge et sted der styret finner dem igjen.
--
-- Derfor et typefelt, med `utgift` som standard, slik at alt som lå der
-- fra før oppfører seg nøyaktig som før:
--
--   utgift   trekkes fra budsjettet, kan bli med i et utleggskrav
--   inntekt  trekkes ALDRI fra, og skal aldri havne i et krav til SiG
--
-- Vedtaket fra SSN datert 03.07.2026 (saksnr. 07062026) legges inn som
-- fem inntektsbilag – ett per gruppe, slik vedtaket selv deler beløpet:
--
--   Fotball     15 000        Padel       20 000
--   Volleyball  29 000        Felles PSI  20 000
--   Klatring    30 500        ---------------------
--                             til sammen 114 500
--
-- Det er nøyaktig de tildelingene 0015 la inn for høsten 2026, så
-- oversikten skal gå opp krone for krone.
--
-- SELVE PDF-FILENE LIGGER IKKE HER. Koden ligger i et åpent
-- Git-repositorium, og vedtaket har kontonummeret til SiG på seg.
-- Radene opprettes uten fil; vedtaket lastes opp i admin, og havner da
-- i den lukkede bøtta sammen med kvitteringene.
--
-- PSI SiGRun får ikke noe beløp her, og det er ikke en forglemmelse:
-- vedtaket sier selv «Får eget vedtak da det er søkt om midler via
-- ordningen fra HD, midler til Inkluderende studentmiljø». Den
-- ordningen betaler ut ETTER gjennomført aktivitet, mot rapport og
-- dokumentasjon, så beløpet finnes ikke ennå. Det som er kjent om
-- ordningen legges inn som notat på tildelingen.
--
-- Trygg å kjøre flere ganger.
-- ============================================================

-- ---------- Typefeltet ----------
alter table public.bilag add column if not exists type text not null default 'utgift';
alter table public.bilag drop constraint if exists bilag_type_gyldig;
alter table public.bilag add  constraint bilag_type_gyldig check (type in ('utgift', 'inntekt'));

-- Et inntektsbilag hører ikke hjemme i et utleggskrav. Skjemaet i admin
-- lar deg ikke velge det, men den regelen skal stå i databasen også –
-- der virker den uansett hvem som skriver.
alter table public.bilag drop constraint if exists bilag_inntekt_uten_utlegg;
alter table public.bilag add  constraint bilag_inntekt_uten_utlegg
  check (type = 'utgift' or utlegg_id is null);

create index if not exists bilag_type on public.bilag (type);

-- ---------- Vedtaket fra SSN, 03.07.2026 ----------
-- Kjøring nummer to skal ikke lage fem nye rader. Nøkkelen er det som
-- gjør raden til nettopp denne: perioden, gruppa, at det er en inntekt,
-- og datoen på vedtaket.
insert into public.bilag (periode_id, sport_slug, type, hva, belop, dato, status, bilagsnummer, notat, lagt_inn_av)
select p.id, v.slug, 'inntekt', v.hva, v.belop, date '2026-07-03', 'registrert', '07062026', v.notat, 'system'
from public.budsjett_perioder p
join (values
  ('fotball'::text, 'Tilskudd fra SSN – hall/baneleie og utstyr', 15000, 'Vedtak om studenttilskudd, saksnr. 07062026, datert 03.07.2026. Last opp vedtaket som fil her.'),
  ('volleyball', 'Tilskudd fra SSN – hall/baneleie og utstyr', 29000, 'Vedtak om studenttilskudd, saksnr. 07062026, datert 03.07.2026. Last opp vedtaket som fil her.'),
  ('klatring',   'Tilskudd fra SSN – hall/baneleie og utstyr', 30500, 'Vedtak om studenttilskudd, saksnr. 07062026, datert 03.07.2026. Last opp vedtaket som fil her.'),
  ('padel',      'Tilskudd fra SSN – hall/baneleie og utstyr', 20000, 'Vedtak om studenttilskudd, saksnr. 07062026, datert 03.07.2026. Last opp vedtaket som fil her.'),
  (null::text,    'Tilskudd fra SSN – hall/baneleie og utstyr', 20000, 'Vedtak om studenttilskudd, saksnr. 07062026, datert 03.07.2026. Gjelder Felles PSI. Last opp vedtaket som fil her.')
) as v(slug, hva, belop, notat) on true
where p.ar = 2026 and p.semester = 'host'
  and not exists (
    select 1 from public.bilag b
    where b.periode_id = p.id
      and b.sport_slug is not distinct from v.slug
      and b.type = 'inntekt'
      and b.dato = date '2026-07-03');

-- Vedtaket er fra SSN, ikke SiG. 0015 gjettet på SiG for Felles PSI,
-- før vedtaket lå på bordet.
update public.budsjett_tildeling t
set kilde = 'SSN',
    notat = 'Felles PSI. Vedtak om studenttilskudd fra SSN, saksnr. 07062026, datert 03.07.2026.'
from public.budsjett_perioder p
where t.periode_id = p.id and p.ar = 2026 and p.semester = 'host' and t.sport_slug is null;

-- ---------- SiGRun: ordningen, ikke beløpet ----------
update public.budsjett_tildeling t
set notat = 'Eget vedtak kommer. Søkt via Helsedirektoratets ordning «Inkluderende studentmiljø» (SSN, brev av 16.04.2026): søknadsfrist 15. juni 2026, én søknad per aktivitet, og tilskuddet utbetales først etter gjennomført aktivitet mot rapport og spesifiserte bilag. Kontoutskrift og kortterminalutskrift godkjennes ikke.'
from public.budsjett_perioder p
where t.periode_id = p.id and p.ar = 2026 and p.semester = 'host' and t.sport_slug = 'sigrun';
