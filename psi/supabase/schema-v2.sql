-- ============================================================
-- psiusn.no: admin versjon 2. Kjøres ÉN gang etter schema.sql.
-- Lim hele fila inn i Supabase → SQL Editor → Run.
--
-- Nytt:
--   members   hvem som har tilgang, med rolle (erstatter admins)
--             psi_admin      alt
--             group_leader   sin egen gruppe: info, tider, nyheter,
--                            arrangementer, bilder
--             group_member   kan logge inn og se, ikke endre
--   news      nyheter, for hele PSI eller én gruppe
--   events    kamper og arrangementer (treningene ligger i sports.schedule)
--   media     bilder lastet opp i /admin (lagres i bucket «media»)
--   public_board  visning av styret på /om, uten e-poster
--
-- Publikum leser alt som er publisert. Skriving styres av rollene.
-- Gamle admins-rader kopieres inn som psi_admin, så ingen mister tilgang.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Medlemmer og roller ----------
do $$ begin
  create type public.member_role as enum ('psi_admin', 'group_leader', 'group_member');
exception when duplicate_object then null; end $$;

create table if not exists public.members (
  id          uuid primary key default gen_random_uuid(),
  email       text not null check (email = lower(email) and length(email) between 5 and 200),
  name        text,
  role        public.member_role not null default 'group_member',
  sport_slug  text,                      -- null = hele PSI (bare for psi_admin)
  title       text,                      -- vises offentlig, f.eks. «Leder, PSI» eller «Gruppeleder»
  show_public boolean not null default true,
  sort_order  int not null default 100,
  added_by    text,
  created_at  timestamptz not null default now(),
  unique nulls not distinct (email, sport_slug),
  check (role = 'psi_admin' or sport_slug is not null)
);
create index if not exists members_email on public.members (email);

-- Kopier de som allerede er admins.
insert into public.members (email, role, sport_slug, title, added_by, show_public)
select a.email, 'psi_admin', null, null, 'schema-v2.sql', true
from public.admins a
where not exists (select 1 from public.members m where m.email = a.email and m.role = 'psi_admin')
on conflict do nothing;

create or replace function public.me_email()
returns text language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

-- security definer: RLS på members spør denne, så den må lese uten RLS.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.members
    where email = public.me_email() and role = 'psi_admin'
  );
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, anon;

-- Kan jeg redigere denne gruppa? Admin: alle. Gruppeleder: sin egen.
create or replace function public.can_manage_sport(slug text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.members
    where email = public.me_email() and role = 'group_leader' and sport_slug = slug
  );
$$;
revoke all on function public.can_manage_sport(text) from public;
grant execute on function public.can_manage_sport(text) to authenticated, anon;

-- Alt om min tilgang i ett kall, til /admin.
create or replace function public.my_access()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'email', public.me_email(),
    'is_admin', public.is_admin(),
    'leader_of', coalesce((select jsonb_agg(sport_slug order by sport_slug) from public.members
                           where email = public.me_email() and role = 'group_leader'), '[]'::jsonb),
    'member_of', coalesce((select jsonb_agg(sport_slug order by sport_slug) from public.members
                           where email = public.me_email() and role = 'group_member'), '[]'::jsonb),
    'name', (select name from public.members where email = public.me_email() and name is not null limit 1)
  );
$$;
revoke all on function public.my_access() from public;
grant execute on function public.my_access() to authenticated;

-- ---------- Nyheter ----------
create table if not exists public.news (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  sport_slug   text,                     -- null = hele PSI
  title        jsonb not null,           -- { nb, en }
  lead         jsonb,                    -- kort ingress { nb, en }
  body         jsonb,                    -- { nb, en }, tom linje = nytt avsnitt
  image_id     uuid,                     -- peker til media
  link_url     text,                     -- f.eks. Spond-arrangement
  status       text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz not null default now(),
  show_on_home boolean not null default true,
  created_by   text,
  updated_at   timestamptz not null default now(),
  updated_by   text
);
create index if not exists news_published on public.news (status, published_at desc);

