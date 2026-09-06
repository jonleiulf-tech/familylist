-- ProsjektFlyt – grunnskjema
-- Normalisert relasjonell modell. UUID-nøkler. Bevisste ON DELETE-regler.
-- Statusverdier/roller håndheves som CHECK-constraints (ikke Postgres ENUM)
-- slik at nye verdier kan legges til uten å endre kolonnetype – selve
-- listen med gyldige verdier er speilet i src/types/enums.ts.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- profiles (1:1 med auth.users)
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text,
  avatar_url text,
  locale text not null default 'nb-NO',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  project_number text,
  description text,
  client_name text,
  project_manager_id uuid references public.profiles (id) on delete set null,
  start_date date,
  planned_end_date date,
  actual_end_date date,
  status text not null default 'planning'
    check (status in ('planning', 'active', 'on_hold', 'completed', 'archived')),
  color text not null default '#2563eb',
  gantt_resolution_default text not null default 'week'
    check (gantt_resolution_default in ('day', 'week', 'month')),
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

-- ---------------------------------------------------------------------
-- project_members
-- ---------------------------------------------------------------------
create table public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  invited_email text,
  first_name text not null,
  last_name text not null default '',
  email text,
  phone text,
  role text not null default 'member'
    check (role in ('owner', 'admin', 'member', 'viewer')),
  project_role_title text,
  is_active boolean not null default true,
  linkedin_url text,
  cv_url text,
  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_members_identity_check
    check (user_id is not null or invited_email is not null)
);

create unique index project_members_project_user_uq
  on public.project_members (project_id, user_id)
  where user_id is not null;

-- ---------------------------------------------------------------------
-- deliverables (rapportdeler / arbeidskategorier)
-- ---------------------------------------------------------------------
create table public.deliverables (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- milestones
-- ---------------------------------------------------------------------
create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null,
  description text,
  responsible_member_id uuid references public.project_members (id) on delete set null,
  planned_start_date date,
  planned_end_date date,
  actual_start_date date,
  actual_end_date date,
  estimated_hours numeric(8, 2),
  estimated_hours_per_week numeric(6, 2),
  progress_percent smallint not null default 0
    check (progress_percent between 0 and 100),
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'completed', 'delayed')),
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'critical')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint milestones_planned_dates_order
    check (planned_start_date is null or planned_end_date is null or planned_end_date >= planned_start_date),
  constraint milestones_actual_dates_order
    check (actual_start_date is null or actual_end_date is null or actual_end_date >= actual_start_date)
);

create index milestones_project_idx on public.milestones (project_id);

-- ---------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null,
  description text,
  assignee_id uuid references public.project_members (id) on delete set null,
  start_date date,
  due_date date,
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'blocked', 'done')),
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'critical')),
  milestone_id uuid references public.milestones (id) on delete set null,
  created_by uuid not null references public.profiles (id) on delete restrict,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_project_idx on public.tasks (project_id);
create index tasks_milestone_idx on public.tasks (milestone_id);
create index tasks_assignee_idx on public.tasks (assignee_id);

-- ---------------------------------------------------------------------
-- time_entries (varighet lagres KUN som hele minutter – aldri desimaltimer)
-- ---------------------------------------------------------------------
create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  milestone_id uuid references public.milestones (id) on delete set null,
  task_id uuid references public.tasks (id) on delete set null,
  member_id uuid not null references public.project_members (id) on delete cascade,
  description text,
  deliverable_id uuid references public.deliverables (id) on delete set null,
  work_date date not null,
  duration_minutes integer not null check (duration_minutes > 0),
  participant_mode text not null default 'single'
    check (participant_mode in ('single', 'selected', 'all')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index time_entries_project_idx on public.time_entries (project_id);
create index time_entries_milestone_idx on public.time_entries (milestone_id);
create index time_entries_member_idx on public.time_entries (member_id);
create index time_entries_work_date_idx on public.time_entries (work_date);

create table public.time_entry_participants (
  time_entry_id uuid not null references public.time_entries (id) on delete cascade,
  member_id uuid not null references public.project_members (id) on delete cascade,
  primary key (time_entry_id, member_id)
);

-- ---------------------------------------------------------------------
-- calendar_events
-- ---------------------------------------------------------------------
create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null,
  description text,
  start_datetime timestamptz not null,
  end_datetime timestamptz,
  location text,
  created_by uuid not null references public.profiles (id) on delete restrict,
  milestone_id uuid references public.milestones (id) on delete set null,
  task_id uuid references public.tasks (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index calendar_events_project_idx on public.calendar_events (project_id);
create index calendar_events_start_idx on public.calendar_events (start_datetime);

create table public.calendar_event_participants (
  event_id uuid not null references public.calendar_events (id) on delete cascade,
  member_id uuid not null references public.project_members (id) on delete cascade,
  primary key (event_id, member_id)
);

-- ---------------------------------------------------------------------
-- activity_log
-- ---------------------------------------------------------------------
create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  entity_type text not null
    check (entity_type in ('project', 'milestone', 'task', 'time_entry', 'member', 'calendar_event', 'deliverable')),
  entity_id uuid not null,
  action text not null
    check (action in ('created', 'updated', 'deleted', 'completed', 'status_changed', 'invited', 'converted_to_milestone')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index activity_log_project_idx on public.activity_log (project_id, created_at desc);

-- ---------------------------------------------------------------------
-- updated_at-triggere
-- ---------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at before update on public.profiles
  for each row execute procedure public.set_updated_at();
create trigger set_updated_at before update on public.projects
  for each row execute procedure public.set_updated_at();
create trigger set_updated_at before update on public.project_members
  for each row execute procedure public.set_updated_at();
create trigger set_updated_at before update on public.milestones
  for each row execute procedure public.set_updated_at();
create trigger set_updated_at before update on public.tasks
  for each row execute procedure public.set_updated_at();
create trigger set_updated_at before update on public.time_entries
  for each row execute procedure public.set_updated_at();
create trigger set_updated_at before update on public.calendar_events
  for each row execute procedure public.set_updated_at();
