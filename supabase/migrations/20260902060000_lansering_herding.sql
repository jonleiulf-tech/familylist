-- Herding før lansering.
--
-- Elleve gjennomganger av koden natten før første ekte brukere. Dette er
-- de funnene som hører hjemme i databasen. Resten ligger i appen.

-- ---------------------------------------------------------------------------
-- 1) KRITISK: et medlem kunne gjøre seg selv til eier — eller flytte seg
--    inn i en fremmed liste.
--
--    members_update begrenset hvilken RAD du kunne endre, ikke hvilke
--    KOLONNER. Raden er din egen, så «sett role = owner» gikk rett gjennom,
--    og «sett household_id = <en annen liste>» slapp deg inn igjen etter at
--    du var kastet ut.
--
--    RLS kan ikke se forskjell på kolonner. Rettighetene kan: appen skal
--    bare kunne endre visningsnavn, initialer og avatar på sin egen rad.
--    Alt annet skjer gjennom funksjonene, som kjører som eier av databasen.
-- ---------------------------------------------------------------------------
revoke update on public.members from authenticated;
-- initials regner seg selv ut av display_name (generated always), og kan
-- ikke skrives. Appen skrev den likevel, og hvert navnebytte feilet.
grant update (display_name, avatar) on public.members to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Tilgangsregelen skal si det samme som appen, også på kantene.
--
--    To avvik ble funnet mot src/lib/billing.js:
--      · en ukjent status ga tilgang her, men ikke i appen. Nå stenger
--        begge — en status vi ikke kjenner er en feil, ikke en gave.
--      · current_date er UTC. Mellom midnatt og klokka to norsk tid var
--        databasen en dag bak appen, og et abonnement kunne se utløpt ut i
--        appen mens databasen mente det levde.
-- ---------------------------------------------------------------------------
create or replace function public.oslo_today()
returns date language sql stable as $$
  select (now() at time zone 'Europe/Oslo')::date;
$$;

create or replace function public.household_has_access(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case s.status
      when 'grunnlegger' then true
      when 'utløpt'      then false
      when 'forfalt'     then s.paid_until >= public.oslo_today() - 5
      when 'prøve'       then s.paid_until >= public.oslo_today()
      when 'aktiv'       then s.paid_until >= public.oslo_today()
      when 'poeng'       then s.paid_until >= public.oslo_today()
      else false          -- ukjent status: samme svar som appen gir
    end
    from public.subscriptions s where s.household_id = hid
  ), true);   -- ingen rad = ingen mening om saken; vi stenger ingen ute på tvil
