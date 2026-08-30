-- Abonnement (fase 1: uten betaling) + poeng-innløsning.
--
-- Modellen fra forslaget:
--   15 kr/mnd per HUSHOLDNING · 30 dagers prøvetid · 150 poeng = 1 måned
--   Dagens husholdninger får «grunnlegger»-status: gratis i ett år, som
--   takk for at de var med fra start.
--
-- Fase 1 håndhever INGENTING — ingen sperres ute før det finnes en måte å
-- betale på. Tabellen, innløsningen og statusvisningen legges klare, så
-- Stripe kobles på som fase 2.

-- ---------------------------------------------------------------------------
-- 0) point_events-reglene må utvides FØRST:
--    - kind-sjekken kjente ikke 'tilbud_delt' (triggeren fra delte tilbud
--      ville feilet på neste import!) og trenger 'innløst'
--    - innløsning er negative poeng, så 1..1000-sjekken må slippe dem til
-- ---------------------------------------------------------------------------
alter table public.point_events drop constraint if exists point_events_kind_check;
alter table public.point_events add constraint point_events_kind_check
  check (kind in ('vare_godkjent', 'invitasjon_brukt', 'feil_fikset',
                  'tilbakemelding_løst', 'bonus', 'tilbud_delt', 'innløst'));

alter table public.point_events drop constraint if exists point_events_points_check;
alter table public.point_events add constraint point_events_points_check
  check (points between -1000 and 1000 and points <> 0);

-- ---------------------------------------------------------------------------
-- 1) Abonnementstabellen — én rad per husholdning.
--    Klienter kan bare LESE sin egen; all skriving skjer via SECURITY
--    DEFINER-funksjoner eller service_role (Stripe-webhooken i fase 2).
-- ---------------------------------------------------------------------------
create table if not exists public.subscriptions (
  household_id uuid primary key references public.households(id) on delete cascade,
  status       text not null default 'prøve'
    check (status in ('prøve', 'aktiv', 'poeng', 'grunnlegger', 'utløpt')),
  paid_until   date not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

drop policy if exists subscriptions_select on public.subscriptions;
create policy subscriptions_select on public.subscriptions
  for select to authenticated
  using (public.is_household_member(household_id));
-- Ingen insert/update/delete-policyer med vilje.

-- Grunnleggerne: alle husholdninger som finnes i dag → gratis i ett år.
insert into public.subscriptions (household_id, status, paid_until)
select id, 'grunnlegger', (current_date + interval '1 year')::date
from public.households
on conflict (household_id) do nothing;

-- Nye husholdninger starter med 30 dagers prøvetid, automatisk.
create or replace function public.subscription_on_household()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.subscriptions (household_id, status, paid_until)
  values (new.id, 'prøve', (current_date + interval '30 days')::date)
  on conflict (household_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_subscription_on_household on public.households;
create trigger trg_subscription_on_household after insert on public.households
  for each row execute function public.subscription_on_household();

-- ---------------------------------------------------------------------------
-- 2) Innløsning: 150 poeng → 1 måned gratis for husholdningen.
--    Poengene er personlige; hvem som helst i husholdningen kan bruke sine
--    egne på fellesskapet. Alt skjer i én transaksjon — saldoen kan aldri
--    gå i minus, og måneden legges ALLTID på toppen av gjenstående tid.
-- ---------------------------------------------------------------------------
create or replace function public.redeem_points_for_month(p_household uuid)
returns table (ok boolean, message text, new_paid_until date)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_balance int;
  v_sub     public.subscriptions%rowtype;
begin
  if v_user is null then
    return query select false, 'Ikke innlogget.', null::date; return;
  end if;
  if not public.is_household_member(p_household) then
    return query select false, 'Du er ikke medlem av denne listen.', null::date; return;
  end if;

  select coalesce(sum(points), 0) into v_balance
  from public.point_events where user_id = v_user;
  if v_balance < 150 then
    return query select false,
      'Du har ' || v_balance || ' poeng — innløsning krever 150.', null::date;
    return;
  end if;

  select * into v_sub from public.subscriptions
  where household_id = p_household for update;
  if not found then
    insert into public.subscriptions (household_id, status, paid_until)
    values (p_household, 'poeng', current_date)
    returning * into v_sub;
  end if;

  insert into public.point_events (user_id, kind, points, ref, note)
  values (v_user, 'innløst', -150, gen_random_uuid()::text,
          'Innløst: 1 måned gratis Plukkelisten 🎁');

  update public.subscriptions
  set paid_until = (greatest(paid_until, current_date) + interval '1 month')::date,
      status     = case when status in ('grunnlegger', 'aktiv') then status else 'poeng' end,
      updated_at = now()
  where household_id = p_household
  returning paid_until into new_paid_until;

  return query select true, 'Én måned lagt til! 🎉', new_paid_until;
end;
$$;
