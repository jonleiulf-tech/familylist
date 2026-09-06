import { addDays, isWithinInterval, parseISO } from 'date-fns';
import type { CalendarEvent, Milestone, Task, TimeEntry } from '@/types/database';
import { formatHoursAndMinutes } from '@/lib/time/duration';
import { formatDate } from '@/lib/utils/format';
import { isMilestoneDelayed } from './milestone';

export interface WeeklyReportInput {
  projectName: string;
  milestones: Milestone[];
  tasks: Task[];
  timeEntries: TimeEntry[];
  calendarEvents: CalendarEvent[];
  today?: Date;
}

/**
 * Genererer en presis, strukturert statusrapport FRA FAKTISKE DATA – ingen
 * KI i denne versjonen. Teksten kan senere "pyntes" av en språkmodell, men
 * selve innholdet skal alltid kunne spores tilbake til databaserader.
 */
export function generateWeeklyReport(input: WeeklyReportInput): string {
  const today = input.today ?? new Date();
  const weekAgo = addDays(today, -7);
  const twoWeeksAhead = addDays(today, 14);

  const completedLastWeek = input.tasks.filter(
    (t) => t.completed_at && isWithinInterval(parseISO(t.completed_at), { start: weekAgo, end: today }),
  );
  const createdLastWeek = input.tasks.filter(
    (t) => isWithinInterval(parseISO(t.created_at), { start: weekAgo, end: today }),
  );
  const entriesLastWeek = input.timeEntries.filter(
    (e) => isWithinInterval(parseISO(e.work_date), { start: weekAgo, end: today }),
  );
  const minutesLastWeek = entriesLastWeek.reduce((sum, e) => sum + e.duration_minutes, 0);
  const activeMilestones = input.milestones.filter((m) => m.status === 'in_progress');
  const delayed = input.milestones.filter((m) => isMilestoneDelayed(m, today));
  const upcomingMilestones = input.milestones.filter(
    (m) => m.planned_end_date && isWithinInterval(parseISO(m.planned_end_date), { start: today, end: twoWeeksAhead }),
  );
  const nextWeekEvents = input.calendarEvents.filter((e) =>
    isWithinInterval(parseISO(e.start_datetime), { start: today, end: addDays(today, 7) }),
  );

  const lines: string[] = [];
  lines.push(`UKESRAPPORT – ${input.projectName}`);
  lines.push(`Generert: ${formatDate(today)}`);
  lines.push('');
  lines.push(`Ferdigstilte oppgaver siste uke (${completedLastWeek.length}):`);
  completedLastWeek.forEach((t) => lines.push(`  - ${t.title}`));
  if (completedLastWeek.length === 0) lines.push('  (ingen)');
  lines.push('');
  lines.push(`Nye oppgaver siste uke (${createdLastWeek.length}):`);
  createdLastWeek.forEach((t) => lines.push(`  - ${t.title}`));
  if (createdLastWeek.length === 0) lines.push('  (ingen)');
  lines.push('');
  lines.push(`Aktive milepæler (${activeMilestones.length}):`);
  activeMilestones.forEach((m) => lines.push(`  - ${m.title} (${m.progress_percent}% fullført)`));
  if (activeMilestones.length === 0) lines.push('  (ingen)');
  lines.push('');
  lines.push(`Timer registrert siste uke: ${formatHoursAndMinutes(minutesLastWeek)}`);
  lines.push('');
  lines.push(`Forsinkelser (${delayed.length}):`);
  delayed.forEach((m) => lines.push(`  - ${m.title}`));
  if (delayed.length === 0) lines.push('  (ingen)');
  lines.push('');
  lines.push(`Kommende milepæler (neste 14 dager) (${upcomingMilestones.length}):`);
  upcomingMilestones.forEach((m) => lines.push(`  - ${m.title} – frist ${formatDate(m.planned_end_date)}`));
  if (upcomingMilestones.length === 0) lines.push('  (ingen)');
  lines.push('');
  lines.push(`Neste ukes kalender (${nextWeekEvents.length}):`);
  nextWeekEvents.forEach((e) => lines.push(`  - ${e.title} – ${formatDate(e.start_datetime)}`));
  if (nextWeekEvents.length === 0) lines.push('  (ingen)');

  return lines.join('\n');
}
