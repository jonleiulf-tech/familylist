-- Stemmer tallene fra migrasjon 0015 med regnearket og hovedbokrapporten?
--
-- Fasitene er hentet rett fra kildene:
--   168 323   «Totalt vår 2026» i Budsjett PSI 2026 – justert.xlsx
--   114 500   «Totalt søknadsbeløp høst 2026», samme fil
--   169 050   «Innvilget sum» vår (SSN 141 550 + SiG 27 500)
--   135 043,17 «Sum konto 6565» i Report (4).pdf
--   114 500   «Innvilget tilskudd utgjør» i vedtaket fra SSN av
--             03.07.2026, saksnr. 07062026 (migrasjon 0016)
\set ON_ERROR_STOP on
\pset pager off
\t on

select rpad(hva, 46) || ' | ' || rpad(fikk::text, 12) || ' | ' || rpad(vil::text, 12) || ' | ' ||
       case when fikk = vil then 'OK' else '<<< AVVIK' end
from (
  values
    ('Budsjettert vår 2026',
      (select coalesce(sum(b.budsjettert),0) from public.budsjett_poster b
        join public.budsjett_perioder p on p.id=b.periode_id where p.ar=2026 and p.semester='var'), 168323::numeric),
    ('Budsjettert høst 2026',
      (select coalesce(sum(b.budsjettert),0) from public.budsjett_poster b
        join public.budsjett_perioder p on p.id=b.periode_id where p.ar=2026 and p.semester='host'), 114500::numeric),
    ('Innvilget vår 2026 (uten overført)',
      (select coalesce(sum(t.innvilget),0) from public.budsjett_tildeling t
        join public.budsjett_perioder p on p.id=t.periode_id where p.ar=2026 and p.semester='var'), 169050::numeric),
    ('Overført fra 2025 (fotball)',
      (select coalesce(sum(t.overfort),0) from public.budsjett_tildeling t
        join public.budsjett_perioder p on p.id=t.periode_id where p.ar=2026), 6625::numeric),
    ('Bokført 2026, hele rapporten',
      (select coalesce(sum(belop),0) from public.hovedbok_linjer where konto='6565'), 135043.17::numeric),
    ('Antall bokføringslinjer',
      (select count(*) from public.hovedbok_linjer where konto='6565'), 43::numeric),
    ('Grupper med tildeling i 2026',
      (select count(*) from public.budsjett_tildeling t
        join public.budsjett_perioder p on p.id=t.periode_id where p.ar=2026), 12::numeric),
    -- Kvitteringer legges inn framover, ikke av et seed. Regnearkets
    -- kolonne «Faktisk beløp» ville blitt talt to ganger mot hovedboken.
    ('Ingen utgiftsbilag lagt inn av seedet',
      (select count(*) from public.bilag b join public.budsjett_perioder p on p.id=b.periode_id
        where p.ar=2026 and b.type='utgift'), 0::numeric),
    -- Vedtaket fra SSN, 03.07.2026: fem inntektsbilag, ett per gruppe.
    ('Inntektsbilag fra vedtaket 07062026',
      (select count(*) from public.bilag b join public.budsjett_perioder p on p.id=b.periode_id
        where p.ar=2026 and p.semester='host' and b.type='inntekt'), 5::numeric),
    ('Sum inntektsbilag høst 2026',
      (select coalesce(sum(b.belop),0) from public.bilag b join public.budsjett_perioder p on p.id=b.periode_id
        where p.ar=2026 and p.semester='host' and b.type='inntekt'), 114500::numeric),
    -- Vedtaket deler beløpet på nøyaktig de gruppene som fikk tildeling.
    ('Inntektsbilag = tildelt høst 2026',
      (select coalesce(sum(b.belop),0) from public.bilag b join public.budsjett_perioder p on p.id=b.periode_id
        where p.ar=2026 and p.semester='host' and b.type='inntekt'),
      (select coalesce(sum(t.innvilget),0) from public.budsjett_tildeling t
        join public.budsjett_perioder p on p.id=t.periode_id where p.ar=2026 and p.semester='host')),
    ('SiGRun høst 2026 uten beløp – eget vedtak kommer',
      (select coalesce(sum(t.innvilget),0) from public.budsjett_tildeling t
        join public.budsjett_perioder p on p.id=t.periode_id
        where p.ar=2026 and p.semester='host' and t.sport_slug='sigrun'), 0::numeric)
) as t(hva, fikk, vil);
