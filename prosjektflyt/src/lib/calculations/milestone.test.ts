import { describe, expect, it } from 'vitest';
import {
  actualDurationDays,
  actualReferenceMinutes,
  actualVariance,
  delayDays,
  isMilestoneDelayed,
  plannedDurationDays,
  plannedEstimatedMinutes,
  plannedVariance,
} from './milestone';

const baseMilestone = {
  estimated_hours: null as number | null,
  estimated_hours_per_week: 10,
  planned_start_date: '2026-01-05',
  planned_end_date: '2026-01-18', // 2 uker
  actual_start_date: '2026-01-05',
  actual_end_date: '2026-01-25', // ~3 uker (litt lenger enn plan)
};

describe('plannedEstimatedMinutes', () => {
  it('bruker estimated_hours direkte når satt', () => {
    expect(plannedEstimatedMinutes({ ...baseMilestone, estimated_hours: 40 })).toBe(40 * 60);
  });

  it('faller tilbake til timer/uke × planlagt varighet', () => {
    // 2 uker × 10 t/uke = 20 t = 1200 min
    expect(plannedEstimatedMinutes(baseMilestone)).toBe(1200);
  });
});

describe('actualReferenceMinutes', () => {
  it('bruker timer/uke × faktisk varighet', () => {
    // 2026-01-05 til 2026-01-25 = 3 ISO-uker → 30 t = 1800 min
    expect(actualReferenceMinutes(baseMilestone)).toBe(1800);
  });

  it('er null uten faktiske datoer', () => {
    expect(
      actualReferenceMinutes({ ...baseMilestone, actual_start_date: null, actual_end_date: null }),
    ).toBeNull();
  });
});

describe('plannedVariance / actualVariance – 40 t plan, 52 t registrert', () => {
  const milestone = {
    estimated_hours: 40,
    estimated_hours_per_week: null as number | null,
    planned_start_date: '2026-01-05',
    planned_end_date: '2026-01-18',
    actual_start_date: '2026-01-05',
    actual_end_date: '2026-01-18',
  };

  it('gir +12 t / +30 % avvik mot plan', () => {
    const result = plannedVariance({ milestone, loggedMinutes: 52 * 60 });
    expect(result.varianceMinutes).toBe(12 * 60);
    expect(result.variancePercent).toBe(30);
  });
});

describe('durations', () => {
  it('plannedDurationDays', () => {
    expect(plannedDurationDays(baseMilestone)).toBe(13);
  });

  it('actualDurationDays', () => {
    expect(actualDurationDays(baseMilestone)).toBe(20);
  });
});

describe('delayDays / isMilestoneDelayed', () => {
  it('positiv forsinkelse når fullført etter planlagt sluttdato', () => {
    const m = {
      planned_end_date: '2026-01-18',
      actual_end_date: '2026-01-25',
      status: 'completed' as const,
    };
    expect(delayDays(m)).toBe(7);
    expect(isMilestoneDelayed(m)).toBe(true);
  });

  it('ingen forsinkelse når fullført i forkant av plan', () => {
    const m = {
      planned_end_date: '2026-01-18',
      actual_end_date: '2026-01-10',
      status: 'completed' as const,
    };
    expect(delayDays(m)).toBe(-8);
    expect(isMilestoneDelayed(m)).toBe(false);
  });

  it('fullført uten faktisk sluttdato gir null (ukjent), ikke evig forsinkelse', () => {
    const m = {
      planned_end_date: '2026-01-18',
      actual_end_date: null,
      status: 'completed' as const,
    };
    expect(delayDays(m, '2026-06-01')).toBeNull();
    expect(isMilestoneDelayed(m, '2026-06-01')).toBe(false);
  });

  it('pågående milepæl forsinket målt mot "i dag"', () => {
    const m = {
      planned_end_date: '2026-01-18',
      actual_end_date: null,
      status: 'in_progress' as const,
    };
    expect(isMilestoneDelayed(m, '2026-01-20')).toBe(true);
    expect(isMilestoneDelayed(m, '2026-01-10')).toBe(false);
  });
});
