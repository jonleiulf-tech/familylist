-- Fikser create_invite(): «function gen_random_bytes(integer) does not exist».
--
-- gen_random_bytes kommer fra pgcrypto. På Supabase installeres utvidelser
-- i skjemaet `extensions`, ikke i `public` — og funksjonen har search_path
-- låst til `public` (som den skal, for å hindre search_path-angrep mot en
-- SECURITY DEFINER-funksjon). Dermed er gen_random_bytes utenfor rekkevidde.
--
-- Løsningen er ikke å utvide search_path, men å fjerne avhengigheten:
-- gen_random_uuid() ligger i pg_catalog fra PostgreSQL 13 og er alltid
-- tilgjengelig uansett search_path. To UUID-er gir 64 hex-tegn; vi bruker
-- 16 av dem, altså 64 bit — like uråd å gjette som før.

create or replace function public.create_invite()
returns table (code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  hid        uuid;
  new_code   text;
  new_expiry timestamptz;
begin
  hid := public.my_household_id();
  if hid is null then
    raise exception 'Du må ha en husholdning før du kan invitere.' using errcode = 'P0002';
  end if;

  -- 16 hex-tegn = 64 bit entropi.
  new_code := substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
  new_expiry := now() + interval '7 days';

  insert into public.household_invites (household_id, code, created_by, expires_at)
  values (hid, new_code, auth.uid(), new_expiry);

  return query select new_code, new_expiry;
end;
$$;
revoke all on function public.create_invite() from public;
grant execute on function public.create_invite() to authenticated;
