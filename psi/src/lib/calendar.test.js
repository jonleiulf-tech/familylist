import { describe, it, expect } from 'vitest';
import { expandTrainings, firstOnOrAfter, fromOslo, osloParts, agenda, byDay, buildIcs, parseFeedSlug, feedPath, normalizeEvents, spondDays } from './calendar.js';

const fotball = {
  slug: 'fotball', name: 'PSI Fotball', active: true, spondCode: 'TYUQQ', venue: { nb: 'Porsgrunn Arena', en: 'Porsgrunn Arena' },
  schedule: [
    { day: 5, from: '18:00', to: '20:00', venue: 'Porsgrunn Arena', from_date: '2026-09-11', note: { nb: 'Innendørs', en: 'Indoors' } },
    { day: 2, from: '20:30', to: '22:00', from_date: '2026-09-15' },
  ],
};
const padel = { slug: 'padel', name: 'PSI Padel', active: true, spondCode: 'X', schedule: [] };

describe('tid i Oslo', () => {
  it('fromOslo gir riktig UTC i sommer- og vintertid', () => {
    expect(fromOslo(2026, 7, 1, 12, 0).toISOString()).toBe('2026-07-01T10:00:00.000Z');
    expect(fromOslo(2026, 1, 15, 12, 0).toISOString()).toBe('2026-01-15T11:00:00.000Z');
    expect(osloParts(new Date('2026-09-11T16:00:00Z'))).toMatchObject({ y: 2026, m: 9, d: 11, h: 18, weekday: 5 });
  });
  it('firstOnOrAfter finner ukedagen', () => {
    expect(firstOnOrAfter('2026-09-05', 5)).toBe('2026-09-11'); // lørdag → neste fredag
    expect(firstOnOrAfter('2026-09-11', 5)).toBe('2026-09-11'); // samme dag
    expect(firstOnOrAfter('2026-09-12', 1)).toBe('2026-09-14');
  });
});

describe('expandTrainings', () => {
  it('respekterer from_date og lager én forekomst per uke', () => {
    const items = expandTrainings([fotball, padel], '2026-09-01', '2026-09-30');
    const fridays = items.filter((i) => i.id.includes('-0-'));
    expect(fridays.map((i) => i.start.toISOString().slice(0, 10))).toEqual(['2026-09-11', '2026-09-18', '2026-09-25']);
    const tuesdays = items.filter((i) => i.id.includes('-1-'));
    expect(tuesdays[0].start.toISOString()).toBe('2026-09-15T18:30:00.000Z');
    expect(items.every((i) => i.kind === 'training')).toBe(true);
  });
  it('hopper over inaktive grupper', () => {
    expect(expandTrainings([{ ...fotball, active: false }], '2026-09-01', '2026-12-01')).toEqual([]);
  });
});

describe('agenda', () => {
  const events = [
    { id: 'e1', sport_slug: 'fotball', kind: 'match', title: { nb: 'Kamp mot Bø', en: 'Match vs Bø' }, starts_at: '2026-09-19T12:00:00Z', status: 'published' },
    { id: 'e2', sport_slug: null, kind: 'social', title: { nb: 'Kick-off' }, starts_at: '2026-09-20T16:00:00Z', status: 'published' },
    { id: 'e3', sport_slug: 'padel', kind: 'event', title: { nb: 'Utkast' }, starts_at: '2026-09-21T16:00:00Z', status: 'draft' },
  ];
  it('slår sammen treninger og arrangementer, sortert, og skjuler utkast', () => {
    const items = agenda({ sports: [fotball, padel], events, fromIso: '2026-09-14', toIso: '2026-09-21' });
    expect(items.map((i) => i.kind)).toEqual(['training', 'training', 'match', 'social']);
    expect(items.some((i) => i.id === 'event-e3')).toBe(false);
    for (let i = 1; i < items.length; i++) expect(items[i].start >= items[i - 1].start).toBe(true);
  });
  it('filtrerer på gruppe og beholder felles PSI-arrangementer', () => {
    const items = agenda({ sports: [fotball, padel], events, fromIso: '2026-09-14', toIso: '2026-09-21', slugs: ['padel'] });
    expect(items.map((i) => i.id)).toEqual(['event-e2']);
  });
  it('filtrerer på type', () => {
    const items = agenda({ sports: [fotball], events, fromIso: '2026-09-14', toIso: '2026-09-21', kinds: ['match'] });
    expect(items.map((i) => i.id)).toEqual(['event-e1']);
  });
  it('byDay grupperer på Oslo-dato', () => {
    const days = byDay(agenda({ sports: [fotball], events, fromIso: '2026-09-14', toIso: '2026-09-21' }));
    expect(days.map((d) => d.day)).toEqual(['2026-09-15', '2026-09-18', '2026-09-19', '2026-09-20']);
  });
  it('normalizeEvents gir to timer når slutt mangler og markerer avlyst', () => {
    const [e] = normalizeEvents([{ id: 'x', starts_at: '2026-09-19T12:00:00Z', status: 'cancelled', title: { nb: 't' } }]);
    expect(e.end.toISOString()).toBe('2026-09-19T14:00:00.000Z');
    expect(e.cancelled).toBe(true);
  });
});

