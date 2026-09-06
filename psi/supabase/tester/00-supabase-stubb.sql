-- Nok av Supabase til at migrasjonene kan kjøres og prøves lokalt.
create schema if not exists auth;
create schema if not exists storage;
create extension if not exists pgcrypto;

-- Supabase sin auth.jwt() leser kravene fra en GUC. Vi setter den selv i
-- testene for å opptre som ulike innloggede personer.
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid;
$$;

create table if not exists storage.buckets (
  id text primary key, name text, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text, owner uuid, created_at timestamptz default now()
);
alter table storage.objects enable row level security;

do $$ begin create role anon nologin;          exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin;  exception when duplicate_object then null; end $$;
grant usage on schema public, storage to anon, authenticated;
grant all on all tables in schema storage to authenticated;

create or replace function auth.role() returns text language sql stable as $$
  select coalesce(auth.jwt() ->> 'role', 'anon');
$$;

-- Supabase deler ut rettigheter på nye tabeller i public automatisk.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;

-- I Supabase har både anon og authenticated tilgang til auth-skjemaet.
grant usage on schema auth to anon, authenticated;
grant execute on all functions in schema auth to anon, authenticated;
