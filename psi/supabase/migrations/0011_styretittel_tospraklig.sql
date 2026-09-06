-- ============================================================
-- 0011 Tittelen i styret på to språk
--
-- members.title var ren tekst, så «Leder, PSI» sto på norsk også på
-- /en. Kolonnen blir jsonb { nb, en }, slik resten av innholdet er.
-- Det som ligger der i dag flyttes til nb; en kan fylles inn etterpå.
-- Kjøres om igjen uten skade.
-- ============================================================

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'members'
      and column_name = 'title' and data_type <> 'jsonb'
  ) then
    -- Visningen låser kolonnetypen, så den må vekk først.
    drop view if exists public.public_board;

    alter table public.members
      alter column title type jsonb
      using case
        when title is null or btrim(title) = '' then null
        else jsonb_build_object('nb', title, 'en', '')
      end;
  end if;
end $$;

-- Visningen bygges opp igjen med samme kolonner som før.
create or replace view public.public_board
with (security_invoker = false) as
  select m.id, m.name, m.title, m.role::text as role, m.sport_slug, m.sort_order
  from public.members m
  where m.show_public and m.name is not null and m.role in ('psi_admin', 'group_leader');
grant select on public.public_board to anon, authenticated;
