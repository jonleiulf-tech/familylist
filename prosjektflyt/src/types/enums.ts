/**
 * Sentrale enums for domenemodellen. Holdes som konfig/const-arrays (ikke
 * Postgres ENUM-typer) slik at nye verdier kan legges til uten migrasjon av
 * kolonnetype – kun en ny rad/verdi i denne fila og en check-constraint.
 */

export const PROJECT_STATUS = [
  'planning',
  'active',
  'on_hold',
  'completed',
  'archived',
] as const;
export type ProjectStatus = (typeof PROJECT_STATUS)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planning: 'Planlegging',
  active: 'Aktivt',
  on_hold: 'På vent',
  completed: 'Ferdig',
  archived: 'Arkivert',
};

export const PROJECT_MEMBER_ROLE = ['owner', 'admin', 'member', 'viewer'] as const;
export type ProjectMemberRole = (typeof PROJECT_MEMBER_ROLE)[number];

export const PROJECT_MEMBER_ROLE_LABELS: Record<ProjectMemberRole, string> = {
  owner: 'Eier',
  admin: 'Prosjektleder',
  member: 'Medlem',
  viewer: 'Leser',
};

export const MILESTONE_STATUS = [
  'not_started',
  'in_progress',
  'completed',
  'delayed',
] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUS)[number];

export const MILESTONE_STATUS_LABELS: Record<MilestoneStatus, string> = {
  not_started: 'Ikke startet',
  in_progress: 'I gang',
  completed: 'Ferdig',
  delayed: 'Forsinket',
};

export const TASK_STATUS = ['not_started', 'in_progress', 'blocked', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUS)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: 'Ikke startet',
  in_progress: 'I gang',
  blocked: 'Blokkert',
  done: 'Ferdig',
};

export const PRIORITY = ['low', 'medium', 'high', 'critical'] as const;
export type Priority = (typeof PRIORITY)[number];

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Lav',
  medium: 'Middels',
  high: 'Høy',
  critical: 'Kritisk',
};

export const PARTICIPANT_MODE = ['single', 'selected', 'all'] as const;
export type ParticipantMode = (typeof PARTICIPANT_MODE)[number];

export const PARTICIPANT_MODE_LABELS: Record<ParticipantMode, string> = {
  single: 'Individuelt',
  selected: 'Valgte deltagere',
  all: 'Hele teamet',
};

export const PROJECT_HEALTH = ['green', 'yellow', 'red'] as const;
export type ProjectHealth = (typeof PROJECT_HEALTH)[number];

export const PROJECT_HEALTH_LABELS: Record<ProjectHealth, string> = {
  green: 'Grønn',
  yellow: 'Gul',
  red: 'Rød',
};

export const GANTT_RESOLUTION = ['day', 'week', 'month'] as const;
export type GanttResolution = (typeof GANTT_RESOLUTION)[number];

export const ACTIVITY_ACTION = [
  'created',
  'updated',
  'deleted',
  'completed',
  'status_changed',
  'invited',
  'converted_to_milestone',
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTION)[number];

export const ENTITY_TYPE = [
  'project',
  'milestone',
  'task',
  'time_entry',
  'member',
  'calendar_event',
  'deliverable',
] as const;
export type EntityType = (typeof ENTITY_TYPE)[number];
