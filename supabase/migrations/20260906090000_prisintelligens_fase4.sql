-- Prisintelligens, fase 4 — det som bygger på alt over (§17–19, §21, §24).
--
-- Plan: docs/prisintelligens-plan.md. Kjøres trygt flere ganger.
--
-- Tre ting i basen; resten (neste-kjøp-sannsynlighet, varer som opptrer
-- sammen, «kjøp nå før tilbudet går ut») regnes i klienten fra
-- household_purchases, som RLS alt beskytter.
--
--   1. item_catalog.stock_up_suitability — egner varen seg til å hamstre?
--      Seedet fra kategori; kan overstyres per vare senere.
--   2. household_purchases.reference_price / estimated_saving /
--      saving_confidence — hva denne husholdningen PLEIER å betale for
--      varen, og hvor mye kjøpet sparte mot det. Referansen er ALLTID
--      husholdningens egen historikk (§24) — aldri en «førpris» fra en
--      kundeavis, for den kan være hva som helst.
--   3. record_price_observations v3 — regner sparingen når kjøpslinjen
--      skrives, i samme transaksjon.

-- ---------------------------------------------------------------------
-- 1. Hamstre-egnethet (§18)
-- ---------------------------------------------------------------------
alter table public.item_catalog
  add column if not exists stock_up_suitability text;

alter table public.item_catalog drop constraint if exists item_catalog_stock_up_check;
alter table public.item_catalog add constraint item_catalog_stock_up_check
  check (stock_up_suitability is null or stock_up_suitability in ('high','medium','low'));

-- Bare der ingen har satt noe: en senere manuell retting skal ikke
-- overskrives av at migrasjonen kjøres igjen.
update public.item_catalog set stock_up_suitability = case
    when major_category in ('Tørrvarer','Hus og hjem','Frysevarer','Krydder og saus','Drikke','Snacks') then 'high'
    when major_category in ('Kjøtt','Fisk','Ost og pålegg','Annet') then 'medium'
    when major_category in ('Frukt og grønt','Meieri','Brød og korn') then 'low'
    else 'medium' end
  where stock_up_suitability is null;

comment on column public.item_catalog.stock_up_suitability is
  'high = tåler å kjøpes på lager (tørrvarer, frys, husholdning); medium = kan '
  'kjøpes litt før tiden; low = ferskvare, kjøp når det trengs. Seedet fra kategori.';

-- ---------------------------------------------------------------------
-- 2. Sparing på kjøpslinjen (§24)
-- ---------------------------------------------------------------------
alter table public.household_purchases
  add column if not exists reference_price   numeric(10,2),
  add column if not exists estimated_saving  numeric(10,2),
  add column if not exists saving_confidence numeric(3,2);

alter table public.household_purchases drop constraint if exists household_purchases_saving_sane;
alter table public.household_purchases add constraint household_purchases_saving_sane check (
  (reference_price is null or (reference_price > 0 and reference_price < 100000))
  and (estimated_saving is null or (estimated_saving >= 0 and estimated_saving < 100000))
  and (saving_confidence is null or (saving_confidence >= 0 and saving_confidence <= 1))
);

comment on column public.household_purchases.reference_price is
  'Husholdningens egen medianpris (per enhet) for varen de siste 180 dagene, '
  'fra vanlige kjøp — aldri en førpris. NULL når det ikke finnes nok historikk.';
comment on column public.household_purchases.estimated_saving is
  'Hva kjøpet sparte mot reference_price, i kroner for hele linjen. Aldri negativ: '
  'et kjøp som var dyrere enn vanlig er 0, ikke et «tap». Konservativt med vilje.';
comment on column public.household_purchases.saving_confidence is
  'Hvor sikker referansen er: 0,9 ved 6+ tidligere kjøp, 0,7 ved 4–5, 0,5 ved 2–3.';

