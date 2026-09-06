import type {
  ActivityLogEntry,
  CalendarEvent,
  CalendarEventParticipant,
  Deliverable,
  Milestone,
  Profile,
  Project,
  ProjectMember,
  Task,
  TimeEntry,
  TimeEntryParticipant,
} from './database';

/**
 * Database-typen supabase-js bruker for typesikre spørringer. Skrevet for
 * hånd fra migrasjonene (vi har ikke `supabase gen types` i byggemiljøet),
 * med radtypene i ./database.ts som kilde. Insert-typene gjør kolonner med
 * DEFAULT i databasen valgfrie.
 *
 * Holdes i synk med supabase/migrations – en endring der skal gjenspeiles
 * her og i ./database.ts.
 */

type Generated = 'id' | 'created_at' | 'updated_at';

/** Rad → Insert: id/tidsstempler + kolonner med default blir valgfrie. */
type InsertOf<Row, Defaulted extends keyof Row = never> = Omit<Row, Generated | Defaulted> &
  Partial<Pick<Row, Extract<Generated | Defaulted, keyof Row>>>;

interface TableDef<Row, Insert> {
  Row: Row;
  Insert: Insert;
  Update: Partial<Insert>;
  Relationships: [];
}

export interface Database {
  public: {
    Tables: {
      profiles: TableDef<Profile, Omit<Profile, 'created_at' | 'updated_at' | 'locale'> & Partial<Pick<Profile, 'created_at' | 'updated_at' | 'locale'>>>;
      projects: TableDef<
        Project,
        InsertOf<
          Project,
          | 'project_number'
          | 'description'
          | 'client_name'
          | 'project_manager_id'
          | 'start_date'
          | 'planned_end_date'
          | 'actual_end_date'
          | 'status'
          | 'color'
          | 'gantt_resolution_default'
          | 'archived_at'
        >
      >;
      project_members: TableDef<
        ProjectMember,
        Omit<
          InsertOf<
            ProjectMember,
            | 'user_id'
            | 'invited_email'
            | 'last_name'
            | 'email'
            | 'phone'
            | 'role'
            | 'project_role_title'
            | 'is_active'
            | 'linkedin_url'
            | 'cv_url'
          >,
          'added_at'
        > &
          Partial<Pick<ProjectMember, 'added_at'>>
      >;
      deliverables: TableDef<Deliverable, InsertOf<Deliverable, 'description' | 'sort_order'>>;
      milestones: TableDef<
        Milestone,
        InsertOf<
          Milestone,
          | 'description'
          | 'responsible_member_id'
          | 'planned_start_date'
          | 'planned_end_date'
          | 'actual_start_date'
          | 'actual_end_date'
          | 'estimated_hours'
          | 'estimated_hours_per_week'
          | 'progress_percent'
          | 'status'
          | 'priority'
          | 'sort_order'
        >
      >;
      tasks: TableDef<
        Task,
        InsertOf<
          Task,
          | 'description'
          | 'assignee_id'
          | 'start_date'
          | 'due_date'
          | 'status'
          | 'priority'
          | 'milestone_id'
          | 'completed_at'
        >
      >;
      time_entries: TableDef<
        TimeEntry,
        InsertOf<TimeEntry, 'milestone_id' | 'task_id' | 'description' | 'deliverable_id' | 'participant_mode'>
      >;
      time_entry_participants: TableDef<TimeEntryParticipant, TimeEntryParticipant>;
      calendar_events: TableDef<
        CalendarEvent,
        InsertOf<CalendarEvent, 'description' | 'end_datetime' | 'location' | 'milestone_id' | 'task_id'>
      >;
      calendar_event_participants: TableDef<CalendarEventParticipant, CalendarEventParticipant>;
      activity_log: TableDef<
        ActivityLogEntry,
        Omit<ActivityLogEntry, 'id' | 'created_at' | 'actor_id' | 'metadata'> &
          Partial<Pick<ActivityLogEntry, 'id' | 'created_at' | 'actor_id' | 'metadata'>>
      >;
    };
    Views: {
      milestone_logged_minutes: {
        Row: { milestone_id: string; project_id: string; logged_minutes: number; entry_count: number };
        Relationships: [];
      };
      milestone_task_counts: {
        Row: { milestone_id: string; project_id: string; task_count: number; open_task_count: number };
        Relationships: [];
      };
    };
    Functions: {
      is_project_member: { Args: { p_project_id: string }; Returns: boolean };
      project_role: { Args: { p_project_id: string }; Returns: string | null };
      is_project_manager: { Args: { p_project_id: string }; Returns: boolean };
      can_edit_project: { Args: { p_project_id: string }; Returns: boolean };
      find_user_id_by_email: { Args: { p_email: string }; Returns: string | null };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
