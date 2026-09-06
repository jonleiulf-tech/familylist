import { describe, expect, it } from 'vitest';
import { countTasksByStatus, isDueSoon, isTaskOverdue } from './tasks';

describe('countTasksByStatus', () => {
  it('teller status fra faktiske verdier – "Ikke startet" teller aldri "Ferdig"', () => {
    const tasks = [
      { status: 'not_started' as const },
      { status: 'not_started' as const },
      { status: 'in_progress' as const },
      { status: 'done' as const },
      { status: 'blocked' as const },
    ];
    expect(countTasksByStatus(tasks)).toEqual({
      not_started: 2,
      in_progress: 1,
      blocked: 1,
      done: 1,
    });
  });

  it('gir 0 for alle statuser på tom liste', () => {
    expect(countTasksByStatus([])).toEqual({
      not_started: 0,
      in_progress: 0,
      blocked: 0,
      done: 0,
    });
  });
});

describe('isTaskOverdue', () => {
  it('forfalt når due_date er passert og status ikke er ferdig', () => {
    expect(isTaskOverdue({ due_date: '2026-01-01', status: 'not_started' }, '2026-01-05')).toBe(true);
  });

  it('ikke forfalt hvis ferdig, selv om due_date er passert', () => {
    expect(isTaskOverdue({ due_date: '2026-01-01', status: 'done' }, '2026-01-05')).toBe(false);
  });

  it('ikke forfalt uten due_date', () => {
    expect(isTaskOverdue({ due_date: null, status: 'not_started' }, '2026-01-05')).toBe(false);
  });
});

describe('isDueSoon', () => {
  it('forfaller snart innenfor standard 7-dagersvindu', () => {
    expect(isDueSoon({ due_date: '2026-01-10', status: 'not_started' }, '2026-01-05')).toBe(true);
  });

  it('ikke innenfor vindu når for langt frem', () => {
    expect(isDueSoon({ due_date: '2026-01-20', status: 'not_started' }, '2026-01-05')).toBe(false);
  });
});
