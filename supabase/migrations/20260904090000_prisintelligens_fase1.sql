-- Prisintelligens, fase 1 — modellen.
--
-- Bakgrunn og avgjørelser: docs/prisintelligens-plan.md (§2a–2d, fase 1).
--
-- To tabeller, to formål, aldri blandet:
--   price_observations   anonym og felles. «Hva koster Norvegia hos Coop.»
--   household_purchases  husholdningens egne kjøpslinjer, privat med RLS.
--                        «Hva kjøper VI, hvor, hvor ofte.»
-- Én kvittering skriver til begge, i én transaksjon, via samme RPC. Den
-- anonyme raden får aldri en peker tilbake til husholdningen.
--
-- Kjøres trygt flere ganger.

-- ---------------------------------------------------------------------
-- 1. Fysiske butikker under kjedene (§2b)
-- ---------------------------------------------------------------------
create table if not exists public.physical_stores (
  id           uuid primary key default gen_random_uuid(),
  chain_code   text not null references public.stores(code) on delete cascade,
  name         text not null,                    -- «Coop Extra Kilen», «MENY Hovenga»
  household_id uuid references public.households(id) on delete cascade, -- null = felles
  created_at   timestamptz not null default now(),
  constraint physical_stores_name_sane check (char_length(name) between 2 and 80)
);
create unique index if not exists physical_stores_unique_idx
  on public.physical_stores (chain_code, lower(name), coalesce(household_id, '00000000-0000-0000-0000-000000000000'::uuid));

alter table public.physical_stores enable row level security;
drop policy if exists physical_stores_select on public.physical_stores;
create policy physical_stores_select on public.physical_stores for select to authenticated
  using (household_id is null or public.is_household_member(household_id));
drop policy if exists physical_stores_insert on public.physical_stores;
create policy physical_stores_insert on public.physical_stores for insert to authenticated
  with check (household_id is not null and public.is_household_member(household_id));
drop policy if exists physical_stores_delete on public.physical_stores;
create policy physical_stores_delete on public.physical_stores for delete to authenticated
  using (household_id is not null and public.is_household_member(household_id));

-- ---------------------------------------------------------------------
-- 2. Produkter UNDER varene (§2c) — et tillegg, ikke en erstatning
-- ---------------------------------------------------------------------
-- «Gulost» er det familien trenger (item_catalog). «Norvegia Original
-- 1 kg» er ett konkret produkt som dekker behovet. Handlelisten fortsetter
-- å be om varen; estimatet kan velge produktet når det finnes.
create table if not exists public.products (
  id                bigserial primary key,
  item_id           bigint not null references public.item_catalog(id) on delete cascade,
  name              text not null,
  brand             text,
  ean               text,
  package_qty       numeric(10,3),
  package_unit      text,
  kassal_product_id bigint,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint products_name_sane check (char_length(name) between 1 and 160),
  constraint products_ean_sane check (ean is null or ean ~ '^[0-9]{8,14}$')
);
create unique index if not exists products_ean_idx on public.products (ean) where ean is not null;
create unique index if not exists products_kassal_idx on public.products (kassal_product_id) where kassal_product_id is not null;
create index if not exists products_item_idx on public.products (item_id);

create table if not exists public.product_aliases (
  product_id bigint not null references public.products(id) on delete cascade,
  alias      text not null,
  created_at timestamptz not null default now(),
  constraint product_aliases_sane check (char_length(alias) between 1 and 160)
);
create unique index if not exists product_aliases_unique_idx on public.product_aliases (lower(alias));

-- Lesing for alle innloggede, som item_catalog. Skriving bare via
-- funksjonene under (security definer) og nattjobben (service role).
alter table public.products enable row level security;
alter table public.product_aliases enable row level security;
drop policy if exists products_select on public.products;
create policy products_select on public.products for select to authenticated using (true);
drop policy if exists product_aliases_select on public.product_aliases;
create policy product_aliases_select on public.product_aliases for select to authenticated using (true);

