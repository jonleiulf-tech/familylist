-- ============================================================
-- psiusn.no: database for redigering i /admin. VALGFRITT.
-- Kjøres av `npm run db` (psi/scripts/db.ps1), eller lim fila inn i
-- Supabase → SQL Editor → Run. Trygg å kjøre flere ganger.
--
-- Tre tabeller:
--   admins   hvem som kan redigere (e-post)
--   content  site, organization, stats, partners (én jsonb-rad per nøkkel)
--   sports   én rad per idrettsgruppe, samme form som src/data/psi.js
--
-- Publikum leser alt. Bare admins skriver. Ingen persondata utover
-- ledernavn og gruppe-e-poster som allerede er offentlige.
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.admins (
  email      text primary key check (email = lower(email) and length(email) between 5 and 200),
  added_by   text,
  created_at timestamptz not null default now()
);

-- security definer: RLS på admins spør denne, så den må lese uten RLS.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admins
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, anon;

create table if not exists public.content (
  key        text primary key check (key in ('site', 'organization', 'stats', 'partners')),
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists public.sports (
  slug       text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  sort_order int not null default 10,
  active     boolean not null default true,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

create or replace function public.touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.jwt() ->> 'email', new.updated_by);
  return new;
end;
$$;
drop trigger if exists content_touch on public.content;
create trigger content_touch before insert or update on public.content for each row execute function public.touch();
drop trigger if exists sports_touch on public.sports;
create trigger sports_touch before insert or update on public.sports for each row execute function public.touch();

-- ---------- RLS ----------
alter table public.admins  enable row level security;
alter table public.content enable row level security;
alter table public.sports  enable row level security;

drop policy if exists admins_select on public.admins;
drop policy if exists admins_insert on public.admins;
drop policy if exists admins_delete on public.admins;
create policy admins_select on public.admins for select to authenticated using (public.is_admin());
create policy admins_insert on public.admins for insert to authenticated with check (public.is_admin());
create policy admins_delete on public.admins for delete to authenticated
  using (public.is_admin() and email <> lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists content_read  on public.content;
drop policy if exists content_write on public.content;
create policy content_read  on public.content for select to anon, authenticated using (true);
create policy content_write on public.content for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists sports_read  on public.sports;
drop policy if exists sports_write on public.sports;
create policy sports_read  on public.sports for select to anon, authenticated using (true);
create policy sports_write on public.sports for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- Første admin ----------
-- Bytt ut e-posten og kjør. Flere legges til i /admin → Tilgang.
insert into public.admins (email, added_by) values ('jon.l.leiulfsrud@usn.no', '0001_grunnlag.sql')
on conflict (email) do nothing;
