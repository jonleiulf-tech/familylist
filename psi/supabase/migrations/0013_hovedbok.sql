-- ============================================================
-- 0013 Hovedbok: import av kontoutskriften fra SiG
--
-- Michael sender «Kontoutskrift hovedbok, pr. avdeling» (Report (4).pdf)
-- med det som faktisk er bokført på konto 6565 Undergrupper. Den lastes
-- opp i admin og blir liggende her, så forbruket oppdaterer seg selv.
--
--   hovedbok_avdeling   hvilket avdelingsnummer som er hvilken gruppe.
--                       Står ingen steder i rapporten; settes én gang.
--   hovedbok_import     én rad per opplastet rapport, til historikk
--   hovedbok_linjer     bokføringslinjene
--
-- IMPORTEN SKAL KUNNE KJØRES OM IGJEN. Rapporten fra august inneholder
-- alt som sto i den fra april. Nøkkelen på hver linje er derfor stabil
-- for den samme bokføringslinja, og unik, så januar ikke telles to
-- ganger når man importerer begge.
--
-- Trygg å kjøre flere ganger.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Avdeling → gruppe ----------
create table if not exists public.hovedbok_avdeling (
  avdeling   text primary key,
  -- null = Felles PSI, som ellers i økonomien.
  sport_slug text,
  notat      text,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- ---------- Én rad per opplastet rapport ----------
create table if not exists public.hovedbok_import (
  id          uuid primary key default gen_random_uuid(),
  filnavn     text,
  ar          int,
  konto       text,
  -- Summen rapporten selv oppgir. Stemmer den ikke med linjene, har vi
  -- lest feil, og importen skal ikke ha gått gjennom i det hele tatt.
  oppgitt_sum numeric(12,2),
  lest_sum    numeric(12,2),
  antall      int not null default 0,
  nye         int not null default 0,
  importert_av text,
  created_at  timestamptz not null default now()
);

-- ---------- Bokføringslinjene ----------
create table if not exists public.hovedbok_linjer (
  id         uuid primary key default gen_random_uuid(),
  -- Stabil nøkkel for den samme bokføringslinja på tvers av rapporter.
  nokkel     text not null unique,
  import_id  uuid references public.hovedbok_import(id) on delete set null,
  periode_id uuid references public.budsjett_perioder(id) on delete set null,
  sport_slug text,
  avdeling   text not null,
  konto      text,
  bilagsnr   text,
  dato       date not null,
  periode    int,
  tekst      text,
  mvakode    text,
  belop      numeric(12,2) not null,
  -- Bilaget gruppa selv har registrert for det samme kjøpet, når noen har
  -- koblet dem. Da telles beløpet én gang, ikke to.
  bilag_id   uuid references public.bilag(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by text
);
create index if not exists hovedbok_linjer_gruppe on public.hovedbok_linjer (sport_slug, dato);
create index if not exists hovedbok_linjer_periode on public.hovedbok_linjer (periode_id);
create index if not exists hovedbok_linjer_bilag on public.hovedbok_linjer (bilag_id);

-- Et bilag skal ikke kunne kobles til to hovedbokslinjer.
create unique index if not exists hovedbok_ett_bilag
  on public.hovedbok_linjer (bilag_id) where bilag_id is not null;

drop trigger if exists hovedbok_avdeling_touch on public.hovedbok_avdeling;
drop trigger if exists hovedbok_linjer_touch   on public.hovedbok_linjer;
create trigger hovedbok_avdeling_touch before insert or update on public.hovedbok_avdeling for each row execute function public.touch();
create trigger hovedbok_linjer_touch   before insert or update on public.hovedbok_linjer   for each row execute function public.touch();

-- ---------- Rettigheter ----------
do $$
declare t text;
begin
  foreach t in array array['hovedbok_avdeling', 'hovedbok_import', 'hovedbok_linjer'] loop
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

alter table public.hovedbok_avdeling enable row level security;
alter table public.hovedbok_import   enable row level security;
alter table public.hovedbok_linjer   enable row level security;

-- Koblingen og importloggen er styrets sak. Alle med tilgang kan lese
-- koblingen – uten den gir en linje i egen gruppe ingen mening.
drop policy if exists hb_avd_read  on public.hovedbok_avdeling;
drop policy if exists hb_avd_write on public.hovedbok_avdeling;
create policy hb_avd_read  on public.hovedbok_avdeling for select to authenticated
  using (exists (select 1 from public.members m where m.email = public.me_email()));
create policy hb_avd_write on public.hovedbok_avdeling for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists hb_imp_read  on public.hovedbok_import;
drop policy if exists hb_imp_write on public.hovedbok_import;
create policy hb_imp_read  on public.hovedbok_import for select to authenticated
  using (exists (select 1 from public.members m where m.email = public.me_email()));
create policy hb_imp_write on public.hovedbok_import for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Linjene følger samme regel som resten av økonomien: gruppelederen ser
-- sine egne. Men bare admin fører dem inn – de kommer fra regnskapet,
-- ikke fra gruppa, og en leder skal ikke kunne skrive om hva SiG har
-- bokført på dem.
drop policy if exists hb_lin_read   on public.hovedbok_linjer;
drop policy if exists hb_lin_write  on public.hovedbok_linjer;
drop policy if exists hb_lin_koble  on public.hovedbok_linjer;
create policy hb_lin_read  on public.hovedbok_linjer for select to authenticated
  using (public.kan_okonomi(sport_slug));
create policy hb_lin_write on public.hovedbok_linjer for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- Avdelingene vi allerede kjenner ----------
-- Utledet av leverandørene i rapportene fra 2026: Høyt Under Taket er
-- klatring, Cage Grenland er padel, Skien Fritidspark er volleyball.
-- Kan endres i admin; dette er bare et utgangspunkt.
insert into public.hovedbok_avdeling (avdeling, sport_slug, notat) values
  ('10', 'fotball',    'Porsgrunn kommune (halleie), Beha Sport, Telemark bedriftsidrettskrets'),
  ('2',  'volleyball', 'Skien Fritidspark'),
  ('5',  'klatring',   'Høyt Under Taket Skien'),
  ('11', 'padel',      'Cage Grenland'),
  ('9',  null,         'Felles PSI: drakter fra Beha Sport og Protektiv')
on conflict (avdeling) do nothing;