-- kassal_matches hadde feltene, men ingen kode leste eller skrev den.
-- Det som eventuelt ligger der flyttes inn, så droppes tabellen.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'kassal_matches') then
    insert into public.products (item_id, name, brand, ean, package_qty, package_unit, kassal_product_id)
    select c.id, coalesce(m.name, m.item_name), m.brand,
           case when m.ean ~ '^[0-9]{8,14}$' then m.ean end,
           m.weight, m.weight_unit, m.kassal_product_id
    from public.kassal_matches m
    join public.item_catalog c on c.name = m.item_name
    where m.kassal_product_id is not null
    on conflict do nothing;
    drop table public.kassal_matches;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. price_observations utvides — ingen kolonne fjernes
-- ---------------------------------------------------------------------
alter table public.price_observations
  add column if not exists product_id        bigint references public.products(id) on delete set null,
  add column if not exists physical_store_id uuid references public.physical_stores(id) on delete set null,
  add column if not exists package_qty       numeric(10,3),
  add column if not exists package_unit      text,
  add column if not exists original_price    numeric(10,2),
  add column if not exists is_offer          boolean not null default false,
  add column if not exists valid_from        date,
  add column if not exists valid_to          date,
  add column if not exists source_reference  text;

alter table public.price_observations drop constraint if exists price_observations_source_check;
alter table public.price_observations add constraint price_observations_source_check
  check (source in ('kassalapp','receipt','manual','estimate','offer','weekly_offer','imported_receipt','external'));

create index if not exists price_obs_product_idx on public.price_observations (product_id, observed_at desc) where product_id is not null;
create index if not exists price_obs_ean_idx on public.price_observations (ean) where ean is not null;

-- ---------------------------------------------------------------------
-- 4. Husholdningens egne kjøpslinjer (§2a)
-- ---------------------------------------------------------------------
create table if not exists public.household_purchases (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references public.households(id) on delete cascade,
  purchased_at      timestamptz not null,
  receipt_upload_id uuid references public.receipt_uploads(id) on delete set null,
  chain_code        text,
  physical_store_id uuid references public.physical_stores(id) on delete set null,
  item_name         text not null,
  product_id        bigint references public.products(id) on delete set null,
  qty               numeric(10,3),
  unit              text,
  price_paid        numeric(10,2),
  unit_price        numeric(10,2),
  discount_amount   numeric(10,2),
  purchase_reason   text not null default 'unknown'
    check (purchase_reason in ('normal','offer','planned_other_store','special_product','unknown')),
  match_confidence  numeric(3,2),
  match_method      text,
  source            text not null check (source in ('receipt','saved_trip','checked_item','manual')),
  created_at        timestamptz not null default now(),
  constraint household_purchases_sane check (
    char_length(item_name) between 1 and 120
    and (qty is null or (qty > 0 and qty <= 500))
    and (price_paid is null or (price_paid >= 0 and price_paid < 100000))
    and (unit_price is null or (unit_price > 0 and unit_price < 100000))
    and (match_confidence is null or (match_confidence >= 0 and match_confidence <= 1))
  )
);
create index if not exists household_purchases_item_idx
  on public.household_purchases (household_id, item_name, purchased_at desc);
create index if not exists household_purchases_store_idx
  on public.household_purchases (household_id, chain_code, purchased_at desc);

alter table public.household_purchases enable row level security;
drop policy if exists household_purchases_select on public.household_purchases;
create policy household_purchases_select on public.household_purchases for select to authenticated
  using (public.is_household_member(household_id));
drop policy if exists household_purchases_insert on public.household_purchases;
create policy household_purchases_insert on public.household_purchases for insert to authenticated
  with check (public.is_household_member(household_id));
