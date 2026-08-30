-- Generelle feilrapporter fra brukerne («Rapporter en feil» i profilmenyen).
-- Ikke det samme som item_reports (feil på enkeltvarer, rettes automatisk
-- hver natt) — dette er fritekst om alt mulig, og leses av administratoren
-- i adminpanelet. Brukere ser bare sine egne rapporter; status endres kun
-- av admin-funksjonen (service_role).

create table if not exists public.app_feedback (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete set null,
  household_id uuid references public.households(id) on delete set null,
  message      text not null check (char_length(message) between 3 and 4000),
  context      text,                    -- fanen/skjermen rapporten kom fra
  status       text not null default 'ny' check (status in ('ny', 'løst')),
  resolved_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists app_feedback_status_idx on public.app_feedback(status) where status = 'ny';

alter table public.app_feedback enable row level security;

drop policy if exists app_feedback_insert on public.app_feedback;
create policy app_feedback_insert on public.app_feedback
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists app_feedback_select on public.app_feedback;
create policy app_feedback_select on public.app_feedback
  for select to authenticated
  using (user_id = auth.uid());
