-- Row Level Security. En bruker skal ALDRI kunne hente data fra et prosjekt
-- vedkommende ikke er medlem av. Tilgang håndheves her i databasen, ikke
-- kun i frontend.

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.deliverables enable row level security;
alter table public.milestones enable row level security;
alter table public.tasks enable row level security;
alter table public.time_entries enable row level security;
alter table public.time_entry_participants enable row level security;
alter table public.calendar_events enable row level security;
alter table public.calendar_event_participants enable row level security;
alter table public.activity_log enable row level security;

-- ---------------------------------------------------------------------
-- Hjelpefunksjoner (security definer for å unngå rekursive RLS-oppslag)
-- ---------------------------------------------------------------------
create function public.is_project_member(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = auth.uid()
      and pm.is_active
  );
$$;

create function public.project_role(p_project_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select pm.role
  from public.project_members pm
  where pm.project_id = p_project_id
    and pm.user_id = auth.uid()
    and pm.is_active
  limit 1;
$$;

create function public.is_project_manager(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.project_role(p_project_id) in ('owner', 'admin');
$$;

-- ---------------------------------------------------------------------
-- profiles: alle innloggede kan se grunnleggende profildata (navn/e-post
-- trengs for å vise "hvem gjorde hva" på tvers av prosjekter man deler),
-- men kun eieren kan endre sin egen rad.
-- ---------------------------------------------------------------------
create policy "profiles_select_authenticated" on public.profiles
  for select using (auth.role() = 'authenticated');

create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid());

-- ---------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------
create policy "projects_select_member" on public.projects
  for select using (public.is_project_member(id));

create policy "projects_insert_authenticated" on public.projects
  for insert with check (created_by = auth.uid());

create policy "projects_update_manager" on public.projects
  for update using (public.is_project_manager(id));

create policy "projects_delete_owner" on public.projects
  for delete using (public.project_role(id) = 'owner');

-- ---------------------------------------------------------------------
-- project_members
-- ---------------------------------------------------------------------
create policy "project_members_select_member" on public.project_members
  for select using (public.is_project_member(project_id));

create policy "project_members_insert_manager" on public.project_members
  for insert with check (public.is_project_manager(project_id));

create policy "project_members_update_manager" on public.project_members
  for update using (public.is_project_manager(project_id));

create policy "project_members_delete_manager" on public.project_members
  for delete using (public.is_project_manager(project_id));

-- ---------------------------------------------------------------------
-- Generisk mønster for de resterende prosjekt-koblede tabellene:
-- SELECT for alle medlemmer, INSERT/UPDATE for member+ (ikke viewer),
-- DELETE for admin/owner. Viewer har kun leseadgang.
-- ---------------------------------------------------------------------
create function public.can_edit_project(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.project_role(p_project_id) in ('owner', 'admin', 'member');
$$;

-- deliverables
create policy "deliverables_select" on public.deliverables
  for select using (public.is_project_member(project_id));
create policy "deliverables_insert" on public.deliverables
  for insert with check (public.can_edit_project(project_id));
create policy "deliverables_update" on public.deliverables
  for update using (public.can_edit_project(project_id));
create policy "deliverables_delete" on public.deliverables
  for delete using (public.is_project_manager(project_id));

-- milestones
create policy "milestones_select" on public.milestones
  for select using (public.is_project_member(project_id));
create policy "milestones_insert" on public.milestones
  for insert with check (public.can_edit_project(project_id));
create policy "milestones_update" on public.milestones
  for update using (public.can_edit_project(project_id));
create policy "milestones_delete" on public.milestones
  for delete using (public.is_project_manager(project_id));

-- tasks
create policy "tasks_select" on public.tasks
  for select using (public.is_project_member(project_id));
create policy "tasks_insert" on public.tasks
  for insert with check (public.can_edit_project(project_id));
create policy "tasks_update" on public.tasks
  for update using (public.can_edit_project(project_id));
create policy "tasks_delete" on public.tasks
  for delete using (public.is_project_manager(project_id));

-- time_entries
create policy "time_entries_select" on public.time_entries
  for select using (public.is_project_member(project_id));
create policy "time_entries_insert" on public.time_entries
  for insert with check (public.can_edit_project(project_id));
create policy "time_entries_update" on public.time_entries
  for update using (public.can_edit_project(project_id));
create policy "time_entries_delete" on public.time_entries
  for delete using (public.can_edit_project(project_id));

-- time_entry_participants (arves fra time_entries.project_id via join)
create policy "time_entry_participants_select" on public.time_entry_participants
  for select using (
    exists (
      select 1 from public.time_entries te
      where te.id = time_entry_id and public.is_project_member(te.project_id)
    )
  );
create policy "time_entry_participants_insert" on public.time_entry_participants
  for insert with check (
    exists (
      select 1 from public.time_entries te
      where te.id = time_entry_id and public.can_edit_project(te.project_id)
    )
  );
create policy "time_entry_participants_delete" on public.time_entry_participants
  for delete using (
    exists (
      select 1 from public.time_entries te
      where te.id = time_entry_id and public.can_edit_project(te.project_id)
    )
  );

-- calendar_events
create policy "calendar_events_select" on public.calendar_events
  for select using (public.is_project_member(project_id));
create policy "calendar_events_insert" on public.calendar_events
  for insert with check (public.can_edit_project(project_id));
create policy "calendar_events_update" on public.calendar_events
  for update using (public.can_edit_project(project_id));
create policy "calendar_events_delete" on public.calendar_events
  for delete using (public.can_edit_project(project_id));

-- calendar_event_participants
create policy "calendar_event_participants_select" on public.calendar_event_participants
  for select using (
    exists (
      select 1 from public.calendar_events ce
      where ce.id = event_id and public.is_project_member(ce.project_id)
    )
  );
create policy "calendar_event_participants_insert" on public.calendar_event_participants
  for insert with check (
    exists (
      select 1 from public.calendar_events ce
      where ce.id = event_id and public.can_edit_project(ce.project_id)
    )
  );
create policy "calendar_event_participants_delete" on public.calendar_event_participants
  for delete using (
    exists (
      select 1 from public.calendar_events ce
      where ce.id = event_id and public.can_edit_project(ce.project_id)
    )
  );

-- activity_log: kun lesing for medlemmer; skriving skjer via service-role
-- (server actions), ikke direkte fra klienten.
create policy "activity_log_select" on public.activity_log
  for select using (public.is_project_member(project_id));
create policy "activity_log_insert" on public.activity_log
  for insert with check (public.can_edit_project(project_id));
