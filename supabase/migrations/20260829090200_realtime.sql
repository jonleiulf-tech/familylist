-- Realtime: mann og kone ser hverandres endringer umiddelbart.
-- Abonnement settes opp i appen (src/hooks/useShoppingItems.js m.fl.).

-- supabase_realtime-publikasjonen finnes fra før i et Supabase-prosjekt.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

-- Legg til tabellene som skal kringkastes. add_table feiler hvis tabellen
-- allerede er med, derfor sjekken mot pg_publication_tables.
do $$
declare t text;
begin
  foreach t in array array['shopping_items','custom_lists','meal_plan','meals'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I;', t);
    end if;
  end loop;
end $$;

-- REPLICA IDENTITY FULL gjør at DELETE- og UPDATE-hendelser inneholder de
-- gamle verdiene. Uten dette får klienten bare primærnøkkelen ved sletting,
-- og vi kan ikke vise «Marte fjernet Melk» eller merge riktig.
alter table public.shopping_items replica identity full;
alter table public.custom_lists   replica identity full;
alter table public.meal_plan      replica identity full;
alter table public.meals          replica identity full;
