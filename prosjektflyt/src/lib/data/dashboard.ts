import { createClient } from '@/lib/supabase/server';
import type {
  ActivityLogEntry,
  CalendarEvent,
  Deliverable,
  Milestone,
  ProjectMember,
  Task,
  TimeEntry,
} from '@/types/database';

export interface ProjectWorkspaceData {
  members: ProjectMember[];
  milestones: Milestone[];
  tasks: Task[];
  timeEntries: TimeEntry[];
  /** member_id-er per time_entry_id, for tidsregistreringer med flere deltagere. */
  timeEntryParticipants: Record<string, string[]>;
  upcomingEvents: CalendarEvent[];
  activityLog: ActivityLogEntry[];
  deliverables: Deliverable[];
}

/**
 * Henter alt datagrunnlag for dashboard/rapporter i ett sett med kall.
 * Bevisst enkel – ingen materialiserte visninger utover milestone_logged_minutes
 * (views), all annen aggregering skjer i src/lib/calculations på ferske rader.
 */
export async function getProjectWorkspaceData(projectId: string): Promise<ProjectWorkspaceData> {
  const supabase = createClient();

  const [membersRes, milestonesRes, tasksRes, timeEntriesRes, eventsRes, activityLogRes, deliverablesRes] =
    await Promise.all([
      supabase.from('project_members').select('*').eq('project_id', projectId).order('first_name'),
      supabase.from('milestones').select('*').eq('project_id', projectId).order('sort_order'),
      supabase.from('tasks').select('*').eq('project_id', projectId).order('due_date', { ascending: true }),
      supabase.from('time_entries').select('*').eq('project_id', projectId).order('work_date', { ascending: false }),
      supabase
        .from('calendar_events')
        .select('*')
        .eq('project_id', projectId)
        .order('start_datetime', { ascending: true }),
      supabase
        .from('activity_log')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase.from('deliverables').select('*').eq('project_id', projectId).order('sort_order'),
    ]);

  if (membersRes.error) throw membersRes.error;
  if (milestonesRes.error) throw milestonesRes.error;
  if (tasksRes.error) throw tasksRes.error;
  if (timeEntriesRes.error) throw timeEntriesRes.error;
  if (eventsRes.error) throw eventsRes.error;
  if (activityLogRes.error) throw activityLogRes.error;
  if (deliverablesRes.error) throw deliverablesRes.error;

  const entryIds = (timeEntriesRes.data ?? []).map((e) => e.id);
  const timeEntryParticipants: Record<string, string[]> = {};
  if (entryIds.length > 0) {
    const { data: participants, error: participantsError } = await supabase
      .from('time_entry_participants')
      .select('time_entry_id, member_id')
      .in('time_entry_id', entryIds);
    if (participantsError) throw participantsError;
    for (const p of participants ?? []) {
      (timeEntryParticipants[p.time_entry_id] ??= []).push(p.member_id);
    }
  }

  return {
    members: membersRes.data ?? [],
    milestones: milestonesRes.data ?? [],
    tasks: tasksRes.data ?? [],
    timeEntries: timeEntriesRes.data ?? [],
    timeEntryParticipants,
    upcomingEvents: eventsRes.data ?? [],
    activityLog: activityLogRes.data ?? [],
    deliverables: deliverablesRes.data ?? [],
  };
}