-- ---------- Arrangementer og kamper ----------
create table if not exists public.events (
  id           uuid primary key default gen_random_uuid(),
  sport_slug   text,                     -- null = hele PSI
  kind         text not null default 'event' check (kind in ('event', 'match', 'training', 'social', 'meeting')),
  title        jsonb not null,           -- { nb, en }
  description  jsonb,                    -- { nb, en }
  starts_at    timestamptz not null,
  ends_at      timestamptz,
  all_day      boolean not null default false,
  venue        text,
  link_url     text,                     -- Spond eller påmelding
  status       text not null default 'published' check (status in ('draft', 'published', 'cancelled')),
  source       text not null default 'manual',   -- 'manual' her, 'spond' hvis en synk legger dem inn senere
  external_id  text unique,                       -- id hos kilden (Spond), så synk kan oppdatere i stedet for å duplisere
  created_by   text,
  updated_at   timestamptz not null default now(),
  updated_by   text,
  check (ends_at is null or ends_at >= starts_at)
);
create index if not exists events_starts on public.events (starts_at);

-- ---------- Bilder ----------
create table if not exists public.media (
  id              uuid primary key default gen_random_uuid(),
  sport_slug      text,                  -- null = PSI felles
  path            text not null,         -- originalen i bucket media
  web_path        text not null,         -- nedskalert webp til nettsiden
  width           int,
  height          int,
  bytes           int,
  caption         jsonb,                 -- { nb, en }
  credit          text,                  -- fotograf
  show_in_gallery boolean not null default false,
  show_on_home    boolean not null default false,
  is_cover        boolean not null default false,  -- brukes som gruppebilde
  sort_order      int not null default 100,
  created_by      text,
  created_at      timestamptz not null default now()
);
create index if not exists media_sport on public.media (sport_slug, sort_order);

-- Maks 30 bilder per gruppe (og 30 felles).
create or replace function public.media_limit()
returns trigger language plpgsql as $$
begin
  if (select count(*) from public.media where sport_slug is not distinct from new.sport_slug) >= 30 then
    raise exception 'Maks 30 bilder per gruppe. Slett noen først.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists media_limit on public.media;
create trigger media_limit before insert on public.media for each row execute function public.media_limit();

-- ---------- Sist endret ----------
drop trigger if exists news_touch on public.news;
create trigger news_touch before insert or update on public.news for each row execute function public.touch();
drop trigger if exists events_touch on public.events;
create trigger events_touch before insert or update on public.events for each row execute function public.touch();

-- ---------- Styret offentlig (uten e-post) ----------
create or replace view public.public_board
with (security_invoker = false) as
  select m.id, m.name, m.title, m.role::text as role, m.sport_slug, m.sort_order
  from public.members m
  where m.show_public and m.name is not null and m.role in ('psi_admin', 'group_leader');
grant select on public.public_board to anon, authenticated;

-- ---------- RLS ----------
alter table public.members enable row level security;
alter table public.news    enable row level security;
alter table public.events  enable row level security;
alter table public.media   enable row level security;

drop policy if exists members_select on public.members;
drop policy if exists members_insert on public.members;
drop policy if exists members_update on public.members;
drop policy if exists members_delete on public.members;
-- Innloggede ser lista (styret er ikke hemmelig for styret).
create policy members_select on public.members for select to authenticated
  using (public.is_admin() or public.can_manage_sport(sport_slug) or email = public.me_email());
-- Admin styrer alt. Gruppeleder kan legge til/fjerne folk i sin gruppe, men ikke gjøre noen til admin.
create policy members_insert on public.members for insert to authenticated
  with check (public.is_admin() or (role <> 'psi_admin' and public.can_manage_sport(sport_slug)));
