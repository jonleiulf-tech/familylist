#!/usr/bin/env bash
# Kjører migrasjonene og RLS-regresjonstesten mot en lokal engangsdatabase.
#
# Krever en kjørende PostgreSQL. Med Supabase CLI installert er
# `supabase db reset` det normale valget; dette skriptet finnes for å kunne
# teste isolasjonen uten å røre et ekte prosjekt.
#
#   PGHOST=/var/tmp PGPORT=5433 PGUSER=familylist ./scripts/test-db.sh
set -euo pipefail

DB="${TEST_DB:-familylist_test}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Oppretter $DB på nytt"
psql -q -d postgres -c "drop database if exists ${DB};" -c "create database ${DB};"

echo "==> Etterligner Supabase-plattformen (auth-skjema og roller)"
psql -q -d "$DB" -v ON_ERROR_STOP=1 <<'SQL'
-- Speil Supabase: utvidelser ligger i skjemaet `extensions`, ikke i public.
-- Uten dette ville en migrasjon som kaller pgcrypto-funksjoner bestå lokalt
-- og feile i produksjon — nøyaktig det som skjedde med gen_random_bytes.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text unique);
-- I Supabase leser auth.uid() JWT-claims; her styres den av en session-variabel.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
grant usage on schema public, auth to anon, authenticated, service_role;
grant select on auth.users to authenticated;
alter default privileges in schema public grant all on tables to authenticated, service_role;
alter default privileges in schema public grant all on sequences to authenticated, service_role;
SQL

echo "==> Legger på migrasjoner"
for f in "$ROOT"/supabase/migrations/*.sql; do
  printf '    %s\n' "$(basename "$f")"
  psql -q -d "$DB" -v ON_ERROR_STOP=1 -f "$f" >/dev/null
done

echo "==> Kjører RLS-regresjonstest"
psql -q -d "$DB" -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/rls_test.sql"
