-- ============================================================
-- 0012 Økonomi: budsjett, bilag og utlegg
--
-- Erstatter regnearket «Budsjett PSI 2026 – justert.xlsx». Modellen er
-- hentet rett ut av det, fane for fane:
--
--   budsjett_perioder    Vår 2026, Høst 2026 …
--   budsjett_tildeling   én per gruppe per periode: innvilget fra
--                        SSN/SiG, pluss det som er overført fra i fjor
--   budsjett_poster      budsjettlinjene (Aktivitet, Beskrivelse, sum)
--   bilag                fanen «Kvitteringer», med fila vedlagt
--   utlegg               refusjonskravet som sendes SiG, med bilagene i
--
-- «Felles PSI» er en gruppe uten sport_slug, som nederst i regnearket.
--
-- Tilgang: gruppeledere ser og fører sin egen gruppe. PSI-admin ser og
-- fører alt, inkludert Felles PSI. Bilagsfilene ligger i en LUKKET
-- bøtte – kvitteringer har navn, beløp og av og til kontonummer på seg,
-- og har ingenting på et offentlig nettsted å gjøre.
--
-- Trygg å kjøre flere ganger.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Perioder ----------
create table if not exists public.budsjett_perioder (
  id         uuid primary key default gen_random_uuid(),
  ar         int  not null check (ar between 2000 and 2100),
  semester   text not null check (semester in ('var', 'host')),
  -- Perioden det føres på nå. Bare én om gangen; håndheves under.
  gjeldende  boolean not null default false,
  notat      text,
  created_at timestamptz not null default now(),
  unique (ar, semester)
);

create unique index if not exists budsjett_en_gjeldende
  on public.budsjett_perioder ((gjeldende)) where gjeldende;

-- ---------- Tildeling per gruppe ----------
create table if not exists public.budsjett_tildeling (
  id         uuid primary key default gen_random_uuid(),
  periode_id uuid not null references public.budsjett_perioder(id) on delete cascade,
  sport_slug text,                                  -- null = Felles PSI
  innvilget  numeric(12,2) not null default 0,
  overfort   numeric(12,2) not null default 0,      -- til gode fra i fjor
  kilde      text,                                  -- SSN, SiG, egen søknad …
  notat      text,
  updated_at timestamptz not null default now(),
  updated_by text,
  unique nulls not distinct (periode_id, sport_slug)
);

-- ---------- Budsjettlinjer ----------
create table if not exists public.budsjett_poster (
  id          uuid primary key default gen_random_uuid(),
  periode_id  uuid not null references public.budsjett_perioder(id) on delete cascade,
  sport_slug  text,
  aktivitet   text not null,
  beskrivelse text,
  budsjettert numeric(12,2) not null default 0,
  kommentar   text,
  sort_order  int not null default 100,
  updated_at  timestamptz not null default now(),
  updated_by  text
);
create index if not exists budsjett_poster_periode on public.budsjett_poster (periode_id, sport_slug);

-- ---------- Utlegg (refusjonskrav til SiG) ----------
create table if not exists public.utlegg (
  id           uuid primary key default gen_random_uuid(),
  sport_slug   text,
  navn         text not null,
  adresse      text,
  kontonummer  text,
  gjelder      text,                                -- «Utlegg for PSI Fotball»
  -- Krysset i SiG-skjemaet: drift, styre eller undergruppe.
  type         text not null default 'undergruppe' check (type in ('drift', 'styre', 'undergruppe')),
  status       text not null default 'utkast' check (status in ('utkast', 'sendt', 'refundert')),
  sendt_dato   date,
  opprettet_av text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   text
);

-- ---------- Bilag ----------
create table if not exists public.bilag (
  id           uuid primary key default gen_random_uuid(),
  periode_id   uuid references public.budsjett_perioder(id) on delete set null,
  sport_slug   text,
  post_id      uuid references public.budsjett_poster(id) on delete set null,
  utlegg_id    uuid references public.utlegg(id) on delete set null,
  hva          text not null,
  belop        numeric(12,2) not null,
  dato         date not null,
  -- Fila i bøtta «bilag». Kan være tom: et bilag kan registreres før
  -- kvitteringen er skannet.
  fil_path     text,
  fil_navn     text,
  mime         text,
  storrelse    int,
  -- registrert teller mot budsjettet med en gang. Bare avvist gjør ikke.
  status       text not null default 'registrert' check (status in ('registrert', 'sendt', 'refundert', 'avvist')),
  bilagsnummer text,
  notat        text,
  lagt_inn_av  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   text
);
create index if not exists bilag_periode on public.bilag (periode_id, sport_slug);
create index if not exists bilag_utlegg  on public.bilag (utlegg_id);

-- Beløpet skal være et beløp. Null kroner er en feilregistrering, og
-- negative beløp hører hjemme som en egen inntektslinje, ikke som bilag.
alter table public.bilag drop constraint if exists bilag_belop_positivt;
alter table public.bilag add  constraint bilag_belop_positivt check (belop > 0);

drop trigger if exists tildeling_touch on public.budsjett_tildeling;
drop trigger if exists poster_touch    on public.budsjett_poster;
drop trigger if exists bilag_touch     on public.bilag;
drop trigger if exists utlegg_touch    on public.utlegg;
create trigger tildeling_touch before insert or update on public.budsjett_tildeling for each row execute function public.touch();
create trigger poster_touch    before insert or update on public.budsjett_poster    for each row execute function public.touch();
create trigger bilag_touch     before insert or update on public.bilag              for each row execute function public.touch();
create trigger utlegg_touch    before insert or update on public.utlegg             for each row execute function public.touch();

