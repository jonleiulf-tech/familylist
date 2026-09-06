import type { Milestone, Task, TimeEntry } from '@/types/database';
import {
  actualDurationDays,
  actualVariance,
  delayDays,
  plannedDurationDays,
  plannedEstimatedMinutes,
  plannedVariance,
} from './milestone';

export interface MilestoneSummaryRow {
  milestone: Milestone;
  loggedMinutes: number;
  plannedEstimatedMinutes: number | null;
  plannedVarianceMinutes: number;
  plannedVariancePercent: number | null;
  actualVariancePercent: number | null;
  plannedDurationDays: number | null;
  actualDurationDays: number | null;
  delayDays: number | null;
  taskCount: number;
  openTaskCount: number;
}

/**
 * Bygger timeoppsummeringen PER MILEPÆL fra ferske databaserader – ingen
 * hardkodede rad-områder eller referanser via radnummer/tekstnavn, alt
 * kobles via milestone_id.
 */
export function buildMilestoneSummary(
  milestones: Milestone[],
  timeEntries: Pick<TimeEntry, 'milestone_id' | 'duration_minutes'>[],
  tasks: Pick<Task, 'milestone_id' | 'status'>[],
): MilestoneSummaryRow[] {
  return milestones.map((milestone) => {
    const loggedMinutes = timeEntries
      .filter((e) => e.milestone_id === milestone.id)
      .reduce((sum, e) => sum + e.duration_minutes, 0);
    const relatedTasks = tasks.filter((t) => t.milestone_id === milestone.id);

    const pv = plannedVariance({ milestone, loggedMinutes });
    const av = actualVariance({ milestone, loggedMinutes });

    return {
      milestone,
      loggedMinutes,
      plannedEstimatedMinutes: plannedEstimatedMinutes(milestone),
      plannedVarianceMinutes: pv.varianceMinutes,
      plannedVariancePercent: pv.variancePercent,
      actualVariancePercent: av.variancePercent,
      plannedDurationDays: plannedDurationDays(milestone),
      actualDurationDays: actualDurationDays(milestone),
      delayDays: delayDays(milestone),
      taskCount: relatedTasks.length,
      openTaskCount: relatedTasks.filter((t) => t.status !== 'done').length,
    };
  });
}
