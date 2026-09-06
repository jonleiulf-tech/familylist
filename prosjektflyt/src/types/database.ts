import type {
  ActivityAction,
  EntityType,
  GanttResolution,
  MilestoneStatus,
  ParticipantMode,
  Priority,
  ProjectMemberRole,
  ProjectStatus,
  TaskStatus,
} from './enums';

/**
 * Rad-typer som speiler Postgres-skjemaet 1:1 (se supabase/migrations).
 * Alle id-er er UUID (string). Datoer lagres som ISO-dato (YYYY-MM-DD) eller
 * ISO-timestamp (YYYY-MM-DDTHH:mm:ssZ) – aldri som uketall eller flyttall.
 */

export type Profile = {
  id: string; // = auth.users.id
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  locale: string;
  created_at: string;
  updated_at: string;
}

export type Project = {
  id: string;
  name: string;
  project_number: string | null;
  description: string | null;
  client_name: string | null;
  project_manager_id: string | null;
  start_date: string | null;
  planned_end_date: string | null;
  actual_end_date: string | null;
  status: ProjectStatus;
  color: string;
  gantt_resolution_default: GanttResolution;
  created_by: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export type ProjectMember = {
  id: string;
  project_id: string;
  user_id: string | null;
  invited_email: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  role: ProjectMemberRole;
  project_role_title: string | null;
  is_active: boolean;
  linkedin_url: string | null;
  cv_url: string | null;
  added_at: string;
  updated_at: string;
}

export type Milestone = {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  responsible_member_id: string | null;
  planned_start_date: string | null;
  planned_end_date: string | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
  estimated_hours: number | null;
  estimated_hours_per_week: number | null;
  progress_percent: number;
  status: MilestoneStatus;
  priority: Priority;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type Task = {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  assignee_id: string | null;
  start_date: string | null;
  due_date: string | null;
  status: TaskStatus;
  priority: Priority;
  milestone_id: string | null;
  created_by: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type Deliverable = {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  created_at: string;
}

export type TimeEntry = {
  id: string;
  project_id: string;
  milestone_id: string | null;
  task_id: string | null;
  member_id: string;
  description: string | null;
  deliverable_id: string | null;
  work_date: string;
  duration_minutes: number;
  participant_mode: ParticipantMode;
  created_at: string;
  updated_at: string;
}

export type TimeEntryParticipant = {
  time_entry_id: string;
  member_id: string;
}

export type CalendarEvent = {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  start_datetime: string;
  end_datetime: string | null;
  location: string | null;
  created_by: string;
  milestone_id: string | null;
  task_id: string | null;
  created_at: string;
  updated_at: string;
}

export type CalendarEventParticipant = {
  event_id: string;
  member_id: string;
}

export type ActivityLogEntry = {
  id: string;
  project_id: string;
  actor_id: string | null;
  entity_type: EntityType;
  entity_id: string;
  action: ActivityAction;
  metadata: Record<string, unknown>;
  created_at: string;
}
