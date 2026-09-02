-- Plukkepoeng for kvitteringer.
--
-- Kvitteringen er det mest verdifulle bidraget noen kan gi: den forteller
-- hva varene FAKTISK koster og hvor mye en familie faktisk kjøper. Piloten
-- 2. september viste hvorfor det trengs — estimatet lå 955 kroner under det
-- kassa sa. Likevel var kvitteringen det eneste bidraget som ikke ga poeng.
-- Godkjent vare ga 25, brukt invitasjon 50, delt tilbud 15, kvittering 0.
--
-- Satsen: 20 poeng per kvittering, høyst 8 kvitteringer i måneden per
-- husholdning. Taket er tilsiktet: 8 × 20 = 160 poeng, og 150 poeng er én
-- måned gratis. Den som laster opp kvitteringene sine, bruker altså appen
-- gratis — men kan ikke tjene mer enn det, uansett hvor mange kvitteringer
-- som mates inn.
--
-- Poengene tildeles av databasen, aldri av klienten. Klienten får ikke
-- skrive i receipt_uploads i det hele tatt: alt går gjennom
-- log_receipt_upload(), som selv bestemmer satsen. En klient som kunne
-- oppgi antall poeng, kunne oppgitt 1000.

-- ---------------------------------------------------------------------------
-- 0) kind-sjekken må kjenne 'kvittering' FØR triggeren kan bruke den.
-- ---------------------------------------------------------------------------
alter table public.point_events drop constraint if exists point_events_kind_check;
alter table public.point_events add constraint point_events_kind_check
  check (kind in ('vare_godkjent', 'invitasjon_brukt', 'feil_fikset',
                  'tilbakemelding_løst', 'bonus', 'tilbud_delt', 'innløst',
                  'kvittering'));

-- ---------------------------------------------------------------------------
-- 1) Kvitteringskvitteringen: én rad per opplastet kvittering.
--
--    Denne raden er IKKE kvitteringens innhold — varelinjene ligger anonymt
--    i price_observations, og mengdene i item_habits. Her står bare nok til
--    å kjenne igjen samme kvittering på nytt, og til å vite hvem som skal
--    ha poengene.
-- ---------------------------------------------------------------------------
create table if not exists public.receipt_uploads (
  id          uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  store_code  text not null,
  receipt_date date not null,
  line_count  integer not null check (line_count between 2 and 400),
  total       numeric(10, 2) not null check (total > 0 and total < 100000),
  source      text check (source in ('txt', 'pdf', 'ocr')),
  created_at  timestamptz not null default now()
);

-- Samme kvittering to ganger gir poeng én gang. Butikk + dato + totalsum
-- er nok: to ekte handleturer i samme butikk samme dag med identisk
-- ørebeløp finnes praktisk talt ikke.
create unique index if not exists receipt_uploads_unik
  on public.receipt_uploads (household_id, store_code, receipt_date, total);

create index if not exists receipt_uploads_household_idx
  on public.receipt_uploads (household_id, created_at desc);

alter table public.receipt_uploads enable row level security;

-- Husholdningen får SE sine egne opplastinger («du har lastet opp 6 denne
-- måneden»). Ingen skriving fra klienten — verken insert, update eller
-- delete har noen policy, og uten policy er svaret nei.
drop policy if exists receipt_uploads_select on public.receipt_uploads;
create policy receipt_uploads_select on public.receipt_uploads
  for select to authenticated
  using (public.is_household_member(household_id));

-- Belte og bukseseler: selv om noen skulle legge inn en skrivepolicy ved
-- et uhell senere, mangler rollen rettigheten.
revoke insert, update, delete on public.receipt_uploads from authenticated;

-- ---------------------------------------------------------------------------
-- 2) Registrering + poeng, i én operasjon.
--
--    Returnerer status i stedet for å kaste. En RAISE ville rullet tilbake
--    hele transaksjonen — også raden vi nettopp la inn — og det var akkurat
--    den fellen invitasjonskodene gikk i: den loggede feilen forsvant
--    sammen med forsøket den skulle bremse.
-- ---------------------------------------------------------------------------

/** Poeng per godkjent kvittering. */
create or replace function public.receipt_points_rate() returns integer
  language sql immutable set search_path = public as $$ select 20 $$;

/** Høyst så mange kvitteringer gir poeng per husholdning per måned. */
create or replace function public.receipt_points_cap() returns integer
  language sql immutable set search_path = public as $$ select 8 $$;

create or replace function public.log_receipt_upload(
  p_household uuid,
  p_store     text,
  p_date      date,
  p_lines     integer,
  p_total     numeric,
  p_source    text default null
)
returns table (ok boolean, points integer, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_id      uuid;
  v_month   integer;
  v_rate    integer := public.receipt_points_rate();
  v_cap     integer := public.receipt_points_cap();
begin
  if v_user is null then
    return query select false, 0, 'Ikke innlogget.'; return;
  end if;
  if not public.is_household_member(p_household) then
    return query select false, 0, 'Du er ikke medlem av denne listen.'; return;
  end if;
  -- Samme kontroller som validateReceipt() gjør i appen. En klient kan
  -- omgås; databasen kan den ikke.
  if p_lines is null or p_lines < 2 then
    return query select false, 0, 'Kvitteringen må ha minst to varelinjer.'; return;
  end if;
  if p_total is null or p_total <= 0 then
    return query select false, 0, 'Kvitteringen mangler totalsum.'; return;
  end if;
  if p_date is null or p_date > (public.oslo_today() + 1)
     or p_date < (public.oslo_today() - interval '400 days')::date then
    return query select false, 0, 'Datoen på kvitteringen er utenfor rimelighetens grenser.'; return;
  end if;

  insert into public.receipt_uploads
    (household_id, user_id, store_code, receipt_date, line_count, total, source)
  values
    (p_household, v_user, coalesce(nullif(trim(p_store), ''), 'ukjent'), p_date,
     least(p_lines, 400), round(p_total, 2), nullif(p_source, ''))
  on conflict (household_id, store_code, receipt_date, total) do nothing
  returning id into v_id;

  if v_id is null then
    -- Ikke en feil. Kvitteringen er alt registrert, og prisene i den er
    -- alt lært — men poengene er utdelt.
    return query select true, 0, 'Denne kvitteringen var alt registrert.'; return;
  end if;

  select count(*) into v_month
  from public.receipt_uploads
  where household_id = p_household
    and created_at >= date_trunc('month', now());

  if v_month > v_cap then
    return query select true, 0,
      'Kvitteringen er lagret. Poengtaket for denne måneden (' || v_cap || ' kvitteringer) er nådd.';
    return;
  end if;

  perform public.award_points(v_user, 'kvittering', v_rate, v_id::text,
    'Kvittering fra ' || coalesce(nullif(trim(p_store), ''), 'butikk') || ' — ' || p_lines || ' varelinjer');

  return query select true, v_rate, 'Takk! +' || v_rate || ' Plukkepoeng.';
end;
$$;

-- Bare innloggede brukere, og bare for sin egen husholdning (sjekket inni).
revoke all on function public.log_receipt_upload(uuid, text, date, integer, numeric, text) from public;
grant execute on function public.log_receipt_upload(uuid, text, date, integer, numeric, text) to authenticated;

comment on table public.receipt_uploads is
  'Én rad per opplastet kvittering — nok til å kjenne igjen en duplikat og '
  'tildele Plukkepoeng. Varelinjene ligger anonymt i price_observations.';
