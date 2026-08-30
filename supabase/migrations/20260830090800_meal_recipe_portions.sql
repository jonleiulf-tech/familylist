-- Fremgangsmåte på middager + familieporsjoner og gjester per middag.
--
-- 1) meals får fremgangsmåte: enten familiens EGEN tekst (instructions —
--    f.eks. mormors lasagneoppskrift), eller en lenke ut til kilden
--    (instructions_url + source_label) for oppskrifter fra kokeboka.
--    Eksterne fremgangsmåter kopieres ALDRI inn — vi lenker ut.
--    base_servings sier hvor mange porsjoner mengdene i ingredients er
--    beregnet for (null = ukjent, da skaleres det aldri).
--
-- 2) Porsjonsprofilen bruker households.adults/children som allerede
--    finnes (familiestørrelsen fra listeinnstillingene): «spiser som
--    voksen» = 1 porsjon, «spiser mindre» = en halv. Storebror med voksen
--    appetitt telles som voksen. Ingen nye kolonner trengs.
--
-- 3) meal_plan får guest_portions: ekstra porsjoner for ÉN bestemt middag
--    (bestemor på søndagsbesøk = +1) — resten av uken påvirkes ikke.
--
-- Ingen nye RLS-policyer trengs: eksisterende policyer på meals, meal_plan
-- og households dekker de nye kolonnene (husholdningsmedlemmer kan lese og
-- oppdatere sitt eget).

alter table public.meals
  add column if not exists instructions     text,
  add column if not exists instructions_url text,
  add column if not exists source_label     text,
  add column if not exists base_servings    numeric(4,1);

alter table public.meal_plan
  add column if not exists guest_portions numeric(4,1) not null default 0;

-- Tilbakemeldinger kan nå også være ØNSKER om forbedringer, ikke bare feil.
-- Knappen ligger i headeren på alle faner + i profilmenyen; alt havner i
-- adminpanelet som før.
alter table public.app_feedback
  add column if not exists kind text not null default 'feil'
    check (kind in ('feil', 'ønske'));
