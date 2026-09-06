-- ============================================================
-- Hvilke migrasjoner er kjørt?
--
-- Lim hele fila inn i Supabase → SQL Editor og trykk Run. Den endrer
-- ingenting – den bare ser etter tabellene og kolonnene hver migrasjon
-- lager, og sier hvilke som mangler.
--
-- 0006 og 0008 endrer bare innhold (treningstider), ikke strukturen, så
-- de kan ikke sjekkes på denne måten. De står som «kan ikke sjekkes».
-- ============================================================

with sjekk(nr, hva, finnes) as (
  select '0001', 'Grunnlag: content og sports',
         to_regclass('public.sports') is not null
  union all select '0002', 'Roller, nyheter, kalender og bilder',
         to_regclass('public.members') is not null
  union all select '0003', 'Spond: arrangementer',
         exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='events' and column_name='external_id')
  union all select '0004', 'Spond: innlegg som nyheter',
         exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='news' and column_name='external_id')
  union all select '0005', 'Spond: bilder',
         exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='media' and column_name='source')
  union all select '0007', 'Bildeutsnitt (focus_x / focus_y)',
         exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='media' and column_name='focus_x')
  union all select '0009', 'Hovedgalleri (show_in_main)',
         exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='media' and column_name='show_in_main')
  union all select '0010', 'Bildetekst (media.description)',
         exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='media' and column_name='description')
  union all select '0011', 'Styretitler på to språk (members.title som jsonb)',
         exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='members' and column_name='title' and data_type='jsonb')
  union all select '0012', 'Økonomi: budsjett, bilag og utlegg',
         to_regclass('public.bilag') is not null
  union all select '0013', 'Hovedbok: import fra regnskapet',
         to_regclass('public.hovedbok_linjer') is not null
  union all select '0014', 'Avdelingslista fra SiG',
         exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='hovedbok_avdeling' and column_name='koblet')
)
select nr as migrasjon,
       case when finnes then 'kjørt' else '>>> MANGLER' end as status,
       hva
from sjekk
union all
select '0006', 'kan ikke sjekkes', 'Plan 2026/27 – endrer bare treningstider'
union all
select '0008', 'kan ikke sjekkes', 'Volleyball fredag – endrer bare treningstider'
order by 1;