-- ---------------------------------------------------------------------
-- 3. Referansepris: hva pleier DENNE husholdningen å betale?
-- ---------------------------------------------------------------------
-- Median av vanlige kjøp (ikke tilbud) siste 180 dager, per enhet når
-- enhetspris finnes, ellers per linje. Kjøres som eier inne i RPC-en;
-- husholdningen er alt sjekket der.
create or replace function public.household_reference_price(
  p_household uuid, p_item text, p_before timestamptz default now()
)
returns table (reference_price numeric, n int, per_unit boolean)
language sql
stable
security definer
set search_path = public
as $$
  with k as (
    select coalesce(hp.unit_price, hp.price_paid) as p, hp.unit_price is not null as pu
    from public.household_purchases hp
    where hp.household_id = p_household
      and lower(hp.item_name) = lower(left(coalesce(p_item, ''), 120))
      and hp.purchase_reason in ('normal', 'unknown')
      and hp.purchased_at < p_before
      and hp.purchased_at >= p_before - interval '180 days'
      and coalesce(hp.unit_price, hp.price_paid) > 0
  ),
  -- Enhetspris og linjepris kan ikke blandes: bruk enhetspris hvis minst
  -- to kjøp har den, ellers linjepris.
  valg as (
    select (count(*) filter (where pu)) >= 2 as per_unit from k
  )
  select
    round(percentile_cont(0.5) within group (order by k.p)::numeric, 2) as reference_price,
    count(*)::int as n,
    valg.per_unit
  from k, valg
  where k.pu = valg.per_unit
  group by valg.per_unit
  having count(*) >= 2;
$$;
revoke all on function public.household_reference_price(uuid, text, timestamptz) from public;
grant execute on function public.household_reference_price(uuid, text, timestamptz) to authenticated;

