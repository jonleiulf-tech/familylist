-- Fase 2: ekte betaling gjennom Stripe.
--
-- Modellen som gjelder fra lansering:
--   15 kr/mnd per husholdning · 30 dagers prøvetid for alle
--   kampanjekode gir én måned til på toppen (= 60 dager gratis)
--   150 Plukkepoeng = 1 måned, som før
--   husholdningene fra før har «grunnlegger» og betaler ingenting
--
-- Sannheten om hvem som har betalt bor hos Stripe. Denne tabellen er en
-- kopi som webhooken holder oppdatert, slik at appen slipper å spørre
-- Stripe for hvert eneste sideoppslag.

-- ---------------------------------------------------------------------------
-- 1) «forfalt» må inn i statusene: kortet feilet, men vi kaster ingen ut
--    før Stripe har gitt opp for godt.
-- ---------------------------------------------------------------------------
alter table public.subscriptions drop constraint if exists subscriptions_status_check;
alter table public.subscriptions add constraint subscriptions_status_check
  check (status in ('prøve', 'aktiv', 'poeng', 'grunnlegger', 'utløpt', 'forfalt'));

-- ---------------------------------------------------------------------------
-- 2) Koblingen til Stripe.
--    price_ore lagres per husholdning med vilje: hever vi prisen senere,
--    skal de som var med fra start beholde sin. Løftet i lanseringsposten
--    må kunne innfris i data, ikke bare i tekst.
-- ---------------------------------------------------------------------------
alter table public.subscriptions
  add column if not exists stripe_customer_id     text,
  add column if not exists stripe_subscription_id text,
  add column if not exists cancel_at_period_end   boolean not null default false,
  add column if not exists price_ore               int,
  add column if not exists trial_reminder_at      timestamptz,
  add column if not exists last_event_at          timestamptz;

-- Unikhet, men bare på rader som faktisk har en verdi.
create unique index if not exists subscriptions_stripe_customer_idx
  on public.subscriptions (stripe_customer_id) where stripe_customer_id is not null;
create unique index if not exists subscriptions_stripe_subscription_idx
  on public.subscriptions (stripe_subscription_id) where stripe_subscription_id is not null;

-- ---------------------------------------------------------------------------
-- 3) Har husholdningen tilgang akkurat nå?
--    Én definisjon, brukt av både appen og databasen — to steder å endre
--    en slik regel er ett for mye.
--
--    «forfalt» får fem dagers nåde etter siste betalte dag. Stripe prøver
--    kortet flere ganger over en drøy uke, og det ville vært surt å stenge
--    lista mens banken holder på med sitt.
-- ---------------------------------------------------------------------------
create or replace function public.household_has_access(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case
      when s.status = 'grunnlegger' then true
      when s.status = 'utløpt'      then false
      when s.status = 'forfalt'     then s.paid_until >= current_date - 5
      else s.paid_until >= current_date
    end
    from public.subscriptions s where s.household_id = hid
  ), true);   -- ingen rad = ingen mening om saken; vi stenger ingen ute på tvil
$$;
revoke all on function public.household_has_access(uuid) from public;
grant execute on function public.household_has_access(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Nattlig opprydding: sett «utløpt» på det som faktisk har gått ut.
--    Statusen er bare en oppsummering — household_has_access() over er
--    fasiten uansett, så en dag med etterslep gjør ingen skade.
-- ---------------------------------------------------------------------------
create or replace function public.expire_subscriptions()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  update public.subscriptions
  set status = 'utløpt', updated_at = now()
  where status in ('prøve', 'poeng')      and paid_until < current_date;
  get diagnostics n = row_count;

  update public.subscriptions
  set status = 'utløpt', updated_at = now()
  where status in ('aktiv', 'forfalt')    and paid_until < current_date - 5;
  return n;
end;
$$;
revoke all on function public.expire_subscriptions() from public;

-- Kjøres 04:10 hver natt, som de andre vedlikeholdsjobbene.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('expire-subscriptions')
      where exists (select 1 from cron.job where jobname = 'expire-subscriptions');
    perform cron.schedule('expire-subscriptions', '10 4 * * *',
                          $job$select public.expire_subscriptions();$job$);
  end if;
exception when others then
  -- Mangler rettigheter til cron, er ikke det verdt å velte migrasjonen
  -- for: household_has_access() svarer riktig uansett, jobben rydder bare
  -- opp i statusteksten. Da settes den heller opp for hånd.
  raise notice 'Fikk ikke satt opp den nattlige jobben: %', sqlerrm;
end $$;
