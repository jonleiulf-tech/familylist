-- Fremgangsmåte på middager: familien kan ha BÅDE en nett-oppskrift
-- (lenke til TINE, REMA …) og sin egen tekst. Dette feltet styrer hvilken
-- som vises først — «egen» eller «kilde».
alter table public.meals
  add column if not exists instructions_default text not null default 'egen'
    check (instructions_default in ('egen', 'kilde'));
