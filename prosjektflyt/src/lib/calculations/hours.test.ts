import { describe, expect, it } from 'vitest';
import { personHoursMinutes, sessionHoursMinutes, summarizeMemberHours } from './hours';

describe('session hours vs. person hours', () => {
  it('Jon jobber alene 2 timer: individual = 2 t', () => {
    const entry = {
      duration_minutes: 120,
      participant_mode: 'single' as const,
      member_id: 'jon',
      participantMemberIds: [],
    };
    expect(sessionHoursMinutes(entry)).toBe(120);
    expect(personHoursMinutes(entry)).toBe(120);
  });

  it('møte 1 time med Jon, Kari, Per: session = 1 t, person-hours = 3 t', () => {
    const entry = {
      duration_minutes: 60,
      participant_mode: 'selected' as const,
      member_id: 'jon',
      participantMemberIds: ['kari', 'per'],
    };
    expect(sessionHoursMinutes(entry)).toBe(60);
    expect(personHoursMinutes(entry)).toBe(180);
  });
});

describe('summarizeMemberHours', () => {
  it('gir riktig individuell/gruppe/total-fordeling for eksempelet i spec', () => {
    const entries = [
      {
        duration_minutes: 120,
        participant_mode: 'single' as const,
        member_id: 'jon',
        participantMemberIds: [],
        work_date: '2026-01-05',
      },
      {
        duration_minutes: 60,
        participant_mode: 'selected' as const,
        member_id: 'jon',
        participantMemberIds: ['kari', 'per'],
        work_date: '2026-01-06',
      },
    ];
    const summary = summarizeMemberHours(entries);
    const jon = summary.find((s) => s.memberId === 'jon')!;
    const kari = summary.find((s) => s.memberId === 'kari')!;
    const per = summary.find((s) => s.memberId === 'per')!;

    expect(jon.individualMinutes).toBe(120);
    expect(jon.groupMinutes).toBe(60);
    expect(jon.totalMinutes).toBe(180);

    expect(kari.individualMinutes).toBe(0);
    expect(kari.groupMinutes).toBe(60);
    expect(kari.totalMinutes).toBe(60);

    expect(per.groupMinutes).toBe(60);
  });

  it('bruker siste registreringsdato per medlem', () => {
    const entries = [
      {
        duration_minutes: 60,
        participant_mode: 'single' as const,
        member_id: 'jon',
        participantMemberIds: [],
        work_date: '2026-01-05',
      },
      {
        duration_minutes: 30,
        participant_mode: 'single' as const,
        member_id: 'jon',
        participantMemberIds: [],
        work_date: '2026-01-10',
      },
    ];
    const summary = summarizeMemberHours(entries);
    expect(summary[0]?.lastEntryDate).toBe('2026-01-10');
  });
});
