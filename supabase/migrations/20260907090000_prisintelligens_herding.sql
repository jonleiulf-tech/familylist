-- Prisintelligens — herding etter gjennomgangen 6. sept 2026.
-- Kjøres trygt flere ganger.
--
-- 1. household_reference_price() var kallbar av alle innloggede for hvilken
--    som helst husholdning: security definer, uten medlemssjekk, med grant
--    til authenticated. Den kalles bare fra record_price_observations, som
--    kjører som eier — så grant-en var unødvendig, og lakk medianpris og
--    antall kjøp per vare på tvers av husholdninger.
-- 2. Indekser for spørringene som faktisk kjøres: referanseprisen slår opp
--    på lower(item_name), og usePurchaseStats sorterer på purchased_at.
-- 3. Den partielle EAN-indeksen fra fase 1 fikk samme navn som en gammel
--    full indeks, så «if not exists» hoppet over den.
-- 4. price_obs_quota (én rad per bruker per dag) vokser for alltid; ryddes
--    i samme nattjobb som utløper abonnementer.

-- 1. Bare RPC-en (som eier) skal kunne kalle den.
revoke all on function public.household_reference_price(uuid, text, timestamptz) from public, authenticated;

comment on function public.household_reference_price(uuid, text, timestamptz) is
  'Husholdningens egen medianpris for en vare. Intern — kalles fra '
  'record_price_observations. Ingen grant til authenticated med vilje.';

-- 2. Indekser.
create index if not exists household_purchases_item_lower_idx
  on public.household_purchases (household_id, lower(item_name), purchased_at desc);
create index if not exists household_purchases_time_idx
  on public.household_purchases (household_id, purchased_at desc);

-- 3. EAN: den partielle er den vi vil ha (de fleste rader har ingen EAN).
create index if not exists price_obs_ean_partial_idx
  on public.price_observations (ean) where ean is not null;
drop index if exists public.price_obs_ean_idx;

-- 4. Kvoteradene eldre enn en uke slettes av nattjobben.
create or replace function public.expire_subscriptions()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int; m int;
begin
  update public.subscriptions
  set status = 'utløpt', updated_at = now()
  where status in ('prøve', 'poeng')
    and stripe_subscription_id is null
    and paid_until < public.oslo_today() - 1;
  get diagnostics n = row_count;

  update public.subscriptions
  set status = 'utløpt', updated_at = now()
  where status in ('aktiv', 'forfalt')
    and paid_until < public.oslo_today() - 5;
  get diagnostics m = row_count;

  -- Husarbeid som ikke fortjener egen cron: dagskvotene for
  -- prisobservasjoner trengs bare for i dag.
  delete from public.price_obs_quota where day < public.oslo_today() - 7;

  return n + m;
end;
$$;