create policy members_update on public.members for update to authenticated
  using (public.is_admin() or (role <> 'psi_admin' and public.can_manage_sport(sport_slug)) or email = public.me_email())
  with check (public.is_admin() or (role <> 'psi_admin' and public.can_manage_sport(sport_slug)) or email = public.me_email());
create policy members_delete on public.members for delete to authenticated
  using ((public.is_admin() and not (role = 'psi_admin' and email = public.me_email()))
         or (role <> 'psi_admin' and public.can_manage_sport(sport_slug)));

-- sports: gruppeleder kan oppdatere sin egen rad, ikke lage eller slette.
drop policy if exists sports_write on public.sports;
drop policy if exists sports_admin on public.sports;
drop policy if exists sports_leader on public.sports;
create policy sports_admin  on public.sports for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy sports_leader on public.sports for update to authenticated
  using (public.can_manage_sport(slug)) with check (public.can_manage_sport(slug));

drop policy if exists news_read  on public.news;
drop policy if exists news_write on public.news;
create policy news_read  on public.news for select to anon, authenticated
  using (status = 'published' or public.can_manage_sport(sport_slug) or (sport_slug is null and public.is_admin()));
create policy news_write on public.news for all to authenticated
  using (case when sport_slug is null then public.is_admin() else public.can_manage_sport(sport_slug) end)
  with check (case when sport_slug is null then public.is_admin() else public.can_manage_sport(sport_slug) end);

drop policy if exists events_read  on public.events;
drop policy if exists events_write on public.events;
create policy events_read  on public.events for select to anon, authenticated
  using (status <> 'draft' or public.can_manage_sport(sport_slug) or (sport_slug is null and public.is_admin()));
create policy events_write on public.events for all to authenticated
  using (case when sport_slug is null then public.is_admin() else public.can_manage_sport(sport_slug) end)
  with check (case when sport_slug is null then public.is_admin() else public.can_manage_sport(sport_slug) end);

drop policy if exists media_read  on public.media;
drop policy if exists media_write on public.media;
create policy media_read  on public.media for select to anon, authenticated
  using (show_in_gallery or show_on_home or is_cover or auth.role() = 'authenticated');
create policy media_write on public.media for all to authenticated
  using (case when sport_slug is null then public.is_admin() else public.can_manage_sport(sport_slug) end)
  with check (case when sport_slug is null then public.is_admin() else public.can_manage_sport(sport_slug) end);

-- ---------- Lagring: bucket «media» ----------
-- Filer ligger som <gruppe>/<id>/original.<ext> og <gruppe>/<id>/web.webp,
-- der <gruppe> er slug eller «psi». Første mappenavn avgjør hvem som får skrive.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 26214400, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update set public = true, file_size_limit = 26214400,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

drop policy if exists media_files_read   on storage.objects;
drop policy if exists media_files_insert on storage.objects;
drop policy if exists media_files_update on storage.objects;
drop policy if exists media_files_delete on storage.objects;
create policy media_files_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'media');
create policy media_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (
    (split_part(name, '/', 1) = 'psi' and public.is_admin()) or
    (split_part(name, '/', 1) <> 'psi' and public.can_manage_sport(split_part(name, '/', 1)))));
create policy media_files_update on storage.objects for update to authenticated
  using (bucket_id = 'media' and (
    (split_part(name, '/', 1) = 'psi' and public.is_admin()) or
    (split_part(name, '/', 1) <> 'psi' and public.can_manage_sport(split_part(name, '/', 1)))));
create policy media_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (
    (split_part(name, '/', 1) = 'psi' and public.is_admin()) or
    (split_part(name, '/', 1) <> 'psi' and public.can_manage_sport(split_part(name, '/', 1)))));

-- ---------- Første admin (om admins var tom) ----------
insert into public.members (email, role, title, added_by)
values ('jon.l.leiulfsrud@usn.no', 'psi_admin', 'Leder, PSI', 'schema-v2.sql')
on conflict do nothing;
