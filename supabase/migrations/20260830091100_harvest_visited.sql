-- Blindveier i høstingen: sider som er besøkt men IKKE ga en oppskrift
-- (kategorisider, artikler). Uten denne hukommelsen tygger hver kjøring
-- på de samme sidene om igjen. Radene «foreldes» etter 14 dager, slik at
-- kategorisider som får nye oppskrifter blir sett på igjen jevnlig.
--
-- Kun maskineriet (hemmelig nøkkel, forbi RLS) leser og skriver her —
-- ingen policies med vilje.

create table if not exists public.harvest_visited (
  source_id  text not null,
  url        text not null,
  visited_at timestamptz not null default now(),
  primary key (source_id, url)
);

alter table public.harvest_visited enable row level security;
