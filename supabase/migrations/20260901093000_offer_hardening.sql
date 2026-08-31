-- Tetter tre hull en sikkerhetsgjennomgang fant i den delte tilbudsfeeden.

-- ---------------------------------------------------------------------------
-- 1. Lenker i tilbud må være http(s)
--
-- source_url settes av tredjepart: Kassalapp, butikkenes nettsider,
-- kundeaviser tolket fra foto, og manuell import fra andre brukere. En
-- javascript:-URL i feltet kjører på appens origin når noen trykker på
-- lenken, og sesjonen ligger i localStorage. Klienten filtrerer nå (safeUrl),
-- men databasen skal ikke kunne inneholde noe slikt i utgangspunktet.
-- ---------------------------------------------------------------------------
update public.offers
set source_url = null
where source_url is not null and source_url !~* '^https?://';

alter table public.offers drop constraint if exists offers_source_url_http;
alter table public.offers add constraint offers_source_url_http
  check (source_url is null or source_url ~* '^https?://');

-- ---------------------------------------------------------------------------
-- 2. Den som la inn et fellestilbud skal kunne fjerne det igjen
--
-- Alle innloggede kan skrive til fellesfeeden (household_id null), men
-- slettepolicyen krevde household_id is not null. Feilaktige eller
-- misvisende rader kunne dermed ikke fjernes av noen — heller ikke av den
-- som la dem inn.
-- ---------------------------------------------------------------------------
drop policy if exists offers_shared_delete on public.offers;
create policy offers_shared_delete on public.offers
  for delete to authenticated
  using (household_id is null and created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. Kjørelogger er driftsdata, ikke noe alle skal lese
--
-- offer_fetch_logs var lesbar for enhver innlogget bruker, og error_message
-- inneholder rå feiltekst fra Postgres — kolonnenavn, brutte constraints,
-- API-statuser. Gratis rekognosering. Jobbene skriver med service_role og
-- går utenom RLS, så de merker ingenting.
-- ---------------------------------------------------------------------------
drop policy if exists offer_fetch_logs_read on public.offer_fetch_logs;

-- Statusen uten feilteksten er fortsatt nyttig i appen («sist oppdatert»).
create or replace view public.offer_fetch_status as
  select id, source_id, started_at, finished_at, status, offers_found, offers_saved
  from public.offer_fetch_logs;

grant select on public.offer_fetch_status to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Husregelen om search_path, som count_bump manglet
-- ---------------------------------------------------------------------------
alter function public.count_bump(uuid, text, int) set search_path = public;
alter function public.count_rename(uuid, text, text, text) set search_path = public;