-- ---------------------------------------------------------------------
-- 4. record_price_observations v3 — som v2, pluss sparing på kjøpslinjen
-- ---------------------------------------------------------------------
create or replace function public.record_price_observations(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_n    int;
  v_used int;
  v_cap  int := public.price_obs_daily_cap();
  v_day  date := public.oslo_today();
  v_ins  int := 0;
  r      record;
  v_item_id    bigint;
  v_product_id bigint;
  v_source     text;
  v_conf       numeric;
  v_reason     text;
  v_hh         uuid;
  v_when       timestamptz;
  v_ref        record;
  v_ref_price  numeric;
  v_saving     numeric;
  v_saving_conf numeric;
  v_paid       numeric;
begin
  if v_user is null then return 0; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then return 0; end if;
  v_n := jsonb_array_length(p_rows);
  if v_n = 0 then return 0; end if;
  if v_n > 400 then return -1; end if;

  select q.n into v_used from public.price_obs_quota q
  where q.user_id = v_user and q.day = v_day for update;
  v_used := coalesce(v_used, 0);
  if v_used + v_n > v_cap then return -1; end if;

  insert into public.price_obs_quota (user_id, day, n)
  values (v_user, v_day, v_n)
  on conflict (user_id, day) do update set n = public.price_obs_quota.n + v_n;

  for r in
    select * from jsonb_to_recordset(p_rows) as x(
      item_name text, store_code text, price numeric, qty numeric, unit text,
      unit_price numeric, regular_unit_price numeric, observed_at timestamptz, confidence numeric,
      household_id uuid, source text, ean text, kassal_product_id bigint, product_name text, brand text,
      package_qty numeric, package_unit text, original_price numeric, is_offer boolean,
      discount_amount numeric, match_confidence numeric, match_method text
    )
  loop
    continue when r.item_name is null or length(trim(r.item_name)) = 0;
    continue when r.price is null or r.price <= 0 or r.price >= 100000;
    continue when r.qty is not null and (r.qty <= 0 or r.qty > 500);
    continue when r.unit_price is not null and (r.unit_price <= 0 or r.unit_price >= 100000);
    continue when r.regular_unit_price is not null and (r.regular_unit_price <= 0 or r.regular_unit_price >= 100000);

    v_source := case when r.source in ('kassalapp') then r.source else 'receipt' end;
    v_conf := least(greatest(coalesce(r.confidence, 0.6), 0), case when v_source = 'kassalapp' then 0.9 else 1 end);
    v_when := least(coalesce(r.observed_at, now()), now());

    v_product_id := null;
    if (r.ean ~ '^[0-9]{8,14}$') or r.kassal_product_id is not null then
      select id into v_item_id from public.item_catalog where name = left(r.item_name, 120) limit 1;
      if v_item_id is not null then
        select id into v_product_id from public.products
        where (r.ean is not null and ean = r.ean) or (r.kassal_product_id is not null and kassal_product_id = r.kassal_product_id)
        limit 1;
        if v_product_id is null then
          insert into public.products (item_id, name, brand, ean, package_qty, package_unit, kassal_product_id)
          values (v_item_id, left(coalesce(r.product_name, r.item_name), 160), left(r.brand, 80),
                  case when r.ean ~ '^[0-9]{8,14}$' then r.ean end,
                  r.package_qty, left(r.package_unit, 12), r.kassal_product_id)
          on conflict do nothing
          returning id into v_product_id;
          if v_product_id is null then
            select id into v_product_id from public.products
            where (r.ean is not null and ean = r.ean) or (r.kassal_product_id is not null and kassal_product_id = r.kassal_product_id)
            limit 1;
          end if;
        end if;
        if v_product_id is not null and r.product_name is not null then
          insert into public.product_aliases (product_id, alias) values (v_product_id, left(r.product_name, 160))
          on conflict do nothing;
        end if;
      end if;
    end if;

    -- Den anonyme observasjonen. Aldri household_id her.
    insert into public.price_observations
      (item_name, store_code, price, qty, unit, unit_price, regular_unit_price, observed_at, source, confidence,
       ean, kassal_product_id, product_id, package_qty, package_unit, original_price, is_offer)
    values
      (left(r.item_name, 120), left(r.store_code, 40), r.price, r.qty, left(r.unit, 12),
       r.unit_price, r.regular_unit_price, v_when, v_source, v_conf,
       case when r.ean ~ '^[0-9]{8,14}$' then r.ean end, r.kassal_product_id, v_product_id,
       r.package_qty, left(r.package_unit, 12), r.original_price,
       coalesce(r.is_offer, false) or (r.original_price is not null and r.original_price > r.price)
         or (r.regular_unit_price is not null and r.unit_price is not null and r.regular_unit_price > r.unit_price));
    v_ins := v_ins + 1;

    -- Kjøpslinjen: bare for kvitteringer, bare for husholdninger kalleren
    -- er medlem av.
    v_hh := r.household_id;
    if v_source = 'receipt' and v_hh is not null and public.is_household_member(v_hh) then
      v_reason := case
        when coalesce(r.is_offer, false) or (r.original_price is not null and r.original_price > r.price)
          or (r.regular_unit_price is not null and r.unit_price is not null and r.regular_unit_price > r.unit_price)
          then 'offer'
        else 'normal' end;

      -- Fase 4: hva pleier dere å betale, og hva sparte dette kjøpet?
      -- Referansen regnes av kjøp FØR dette, så en kvittering som lastes
      -- opp to ganger ikke sammenligner seg med seg selv.
      v_ref_price := null; v_saving := null; v_saving_conf := null;
      select * into v_ref from public.household_reference_price(v_hh, r.item_name, v_when);
      if found and v_ref.reference_price is not null then
        v_paid := case when v_ref.per_unit then r.unit_price else r.price end;
        if v_paid is not null and v_paid > 0 then
          v_ref_price := v_ref.reference_price;
          v_saving := greatest(0, (v_ref.reference_price - v_paid) * case when v_ref.per_unit then coalesce(r.qty, 1) else 1 end);
          v_saving := round(least(v_saving, 99999), 2);
          v_saving_conf := case when v_ref.n >= 6 then 0.9 when v_ref.n >= 4 then 0.7 else 0.5 end;
        end if;
      end if;

      insert into public.household_purchases
        (household_id, purchased_at, chain_code, item_name, product_id, qty, unit, price_paid, unit_price,
         discount_amount, purchase_reason, match_confidence, match_method, source,
         reference_price, estimated_saving, saving_confidence)
      values
        (v_hh, v_when, left(r.store_code, 40), left(r.item_name, 120),
         v_product_id, r.qty, left(r.unit, 12), r.price, r.unit_price,
         case when r.discount_amount is not null and r.discount_amount >= 0 and r.discount_amount < 100000 then r.discount_amount end,
         v_reason,
         case when r.match_confidence is not null then least(greatest(r.match_confidence, 0), 1) end,
         left(r.match_method, 20), 'receipt',
         v_ref_price, v_saving, v_saving_conf);
    end if;
  end loop;

  return v_ins;
end;
$$;

revoke all on function public.record_price_observations(jsonb) from public;
grant execute on function public.record_price_observations(jsonb) to authenticated;

comment on function public.record_price_observations(jsonb) is
  'Prisintelligens: skriver anonyme prisobservasjoner (felles) og, for kvitteringer '
  'med household_id, husholdningens egne kjøpslinjer (privat) med sparing mot egen '
  'referansepris (fase 4). Kassalapp-rader blir observasjoner men ikke kjøp. Dagskvote per bruker.';
