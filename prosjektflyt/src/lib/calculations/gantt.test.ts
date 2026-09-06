import { describe, expect, it } from 'vitest';
import { computeMilestoneGanttSegments } from './gantt';

const timelineStart = '2026-01-01';
const timelineEnd = '2026-02-01'; // 31 dager

describe('computeMilestoneGanttSegments', () => {
  it('planlagt periode gir riktig offset/bredde', () => {
    const result = computeMilestoneGanttSegments(
      {
        planned_start_date: '2026-01-05',
        planned_end_date: '2026-01-15',
        actual_start_date: null,
        actual_end_date: null,
        progress_percent: 0,
      },
      timelineStart,
      timelineEnd,
    );
    expect(result.planned).toEqual({ offsetDays: 4, widthDays: 10 });
    expect(result.actualWithinPlan).toBeNull();
    expect(result.actualOverdue).toBeNull();
  });

  it('faktisk innenfor plan gir kun actualWithinPlan', () => {
    const result = computeMilestoneGanttSegments(
      {
        planned_start_date: '2026-01-05',
        planned_end_date: '2026-01-20',
        actual_start_date: '2026-01-05',
        actual_end_date: '2026-01-12',
        progress_percent: 100,
      },
      timelineStart,
      timelineEnd,
    );
    expect(result.actualWithinPlan).toEqual({ offsetDays: 4, widthDays: 7 });
    expect(result.actualOverdue).toBeNull();
  });

  it('faktisk utover plan splittes i within + overdue', () => {
    const result = computeMilestoneGanttSegments(
      {
        planned_start_date: '2026-01-05',
        planned_end_date: '2026-01-15',
        actual_start_date: '2026-01-05',
        actual_end_date: '2026-01-20',
        progress_percent: 100,
      },
      timelineStart,
      timelineEnd,
    );
    // planlagt slutt 15. -> within = 5.->15. (10 dager), overdue = 15.->20. (5 dager)
    expect(result.actualWithinPlan).toEqual({ offsetDays: 4, widthDays: 10 });
    expect(result.actualOverdue).toEqual({ offsetDays: 14, widthDays: 5 });
  });

  it('today-markør er null utenfor tidslinjen', () => {
    const result = computeMilestoneGanttSegments(
      {
        planned_start_date: '2026-01-05',
        planned_end_date: '2026-01-15',
        actual_start_date: null,
        actual_end_date: null,
        progress_percent: 0,
      },
      timelineStart,
      timelineEnd,
      '2026-03-01',
    );
    expect(result.todayOffsetDays).toBeNull();
  });

  it('today-markør beregnes riktig innenfor tidslinjen', () => {
    const result = computeMilestoneGanttSegments(
      {
        planned_start_date: '2026-01-05',
        planned_end_date: '2026-01-15',
        actual_start_date: null,
        actual_end_date: null,
        progress_percent: 0,
      },
      timelineStart,
      timelineEnd,
      '2026-01-10',
    );
    expect(result.todayOffsetDays).toBe(9);
  });
});
