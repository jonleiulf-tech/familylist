import { describe, it, expect } from 'vitest';
import { fileContent, mergeContent, derive } from './content.jsx';

describe('mergeContent', () => {
  it('bruker fila når databasen er tom', () => {
    const base = fileContent();
    const out = mergeContent(base, { content: [], sports: [] });
    expect(out.sports).toBe(base.sports);
    expect(out.site).toBe(base.site);
  });
  it('lar databaserader overstyre, og ignorerer ukjente nøkler', () => {
    const base = fileContent();
    const out = mergeContent(base, {
      content: [{ key: 'stats', value: { asOf: { nb: 'x', en: 'x' }, uniqueParticipants: '300', activeSports: 5 } }, { key: 'hacker', value: 1 }],
      sports: [{ slug: 'padel', sort_order: 1, active: true, data: { name: 'PSI Padel', schedule: [] } }],
    });
    expect(out.stats.uniqueParticipants).toBe('300');
    expect(out.hacker).toBeUndefined();
    expect(out.sports.map((s) => s.slug)).toEqual(['padel']);
  });
  it('derive gir aktive grupper og sortert ukeplan', () => {
    const d = derive(fileContent());
    expect(d.activeSports.length).toBe(5);
    expect(d.findSport('fotball').spondCode).toBe('TYUQQ');
    expect(d.findSport('ukjent')).toBe(null);
    const rows = d.weeklySchedule();
    expect(rows[0].day).toBeLessThanOrEqual(rows[rows.length - 1].day);
  });
});
