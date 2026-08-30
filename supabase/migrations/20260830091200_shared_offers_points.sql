-- Delte tilbud: kundeavis-skann og manuell import blir et FELLESGODE.
--
-- Tilbud er ferskvare med lav risiko (utløper etter en uke), og raden er
-- alt gjennomgått av den som importerte. Derfor deles de med alle brukere
-- (household_id null) etter samme modell som prisobservasjonene:
-- append-only — alle innloggede kan bidra, ingen kan endre eller slette
-- andres bidrag (opprydding skjer via service_role/admin).
--
-- Bidragsyteren stemples i created_by og belønnes med Plukkepoeng:
-- +15 per butikk per uke (unik ref hindrer poeng-farming av 70 rader).

alter table public.offers
  add column if not exists created_by uuid references auth.users(id) on delete set null;

drop policy if exists offers_shared_insert on public.offers;
create policy offers_shared_insert on public.offers
  for insert to authenticated
  with check (household_id is null and created_by = auth.uid());

create or replace function public.points_on_shared_offer()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.household_id is null and new.created_by is not null
     and new.source_type in ('flyer_scan', 'manual_import') then
    perform public.award_points(new.created_by, 'tilbud_delt', 15,
      'tilbud:' || coalesce(new.store_code, '?') || ':' || to_char(now(), 'IYYY-IW'),
      'Delte ukens tilbud fra ' || coalesce(new.store_name, 'butikken') || ' med fellesskapet');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_points_shared_offer on public.offers;
create trigger trg_points_shared_offer after insert on public.offers
  for each row execute function public.points_on_shared_offer();