describe('buildIcs', () => {
  const events = [{ id: 'e1', sport_slug: 'fotball', kind: 'match', title: { nb: 'Kamp mot Bø, hjemme' }, starts_at: '2026-09-19T12:00:00Z', ends_at: '2026-09-19T14:00:00Z', status: 'published', venue: 'Porsgrunn Arena' }];
  it('lager gyldig kalender med ukentlige treninger og enkeltarrangementer', () => {
    const ics = buildIcs({ sports: [fotball, padel], events, today: '2026-09-05', name: 'PSI Fotball' });
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.trim().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics).toContain('X-WR-CALNAME:PSI Fotball');
    expect(ics).toContain('DTSTART;TZID=Europe/Oslo:20260911T180000');
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=FR');
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=TU');
    expect(ics).toContain('SUMMARY:PSI Fotball: Kamp mot Bø\\, hjemme');
    expect(ics).toContain('DTSTART;TZID=Europe/Oslo:20260919T140000');
    expect((ics.match(/BEGIN:VEVENT/g) || []).length).toBe(3);
    // Ingen linje over 75 oktetter
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
  it('filtrerer på gruppe og type', () => {
    const bare = buildIcs({ sports: [fotball, padel], events, today: '2026-09-05', slugs: ['padel'] });
    expect(bare).not.toContain('BEGIN:VEVENT');
    const kunKamper = buildIcs({ sports: [fotball], events, today: '2026-09-05', kinds: ['match'] });
    expect((kunKamper.match(/BEGIN:VEVENT/g) || []).length).toBe(1);
  });
  it('avlyste arrangementer merkes', () => {
    const ics = buildIcs({ sports: [], events: [{ ...events[0], status: 'cancelled' }], today: '2026-09-05' });
    expect(ics).toContain('STATUS:CANCELLED');
    expect(ics).toContain('(avlyst)');
  });
});

describe('abonnementsadresser', () => {
  it('parseFeedSlug', () => {
    expect(parseFeedSlug('psi.ics')).toEqual([]);
    expect(parseFeedSlug('alle')).toEqual([]);
    expect(parseFeedSlug('fotball+klatring.ics')).toEqual(['fotball', 'klatring']);
    expect(parseFeedSlug('Fotball,../x')).toEqual(['fotball']);
  });
  it('feedPath', () => {
    expect(feedPath([])).toBe('/api/kalender/psi.ics');
    expect(feedPath(['fotball', 'klatring'], { kinds: ['match', 'event'] })).toBe('/api/kalender/fotball+klatring.ics?type=match,event');
  });
});

describe('Spond overstyrer grunnskjemaet', () => {
  const spondKamp = { id: 's1', sport_slug: 'fotball', kind: 'match', title: { nb: 'Kamp mot Bø' }, starts_at: '2026-09-18T16:00:00Z', ends_at: '2026-09-18T18:00:00Z', status: 'published', source: 'spond', external_id: 'sp1' };
  const manuelt = { id: 'm1', sport_slug: 'fotball', kind: 'event', title: { nb: 'Sosialt' }, starts_at: '2026-09-25T16:00:00Z', status: 'published', source: 'manual' };

  it('spondDays samler dagene per gruppe, og hopper over manuelle og skjulte', () => {
    const map = spondDays([spondKamp, manuelt, { ...spondKamp, id: 's2', external_id: 'sp2', hidden_by_admin: true, starts_at: '2026-09-11T16:00:00Z' }]);
    expect([...map.keys()]).toEqual(['fotball']);
    expect([...map.get('fotball')]).toEqual(['2026-09-18']);
  });

  it('fjerner den genererte treningen den dagen Spond har et arrangement', () => {
    const uten = agenda({ sports: [fotball], events: [], fromIso: '2026-09-14', toIso: '2026-09-20' });
    expect(uten.filter((i) => i.kind === 'training').length).toBe(2);   // tirsdag + fredag

    const med = agenda({ sports: [fotball], events: [spondKamp], fromIso: '2026-09-14', toIso: '2026-09-20' });
    const dager = med.filter((i) => i.kind === 'training').map((i) => i.start.toISOString().slice(0, 10));
    expect(dager).toEqual(['2026-09-15']);                              // fredagen er borte
    expect(med.some((i) => i.id === 'event-s1')).toBe(true);
  });

  it('et manuelt arrangement fjerner ingen trening', () => {
    const med = agenda({ sports: [fotball], events: [manuelt], fromIso: '2026-09-21', toIso: '2026-09-27' });
    expect(med.filter((i) => i.kind === 'training').length).toBe(2);
  });

  it('skjulte arrangementer vises ikke', () => {
    const med = agenda({ sports: [fotball], events: [{ ...manuelt, hidden_by_admin: true }], fromIso: '2026-09-21', toIso: '2026-09-27' });
    expect(med.some((i) => i.id === 'event-m1')).toBe(false);
  });

  it('ICS tar dagen ut av den ukentlige regelen med EXDATE', () => {
    const ics = buildIcs({ sports: [fotball], events: [spondKamp], today: '2026-09-05' });
    expect(ics).toContain('EXDATE;TZID=Europe/Oslo:20260918T180000');
    // Bare fredagsøkta rammes; tirsdagsregelen står urørt.
    expect((ics.match(/EXDATE/g) || []).length).toBe(1);
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=TU');
  });

  it('uten Spond-arrangementer kommer ingen EXDATE', () => {
    expect(buildIcs({ sports: [fotball], events: [manuelt], today: '2026-09-05' })).not.toContain('EXDATE');
  });

  it('normalizeEvents merker hvor raden kom fra', () => {
    const [a, b] = normalizeEvents([spondKamp, manuelt]);
    expect(a.fromSpond).toBe(true);
    expect(b.fromSpond).toBe(false);
  });
});
