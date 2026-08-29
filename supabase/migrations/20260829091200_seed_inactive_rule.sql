-- Prototypen viste «Inaktive regler» med en avslått eksempelregel:
-- Vegetar innimellom — minst én vegetarmiddag annenhver uke.
-- Seedes AVSLÅTT i bootstrap, så nye brukere ser hva av/på-skillet er til
-- uten at regelen påvirker planen før de selv vil.

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

  select m.household_id into hid from public.members m where m.user_id = uid
  order by m.created_at limit 1;
  if hid is not null then
    insert into public.profiles (user_id, display_name) values (uid, nm)
      on conflict (user_id) do update set display_name = excluded.display_name;
    return hid;
  end if;

  insert into public.households (name, kind)
  values (coalesce(nullif(trim(household_name), ''), nm || '-husholdningen'), 'familie')
  returning id into hid;

  insert into public.members (household_id, user_id, display_name, role)
  values (hid, uid, nm, 'owner');

  insert into public.profiles (user_id, display_name) values (uid, nm)
    on conflict (user_id) do update set display_name = excluded.display_name;

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
