-- Korrekthetsfikser fra revisjonen (bolk 2).

-- «Kom i gang»-steget «Sett familiens porsjoner» var alltid ferdig-huket
-- fordi households.adults har NOT NULL DEFAULT 2 — det kan aldri være null.
-- Eget flagg som settes når porsjonene faktisk er bekreftet.
alter table public.households
  add column if not exists portions_set boolean not null default false;

-- Innløsning: les saldoen PÅ NYTT etter at abonnementsraden er låst, og bruk
-- en rådgivende lås per bruker, så to samtidige innløsninger ikke begge
-- passerer saldo-sjekken og trekker -150 to ganger (saldo i minus).
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

  -- Serialiser innløsninger for denne brukeren.
  perform pg_advisory_xact_lock(hashtext('redeem:' || v_user::text));

  select coalesce(sum(points), 0) into v_balance
  from public.point_events where user_id = v_user;
  if v_balance < 150 then
    return query select false,
      'Du har ' || v_balance || ' poeng — innløsning krever 150.', null::date;
    return;
  end if;

  -- Trekk poengene FØR måneden legges til, så saldoen aldri kan gå i minus.
  insert into public.point_events (user_id, kind, points, ref, note)
  values (v_user, 'innløst', -150, gen_random_uuid()::text,
          'Innløst: 1 måned gratis Plukkelisten 🎁');

  select * into v_sub from public.subscriptions
  where household_id = p_household for update;
  if not found then
    insert into public.subscriptions (household_id, status, paid_until)
    values (p_household, 'poeng', current_date)
    returning * into v_sub;
  end if;

  update public.subscriptions
  set paid_until = (greatest(paid_until, current_date) + interval '1 month')::date,
      status     = case when status in ('grunnlegger', 'aktiv') then status else 'poeng' end,
      updated_at = now()
  where household_id = p_household
  returning paid_until into new_paid_until;

  return query select true, 'Én måned lagt til! 🎉', new_paid_until;
end;
$$;
revoke all on function public.redeem_points_for_month(uuid) from public;
grant execute on function public.redeem_points_for_month(uuid) to authenticated;