-- Rettelser (§25: «feil produkt», «kjøper vanligvis på MENY») skjer her.
drop policy if exists household_purchases_update on public.household_purchases;
create policy household_purchases_update on public.household_purchases for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
drop policy if exists household_purchases_delete on public.household_purchases;
create policy household_purchases_delete on public.household_purchases for delete to authenticated
  using (public.is_household_member(household_id));

-- Realtime trenger den ikke. Den leses når statistikk regnes.

-- ---------------------------------------------------------------------
-- 5. Import av det som finnes: fullførte handleturer
-- ---------------------------------------------------------------------
-- De rå kvitteringslinjene fra arbeidsbøkene finnes ikke i basen — bare
-- aggregatene i item_catalog. saved_trips har derimot hver fullført tur
-- med navn, mengde og pris. Kjøres bare første gang (ingen saved_trip-rader
-- fra før), så migrasjonen er trygg å kjøre igjen.
do $$
begin
  if not exists (select 1 from public.household_purchases where source = 'saved_trip') then
    insert into public.household_purchases
      (household_id, purchased_at, item_name, qty, unit, price_paid, purchase_reason, source)
    select t.household_id,
           (t.trip_date::timestamp + interval '12 hours') at time zone 'Europe/Oslo',
           left(trim(e->>'name'), 120),
           case when (e->>'qty') ~ '^[0-9]+(\.[0-9]+)?$' and (e->>'qty')::numeric between 0.001 and 500 then (e->>'qty')::numeric end,
           left(e->>'unit', 12),
           case when (e->>'price') ~ '^[0-9]+(\.[0-9]+)?$' and (e->>'price')::numeric < 100000 then (e->>'price')::numeric end,
           'unknown',
           'saved_trip'
    from public.saved_trips t, jsonb_array_elements(t.items) e
    where jsonb_typeof(t.items) = 'array'
      and coalesce(trim(e->>'name'), '') <> '';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 6. record_price_observations v2 — skriver begge tabellene
-- ---------------------------------------------------------------------
-- Samme signatur som før, så eksisterende klienter virker. Nye valgfrie
-- felt per rad:
--   household_id      → skriver OGSÅ en kjøpslinje, hvis kalleren er medlem
--   source            'receipt' (standard) eller 'kassalapp'
--   ean, kassal_product_id, product_name, brand, package_qty, package_unit
--                     → oppretter/finner produktet (bare når ean eller
--                       kassal_product_id er kjent)
--   original_price, is_offer, discount_amount
--   match_confidence, match_method
--
-- Kassalapp-rader blir observasjoner men IKKE kjøpslinjer (§23): et
-- prisoppslag er ikke bevis på at husholdningen kjøpte noe.
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
    -- Samme vask som før. En rad som ikke holder, hoppes over.
    continue when r.item_name is null or length(trim(r.item_name)) = 0;
    continue when r.price is null or r.price <= 0 or r.price >= 100000;
    continue when r.qty is not null and (r.qty <= 0 or r.qty > 500);
    continue when r.unit_price is not null and (r.unit_price <= 0 or r.unit_price >= 100000);
    continue when r.regular_unit_price is not null and (r.regular_unit_price <= 0 or r.regular_unit_price >= 100000);

    v_source := case when r.source in ('kassalapp') then r.source else 'receipt' end;
    -- Et API-oppslag er aldri sikrere enn 0,9; en kvittering kan være 1,0.
    v_conf := least(greatest(coalesce(r.confidence, 0.6), 0), case when v_source = 'kassalapp' then 0.9 else 1 end);

    -- Produkt: bare når vi har noe å kjenne det igjen på. Uten ean eller
    -- kassal_product_id ville hver stavevariant blitt et nytt «produkt».
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
       r.unit_price, r.regular_unit_price,
       least(coalesce(r.observed_at, now()), now()), v_source, v_conf,
       case when r.ean ~ '^[0-9]{8,14}$' then r.ean end, r.kassal_product_id, v_product_id,
       r.package_qty, left(r.package_unit, 12), r.original_price,
       coalesce(r.is_offer, false) or (r.original_price is not null and r.original_price > r.price)
         or (r.regular_unit_price is not null and r.unit_price is not null and r.regular_unit_price > r.unit_price));
    v_ins := v_ins + 1;

    -- Kjøpslinjen: bare for kvitteringer, bare for husholdninger kalleren
    -- er medlem av. Medlemskapet sjekkes her fordi funksjonen kjører som
    -- eier — RLS gjelder ikke inne i den.
    v_hh := r.household_id;
    if v_source = 'receipt' and v_hh is not null and public.is_household_member(v_hh) then
      v_reason := case
        when coalesce(r.is_offer, false) or (r.original_price is not null and r.original_price > r.price)
          or (r.regular_unit_price is not null and r.unit_price is not null and r.regular_unit_price > r.unit_price)
          then 'offer'
        else 'normal' end;
      insert into public.household_purchases
        (household_id, purchased_at, chain_code, item_name, product_id, qty, unit, price_paid, unit_price,
         discount_amount, purchase_reason, match_confidence, match_method, source)
      values
        (v_hh, least(coalesce(r.observed_at, now()), now()), left(r.store_code, 40), left(r.item_name, 120),
         v_product_id, r.qty, left(r.unit, 12), r.price, r.unit_price,
         case when r.discount_amount is not null and r.discount_amount >= 0 and r.discount_amount < 100000 then r.discount_amount end,
         v_reason,
         case when r.match_confidence is not null then least(greatest(r.match_confidence, 0), 1) end,
         left(r.match_method, 20), 'receipt');
    end if;
  end loop;

  return v_ins;