-- ---------- Rettigheter på tabellnivå ----------
-- Supabase deler ut disse automatisk til nye tabeller i public, anon
-- inkludert. For økonomien sier vi det heller selv: her ligger navn,
-- beløp og kontonummer, og da skal det stå svart på hvitt i fila hvem
-- som når tabellen i det hele tatt. RLS avgjør radene; dette avgjør om
-- man kommer inn døra.
do $$
declare t text;
begin
  foreach t in array array['budsjett_perioder', 'budsjett_tildeling', 'budsjett_poster', 'bilag', 'utlegg'] loop
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- ---------- RLS ----------
-- Ingenting her er offentlig. anon får ikke lese noe av dette.
alter table public.budsjett_perioder  enable row level security;
alter table public.budsjett_tildeling enable row level security;
alter table public.budsjett_poster    enable row level security;
alter table public.bilag              enable row level security;
alter table public.utlegg             enable row level security;

-- Hvem som får se og føre på en gruppe. null (Felles PSI) er admin sitt.
create or replace function public.kan_okonomi(slug text)
returns boolean language sql stable security definer set search_path = public as $$
  select case when slug is null then public.is_admin() else public.can_manage_sport(slug) end;
$$;
revoke all on function public.kan_okonomi(text) from public;
grant execute on function public.kan_okonomi(text) to authenticated;

-- Perioder leses av alle med tilgang; bare admin oppretter dem.
drop policy if exists perioder_read  on public.budsjett_perioder;
drop policy if exists perioder_write on public.budsjett_perioder;
create policy perioder_read  on public.budsjett_perioder for select to authenticated
  using (public.is_admin() or exists (select 1 from public.members m where m.email = public.me_email()));
create policy perioder_write on public.budsjett_perioder for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Tildelingen bestemmes av styret. Lederen ser sin egen, men setter den ikke.
drop policy if exists tildeling_read  on public.budsjett_tildeling;
drop policy if exists tildeling_write on public.budsjett_tildeling;
create policy tildeling_read  on public.budsjett_tildeling for select to authenticated
  using (public.kan_okonomi(sport_slug));
create policy tildeling_write on public.budsjett_tildeling for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Budsjettlinjer og bilag fører gruppa selv.
drop policy if exists poster_read  on public.budsjett_poster;
drop policy if exists poster_write on public.budsjett_poster;
create policy poster_read  on public.budsjett_poster for select to authenticated
  using (public.kan_okonomi(sport_slug));
create policy poster_write on public.budsjett_poster for all to authenticated
  using (public.kan_okonomi(sport_slug)) with check (public.kan_okonomi(sport_slug));

drop policy if exists bilag_read  on public.bilag;
drop policy if exists bilag_write on public.bilag;
create policy bilag_read  on public.bilag for select to authenticated
  using (public.kan_okonomi(sport_slug));
create policy bilag_write on public.bilag for all to authenticated
  using (public.kan_okonomi(sport_slug)) with check (public.kan_okonomi(sport_slug));

drop policy if exists utlegg_read  on public.utlegg;
drop policy if exists utlegg_write on public.utlegg;
create policy utlegg_read  on public.utlegg for select to authenticated
  using (public.kan_okonomi(sport_slug));
create policy utlegg_write on public.utlegg for all to authenticated
  using (public.kan_okonomi(sport_slug)) with check (public.kan_okonomi(sport_slug));

-- ---------- Bilagsfilene ----------
-- LUKKET bøtte. Kvitteringer har navn, beløp og av og til kontonummer på
-- seg. Filene hentes med signerte lenker som varer noen minutter.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bilag', 'bilag', false, 26214400,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 26214400,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];

-- Stien er <gruppe>/<filnavn>, der «psi» er Felles PSI.
drop policy if exists bilag_files_read   on storage.objects;
drop policy if exists bilag_files_insert on storage.objects;
drop policy if exists bilag_files_update on storage.objects;
drop policy if exists bilag_files_delete on storage.objects;
create policy bilag_files_read on storage.objects for select to authenticated
  using (bucket_id = 'bilag' and (
    (split_part(name, '/', 1) = 'psi' and public.is_admin()) or
    (split_part(name, '/', 1) <> 'psi' and public.can_manage_sport(split_part(name, '/', 1)))));
create policy bilag_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'bilag' and (
    (split_part(name, '/', 1) = 'psi' and public.is_admin()) or
    (split_part(name, '/', 1) <> 'psi' and public.can_manage_sport(split_part(name, '/', 1)))));
create policy bilag_files_update on storage.objects for update to authenticated
  using (bucket_id = 'bilag' and (
    (split_part(name, '/', 1) = 'psi' and public.is_admin()) or
    (split_part(name, '/', 1) <> 'psi' and public.can_manage_sport(split_part(name, '/', 1)))));
create policy bilag_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'bilag' and (
    (split_part(name, '/', 1) = 'psi' and public.is_admin()) or
    (split_part(name, '/', 1) <> 'psi' and public.can_manage_sport(split_part(name, '/', 1)))));

-- ---------- Periodene for 2026 ----------
insert into public.budsjett_perioder (ar, semester, gjeldende)
values (2026, 'var', false)
on conflict (ar, semester) do nothing;
insert into public.budsjett_perioder (ar, semester, gjeldende)
values (2026, 'host', true)
on conflict (ar, semester) do nothing;
