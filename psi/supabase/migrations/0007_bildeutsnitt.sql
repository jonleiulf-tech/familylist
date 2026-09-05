-- 0007: fokuspunkt på bilder.
--
-- Kortene er 16:9 og toppbildet 21:9, mens bildene som lastes opp er alt
-- mulig. Uten et fokuspunkt beskjæres alt mot midten, og da forsvinner
-- laget nederst i bildet eller klatreren oppe i veggen.
--
-- Vi beskjærer ikke fila. Vi lagrer hvor i bildet det viktige er, i
-- prosent, og lar nettleseren flytte utsnittet dit (object-position).
-- Da kan valget gjøres om igjen når som helst, og samme fil brukes til
-- både kort, toppbilde og galleri.
--
-- 50/50 er midten, altså slik det var før.
-- Kjøres på nytt uten skade.

alter table public.media add column if not exists focus_x smallint not null default 50;
alter table public.media add column if not exists focus_y smallint not null default 50;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'media_focus_range') then
    alter table public.media add constraint media_focus_range
      check (focus_x between 0 and 100 and focus_y between 0 and 100);
  end if;
end $$;