end;
$$;

revoke all on function public.record_price_observations(jsonb) from public;
grant execute on function public.record_price_observations(jsonb) to authenticated;

comment on function public.record_price_observations(jsonb) is
  'Fase 1 prisintelligens: skriver anonyme prisobservasjoner (felles) og, for '
  'kvitteringer med household_id, husholdningens egne kjøpslinjer (privat). '
  'Kassalapp-rader blir observasjoner men ikke kjøp. Dagskvote per bruker.';

-- ---------------------------------------------------------------------
-- 7. Lesevei for prishistorikk (PriceProvider §22)
-- ---------------------------------------------------------------------
-- Klienter kan ikke lese price_observations direkte (revoked — ellers kunne
-- hele tabellen hentes ut i bulk). Én vare om gangen, høyst 60 rader, er
-- greit: det er det estimatet og «Dere betaler vanligvis …» trenger.
create or replace function public.price_history(p_item text, p_days int default 120)
returns table (
  observed_at timestamptz, price numeric, unit_price numeric, unit text, qty numeric,
  store_code text, source text, confidence numeric, is_offer boolean, product_id bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select o.observed_at, o.price, o.unit_price, o.unit, o.qty, o.store_code, o.source, o.confidence,
         o.is_offer, o.product_id
  from public.price_observations o
  where auth.uid() is not null
    and o.item_name = left(coalesce(p_item, ''), 120)
    and o.observed_at >= now() - make_interval(days => least(greatest(coalesce(p_days, 120), 1), 400))
  order by o.observed_at desc
  limit 60;
$$;
revoke all on function public.price_history(text, int) from public;
grant execute on function public.price_history(text, int) to authenticated;

comment on table public.household_purchases is
  'Husholdningens egne kjøpslinjer. Privat (RLS). Skrives av record_price_observations '
  'for kvitteringer, og fra saved_trips ved første migrering. Aldri koblet til '
  'price_observations, som er anonym med vilje.';
comment on table public.products is
  'Konkrete produkter UNDER en vare i item_catalog («Norvegia Original 1 kg» under «Gulost»). '
  'Opprettes bare når ean eller kassal_product_id er kjent.';
