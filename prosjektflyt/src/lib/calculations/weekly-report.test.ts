import { describe, expect, it } from 'vitest';
import { generateWeeklyReport } from './weekly-report';

describe('generateWeeklyReport', () => {
  it('inkluderer ferdigstilte oppgaver, aktive milepæler og registrerte timer', () => {
    const report = generateWeeklyReport({
      projectName: 'Testprosjekt',
      today: new Date('2026-01-15'),
      milestones: [
        {
          id: 'm1',
          status: 'in_progress',
          progress_percent: 40,
          title: 'Fundamentering',
          planned_end_date: '2026-01-20',
        } as any,
      ],
      tasks: [
        {
          id: 't1',
          title: 'Bestille materialer',
          completed_at: '2026-01-12T10:00:00Z',
          created_at: '2026-01-10T10:00:00Z',
        } as any,
      ],
      timeEntries: [{ id: 'e1', work_date: '2026-01-12', duration_minutes: 120 } as any],
      calendarEvents: [],
    });

    expect(report).toContain('UKESRAPPORT – Testprosjekt');
    expect(report).toContain('Bestille materialer');
    expect(report).toContain('Fundamentering (40% fullført)');
    expect(report).toContain('2 t');
  });
});