$$;
revoke all on function public.household_has_access(uuid) from public;
grant execute on function public.household_has_access(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Nattjobben skal ikke stenge en kunde midt i en betaling.
--
--    Overgangen fra prøve til betalt tar hos Stripe fra sekunder til flere
--    timer. Kjørte jobben 04:10 før hendelsen kom, sto familien i butikken
--    klokka åtte uten å få legge til varer — for et abonnement som ble
--    trukket klokka ni.
--
--    Rader med et abonnement hos Stripe røres ikke i det hele tatt: der
--    er det webhooken som eier sannheten.
-- ---------------------------------------------------------------------------
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

  return n + m;   -- før returnerte den bare den første, og var ubrukelig
end;
$$;
revoke all on function public.expire_subscriptions() from public;

-- ---------------------------------------------------------------------------
-- 4) KRITISK: siste medlem forlot lista, husholdningen ble slettet — og
--    Stripe fortsatte å trekke i det uendelige.
--
--    Abonnementsraden forsvant med husholdningen (on delete cascade), så
--    hverken appen eller kundeportalen kunne nå det lenger. Eneste utvei
--    var en e-post til oss.
--
--    Vi nekter nå å slette en husholdning som har et levende abonnement.
--    Å si opp først er én ekstra handling; å bli trukket for noe man ikke
--    kan se er noe helt annet.
-- ---------------------------------------------------------------------------
create or replace function public.leave_shared_list(list_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  remaining int;
  owners_left int;
  live_sub text;
begin
  if not exists (select 1 from public.members m
                 where m.household_id = list_id and m.user_id = uid) then
    raise exception 'Du er ikke medlem av denne listen.' using errcode = 'P0002';
  end if;

  -- Er du den siste, blir lista slettet. Da må abonnementet være avsluttet
  -- først — ellers står det og trekker uten at noen kan stoppe det.
  select count(*) into remaining from public.members m
  where m.household_id = list_id and m.user_id <> uid;

  if remaining = 0 then
    select s.stripe_subscription_id into live_sub
    from public.subscriptions s
    where s.household_id = list_id
      and s.stripe_subscription_id is not null
      and s.status in ('prøve', 'aktiv', 'forfalt');
    if live_sub is not null then
      raise exception 'Si opp abonnementet først — ellers fortsetter det å trekke etter at listen er borte. Du finner oppsigelsen under Min profil og Abonnement.'
        using errcode = 'P0001';
    end if;
  end if;

  delete from public.members m where m.household_id = list_id and m.user_id = uid;

  if remaining = 0 then
    delete from public.households h where h.id = list_id;
    return;
  end if;

  select count(*) into owners_left from public.members m
  where m.household_id = list_id and m.role = 'owner';

  if owners_left = 0 then
    update public.members m set role = 'owner'
    where m.household_id = list_id
      and m.created_at = (select min(m2.created_at) from public.members m2
                          where m2.household_id = list_id);
  end if;
end;
$$;
revoke all on function public.leave_shared_list(uuid) from public;
grant execute on function public.leave_shared_list(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Hvem endret listen sist?
--
--    Varselet «X ble oppdatert» sammenlignet med created_by — hvem som
--    LAGET lista. Den som talte i en telleliste andre hadde laget, fikk
--    dermed et varsel per trykk om sin egen telling, mens den som burde
--    fått beskjed ikke fikk noe.
-- ---------------------------------------------------------------------------
alter table public.custom_lists
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

grant update (name, items, shared, type, updated_by) on public.custom_lists to authenticated;

-- De to atomiske tellefunksjonene må stemple seg selv.
create or replace function public.count_bump(p_list uuid, p_item text, p_delta int)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare v_items jsonb;
begin
  update public.custom_lists c
  set items = coalesce((
        select jsonb_agg(
                 case when e.value->>'id' = p_item
                      then jsonb_set(e.value, '{qty}',
                             to_jsonb(greatest(0, coalesce((e.value->>'qty')::int, 0) + p_delta)))
                      else e.value end
                 order by e.ord)
        from jsonb_array_elements(c.items) with ordinality as e(value, ord)
      ), '[]'::jsonb),
      updated_by = auth.uid()
  where c.id = p_list
  returning c.items into v_items;
  return v_items;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) «Venner»-oppsettet lagde to lister — og to abonnementer.
--
--    Onboarding kaller bootstrap_household(navn, null) for å få satt
--    profilnavnet FØR listen lages. Men funksjonen lagde alltid en
--    husholdning, så en som valgte «Venner → Hyttetur» endte med både
--    «Hyttetur» og en «jon-husholdningen» de aldri hadde bedt om — med
--    tretti middager og sin egen prøveperiode på 15 kr i måneden.
--
--    Uten navn oppretter vi nå bare profilen.
-- ---------------------------------------------------------------------------
-- MERK: «default null» MÅ være med. Postgres nekter å fjerne en
-- standardverdi fra en funksjon som finnes (42P13), og hele migrasjonen
-- ruller tilbake på det.
create or replace function public.bootstrap_household(display_name text, household_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  hid uuid;
  nm  text := coalesce(nullif(trim(display_name), ''), 'Meg');
begin
  if uid is null then
    raise exception 'Ikke innlogget.' using errcode = '28000';
  end if;

  insert into public.profiles (user_id, display_name) values (uid, nm)
    on conflict (user_id) do update set display_name = excluded.display_name;

  select m.household_id into hid from public.members m where m.user_id = uid
  order by m.created_at limit 1;
  if hid is not null then
    return hid;
  end if;

  -- Ingen listenavn: kalleren skal lage listen selv rett etterpå.
  if nullif(trim(household_name), '') is null then
    return null;
  end if;

  insert into public.households (name, kind)
  values (trim(household_name), 'familie')
  returning id into hid;

  insert into public.members (household_id, user_id, display_name, role)
  values (hid, uid, nm, 'owner');

  insert into public.meals (household_id, name, category, ingredients)
  select hid, l.name, l.category, l.ingredients from public.meal_library l
  on conflict (household_id, name) do nothing;

  insert into public.rules (household_id, scope, rule_type, amount, weekdays, enabled)
  values (hid, 'Fisk', 'min', 2, '{}', true),
         (hid, 'Taco', 'weekday', 1, '{5}', true),
         (hid, 'Vegetar', 'interval', 2, '{}', false);   -- eksempel, avslått

  return hid;
end;
$$;
revoke all on function public.bootstrap_household(text, text) from public;
grant execute on function public.bootstrap_household(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7) En javascript:-lenke på en middag kunne kjøre kode hos de andre i
--    listen. Appen saniterer nå lenken, og databasen slipper den ikke inn.
-- ---------------------------------------------------------------------------
update public.meals set instructions_url = null
where instructions_url is not null and instructions_url !~* '^https?://';

alter table public.meals drop constraint if exists meals_instructions_url_http;
alter table public.meals add constraint meals_instructions_url_http
  check (instructions_url is null or instructions_url ~* '^https?://');

-- ---------------------------------------------------------------------------
-- 8) Fellestilbudene: én bruker kunne fylle feeden for alle.
--    Ingen kvote, ingen lengdegrense, ingen grense på hvor lenge et
--    «tilbud» kunne stå. Nå må teksten ligne et varenavn, prisen en pris,
--    og gyldigheten en uke eller tre — ikke til år 2099.
-- ---------------------------------------------------------------------------
alter table public.offers drop constraint if exists offers_sane_name;
alter table public.offers add constraint offers_sane_name
  check (char_length(product_name) between 2 and 120);

alter table public.offers drop constraint if exists offers_sane_price;
alter table public.offers add constraint offers_sane_price
  check (price is null or (price > 0 and price < 100000));

alter table public.offers drop constraint if exists offers_sane_valid_to;
alter table public.offers add constraint offers_sane_valid_to
  check (valid_to is null or valid_to <= current_date + 90);

-- Prisobservasjonene var helt uten vern, og kunne forgiftes i bulk.
alter table public.price_observations drop constraint if exists price_obs_sane;
alter table public.price_observations add constraint price_obs_sane
  check (price > 0 and price < 100000 and char_length(item_name) between 1 and 120);
