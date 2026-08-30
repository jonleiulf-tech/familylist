-- Sikkerhets- og korrekthetsfikser fra revisjonen (bolk 1).

-- 1) KRITISK: poeng-funksjonene var kallbare av hvem som helst over HTTP.
--    Alle andre SECURITY DEFINER-funksjoner har revoke/grant; disse manglet.
--    award_points kalles KUN av triggere (kjører som eier) — ingen klient
--    skal nå den. redeem_points_for_month skal nås av innloggede brukere.
revoke all on function public.award_points(uuid, text, int, text, text) from public;
revoke all on function public.redeem_points_for_month(uuid) from public;
grant execute on function public.redeem_points_for_month(uuid) to authenticated;

-- 2) HØY: poeng-farming via delte tilbud. Belønnings-ref-en var nøklet på
--    store_code, som brukeren selv styrer — vilkårlige koder ga +15 hver.
--    Nøkkel nå på uke alene: maks +15 for tilbudsdeling per bruker per uke,
--    umulig å farme. (Var «per butikk per uke»; forenkles til per uke.)
create or replace function public.points_on_shared_offer()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.household_id is null and new.created_by is not null
     and new.source_type in ('flyer_scan', 'manual_import', 'customer_flyer') then
    perform public.award_points(new.created_by, 'tilbud_delt', 15,
      'tilbud:' || to_char(now(), 'IYYY-IW'),
      'Delte ukens tilbud med fellesskapet');
  end if;
  return new;
end;
$$;

-- 3) HØY/funksjonell: offers.source_type-constrainten manglet verdiene
--    klienten og web-skannet faktisk sender ('flyer_scan', 'web_page'), så
--    hver avis-skann-import og web-skann feilet mot databasen.
alter table public.offers drop constraint if exists offers_source_type_check;
alter table public.offers
  add constraint offers_source_type_check
  check (source_type in (
    'api', 'html_page', 'customer_flyer', 'manual_import',
    'rss', 'partner_feed', 'flyer_scan', 'web_page'
  ));

-- 4) HØY: ingen kostnadsgrense på KI-avis-skanning. Logg per bruker/kall,
--    så edge-funksjonen kan håndheve en daglig kvote. Kun service_role
--    skriver/leser — deny-all mot klienten (RLS på, ingen policy).
create table if not exists public.ai_scan_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null default 'kundeavis',
  created_at timestamptz not null default now()
);
alter table public.ai_scan_log enable row level security;
create index if not exists ai_scan_log_user_day_idx
  on public.ai_scan_log (user_id, created_at);
