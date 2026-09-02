-- Kvitteringen skal lære appen hva ting koster og hvor mye vi pleier å kjøpe.
--
-- Piloten 2. september: estimatet sa 2 326 kr, regningen ble 3 281. To feil
-- som skjulte hverandre — 93 artikler kjøpt mot 46 linjer på listen, mens
-- prisene på de mest kjøpte varene lå 2-3 ganger for høyt. Kvitteringen
-- inneholdt svaret på begge, men observasjonene lagret bare navn og
-- linjebeløp, og INGEN leste tabellen etterpå.

-- ---------------------------------------------------------------------------
-- 1) Observasjonene bærer nå mengde, enhetspris og ORDINÆR enhetspris.
--
--    Ordinærprisen er det viktigste feltet: agurken kostet 16,74, men det
--    var 40 % avslag, og ordinært 27,90. Lærer vi tilbudsprisen som
--    «prisen», blir neste ukes estimat for lavt — og feilen ser ut som en
--    forbedring.
-- ---------------------------------------------------------------------------
alter table public.price_observations
  add column if not exists qty                numeric(10,3),
  add column if not exists unit               text,
  add column if not exists unit_price         numeric(10,2),
  add column if not exists regular_unit_price numeric(10,2);

-- unit_price er IKKE en ny kolonne — den har ligget der siden det første
-- skjemaet. En eneste gammel rad med 0 eller et absurd tall ville derfor
-- fått hele denne filen til å rulle tilbake, og migrasjonen ville aldri
-- blitt kjørt. Ryddes først, med samme grenser som sjekken under.
update public.price_observations set unit_price = null
 where unit_price is not null and (unit_price <= 0 or unit_price >= 100000);

-- Fornuftsgrenser, samme tanke som på offers: en «pris» på 0 eller 100 000
-- er en lesefeil, og en slik rad skal ikke kunne forgifte snittet.
--
-- Mengdegrensen er den SAMME som item_habits bruker (500). Var de ulike,
-- slapp en mengde på 5 000 inn i observasjonene og ble avvist av vanene —
-- og da forsvant hele kvitteringens vaner uten et ord til brukeren.
alter table public.price_observations drop constraint if exists price_obs_units_sane;
alter table public.price_observations add constraint price_obs_units_sane check (
  (qty is null or (qty > 0 and qty <= 500))
  and (unit is null or char_length(unit) <= 12)
  and (unit_price is null or (unit_price > 0 and unit_price < 100000))
  and (regular_unit_price is null or (regular_unit_price > 0 and regular_unit_price < 100000))
);

-- Læringsjobben henter «alt nyere enn 120 dager», sortert på tid, og
-- grupperer per navn i minnet. Da må tiden ligge FØRST i indeksen: med
-- item_name først ble det full tabellskanning og sortering.
create index if not exists price_obs_observed_idx
  on public.price_observations (observed_at desc);
create index if not exists price_obs_item_time_idx
  on public.price_observations (item_name, observed_at desc);

-- ---------------------------------------------------------------------------
-- 2) Husholdningens egne vaner: hvor mye VI pleier å kjøpe.
--
--    Prisene er et fellesgode og ligger i item_catalog. Mengden er ikke et
--    fellesgode — at én familie kjøper tre havredrikker sier ingenting om
--    hva naboen trenger. Derfor en egen tabell med household_id, bak RLS.
-- ---------------------------------------------------------------------------
create table if not exists public.item_habits (
  household_id   uuid not null references public.households(id) on delete cascade,
  item_name      text not null,
  usual_qty      numeric(10,3) not null,
  unit           text,
  times_bought   int not null default 1,
  last_bought_at timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (household_id, item_name),
  constraint item_habits_sane check (
    usual_qty > 0 and usual_qty < 1000
    and char_length(item_name) between 1 and 120
    and (unit is null or char_length(unit) <= 12)
  )
);

alter table public.item_habits enable row level security;

drop policy if exists item_habits_member on public.item_habits;
create policy item_habits_member on public.item_habits
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- ---------------------------------------------------------------------------
-- 3) Spor av læringen på varen selv, slik at jobben kan kjøre igjen uten å
--    gjøre samme arbeid, og slik at appen kan si HVOR prisen kommer fra.
-- ---------------------------------------------------------------------------
alter table public.item_catalog
  add column if not exists price_learned_at timestamptz,
  add column if not exists price_obs_count  int;
