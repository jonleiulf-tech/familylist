import { describe, expect, it } from 'vitest';
import { buildMilestoneSummary } from './milestone-summary';

describe('buildMilestoneSummary', () => {
  it('aggregerer alle milepæler dynamisk fra rader, koblet via milestone_id', () => {
    const milestones = [
      {
        id: 'm1',
        estimated_hours: 10,
        estimated_hours_per_week: null,
        planned_start_date: '2026-01-01',
        planned_end_date: '2026-01-08',
        actual_start_date: null,
        actual_end_date: null,
        status: 'in_progress',
      },
      {
        id: 'm2',
        estimated_hours: 20,
        estimated_hours_per_week: null,
        planned_start_date: '2026-01-01',
        planned_end_date: '2026-01-08',
        actual_start_date: null,
        actual_end_date: null,
        status: 'in_progress',
      },
    ] as unknown as Parameters<typeof buildMilestoneSummary>[0];

    const timeEntries = [
      { milestone_id: 'm1', duration_minutes: 600 },
      { milestone_id: 'm2', duration_minutes: 60 },
      { milestone_id: null, duration_minutes: 999 }, // ikke koblet – skal ikke telle noe sted
    ];

    const tasks = [
      { milestone_id: 'm1', status: 'done' as const },
      { milestone_id: 'm1', status: 'not_started' as const },
      { milestone_id: 'm2', status: 'done' as const },
    ];

    const result = buildMilestoneSummary(milestones, timeEntries, tasks);
    const m1 = result.find((r) => r.milestone.id === 'm1')!;
    const m2 = result.find((r) => r.milestone.id === 'm2')!;

    expect(m1.loggedMinutes).toBe(600);
    expect(m1.taskCount).toBe(2);
    expect(m1.openTaskCount).toBe(1);

    expect(m2.loggedMinutes).toBe(60);
    expect(m2.taskCount).toBe(1);
    expect(m2.openTaskCount).toBe(0);
  });
});
