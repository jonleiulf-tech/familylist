import { differenceInCalendarDays, isWithinInterval, parseISO } from 'date-fns';
import type { Milestone } from '@/types/database';

/**
 * Rene geometriberegninger for Gantt-visningen. Tar en tidslinje
 * (timelineStart–timelineEnd) og oversetter datoer til posisjon/bredde i
 * "dag-enheter" – UI-laget skalerer dette til piksler per dag/uke/måned.
 */

export interface GanttBar {
  offsetDays: number;
  widthDays: number;
}

export interface MilestoneGanttSegments {
  /** Hele planlagte perioden (rolig planfarge). */
  planned: GanttBar | null;
  /** Faktisk aktivitet som ligger innenfor planlagt periode. */
  actualWithinPlan: GanttBar | null;
  /** Faktisk aktivitet som strekker seg forbi planlagt sluttdato (varselfarge). */
  actualOverdue: GanttBar | null;
  /** Fylt del av actual-baren tilsvarende progress_percent (progress-fill). */
  progressFill: GanttBar | null;
  /** Er "i dag" innenfor tidslinjen, og evt. offset i dager. */
  todayOffsetDays: number | null;
}

function clampBar(offsetDays: number, widthDays: number, timelineWidthDays: number): GanttBar | null {
  const start = Math.max(0, offsetDays);
  const end = Math.min(timelineWidthDays, offsetDays + widthDays);
  if (end <= start) return null;
  return { offsetDays: start, widthDays: end - start };
}

export function computeMilestoneGanttSegments(
  milestone: Pick<
    Milestone,
    'planned_start_date' | 'planned_end_date' | 'actual_start_date' | 'actual_end_date' | 'progress_percent'
  >,
  timelineStart: string | Date,
  timelineEnd: string | Date,
  today: string | Date = new Date(),
): MilestoneGanttSegments {
  const tStart = typeof timelineStart === 'string' ? parseISO(timelineStart) : timelineStart;
  const tEnd = typeof timelineEnd === 'string' ? parseISO(timelineEnd) : timelineEnd;
  const timelineWidthDays = Math.max(0, differenceInCalendarDays(tEnd, tStart));

  const toOffset = (d: string) => differenceInCalendarDays(parseISO(d), tStart);

  const planned =
    milestone.planned_start_date && milestone.planned_end_date
      ? clampBar(
          toOffset(milestone.planned_start_date),
          Math.max(1, differenceInCalendarDays(parseISO(milestone.planned_end_date), parseISO(milestone.planned_start_date))),
          timelineWidthDays,
        )
      : null;

  let actualWithinPlan: GanttBar | null = null;
  let actualOverdue: GanttBar | null = null;
  let progressFill: GanttBar | null = null;

  if (milestone.actual_start_date) {
    const actualStart = parseISO(milestone.actual_start_date);
    const actualEndDate = milestone.actual_end_date ? parseISO(milestone.actual_end_date) : (typeof today === 'string' ? parseISO(today) : today);
    const actualWidthDays = Math.max(1, differenceInCalendarDays(actualEndDate, actualStart));
    const actualOffset = toOffset(milestone.actual_start_date);

    const plannedEnd = milestone.planned_end_date ? parseISO(milestone.planned_end_date) : null;

    if (!plannedEnd || actualEndDate <= plannedEnd) {
      actualWithinPlan = clampBar(actualOffset, actualWidthDays, timelineWidthDays);
    } else {
      const plannedEndOffset = toOffset(milestone.planned_end_date!);
      const withinWidth = Math.max(0, plannedEndOffset - actualOffset);
      if (withinWidth > 0) {
        actualWithinPlan = clampBar(actualOffset, withinWidth, timelineWidthDays);
      }
      const overdueWidth = actualWidthDays - withinWidth;
      if (overdueWidth > 0) {
        actualOverdue = clampBar(actualOffset + withinWidth, overdueWidth, timelineWidthDays);
      }
    }

    const progressWidth = Math.round((actualWidthDays * milestone.progress_percent) / 100);
    if (progressWidth > 0) {
      progressFill = clampBar(actualOffset, progressWidth, timelineWidthDays);
    }
  }

  const todayDate = typeof today === 'string' ? parseISO(today) : today;
  const todayOffsetDays = isWithinInterval(todayDate, { start: tStart, end: tEnd })
    ? differenceInCalendarDays(todayDate, tStart)
    : null;

  return { planned, actualWithinPlan, actualOverdue, progressFill, todayOffsetDays };
}
