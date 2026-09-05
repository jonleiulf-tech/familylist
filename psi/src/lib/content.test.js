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

describe('bildefilene i repoet', () => {
  const grunn = {
    sports: [
      { slug: 'fotball', name: 'PSI Fotball', image: '/images/psi/fotball/card', glyph: '/images/sports/fotball.png', imageAlt: { nb: 'Fotball' } },
      { slug: 'padel', name: 'PSI Padel', image: null, glyph: '/images/sports/padel.png' },
    ],
    news: [], events: [], media: [], board: [],
  };

  it('brukes når gruppa i databasen ikke har noe bilde', () => {
    const ut = mergeContent(grunn, { sports: [{ slug: 'fotball', sort_order: 10, active: true, data: { name: 'PSI Fotball' } }] });
    expect(ut.sports[0].image).toBe('/images/psi/fotball/card');
    expect(ut.sports[0].glyph).toBe('/images/sports/fotball.png');
  });

  it('viker for et gruppebilde lastet opp i admin', () => {
    const ut = mergeContent(grunn, {
      sports: [{ slug: 'fotball', sort_order: 10, active: true, data: { name: 'PSI Fotball' } }],
      media: [{ id: 'm1', sport_slug: 'fotball', is_cover: true, web_url: 'https://sup/abase/web.webp', focus_x: 30, focus_y: 80 }],
    });
    expect(ut.sports[0].image).toBe('https://sup/abase/web.webp');
    expect(ut.sports[0].imageFocus).toBe('30% 80%');
  });

  it('lar gruppa stå uten bilde når verken repoet eller admin har ett', () => {
    const ut = mergeContent(grunn, { sports: [{ slug: 'padel', sort_order: 20, active: true, data: { name: 'PSI Padel' } }] });
    expect(ut.sports[0].image).toBe(null);
  });

  it('midtstiller når fokuspunktet ikke er satt', () => {
    const ut = mergeContent(grunn, {
      sports: [{ slug: 'fotball', sort_order: 10, active: true, data: {} }],
      media: [{ id: 'm1', sport_slug: 'fotball', is_cover: true, web_url: 'https://sup/abase/web.webp' }],
    });
    expect(ut.sports[0].imageFocus).toBe('50% 50%');
  });
});
