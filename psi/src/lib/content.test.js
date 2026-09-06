import { describe, it, expect } from 'vitest';
import { fileContent, mergeContent, derive, hentMedia, MEDIA_NY, MEDIA_BASIS } from './content.jsx';

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

describe('hovedgalleriet', () => {
  const grunn = { sports: [], news: [], events: [], media: [], board: [] };
  const bilder = [
    { id: '1', sport_slug: 'fotball', show_in_gallery: true, show_in_main: false },
    { id: '2', sport_slug: 'fotball', show_in_gallery: false, show_in_main: true },
    { id: '3', sport_slug: null, show_in_gallery: true, show_in_main: false },
    { id: '4', sport_slug: 'volleyball', show_in_gallery: true, show_in_main: true },
  ];
  const ut = derive(mergeContent(grunn, { media: bilder }));

  it('er felles for gruppene', () => {
    expect(ut.mainGallery().map((m) => m.id)).toEqual(['2', '3', '4']);
  });

  it('lar gruppegalleriet være gruppas eget', () => {
    expect(ut.galleryFor('fotball').map((m) => m.id)).toEqual(['1']);
  });

  it('beholder de gamle fellesbildene selv før migrasjon 0009', () => {
    expect(ut.mainGallery().some((m) => m.id === '3')).toBe(true);
  });
});

describe('partnerlogoer', () => {
  const grunn = {
    sports: [], news: [], events: [], media: [], board: [],
    partners: [
      { name: 'BEHA Sport', shortName: 'BEHA Sport', logo: '/images/partners/beha-sport.png', logoSourcePage: 'https://behasport.no/' },
      { name: 'Studentsamfunnet i Grenland (SiG)', shortName: 'SiG', logo: '/images/partners/sig.svg', logoBackground: 'dark' },
    ],
  };

  it('hentes fra fila når raden i databasen ikke har noen', () => {
    const ut = mergeContent(grunn, { content: [{ key: 'partners', value: [{ name: 'BEHA Sport', logo: null }] }] });
    expect(ut.partners[0].logo).toBe('/images/partners/beha-sport.png');
    expect(ut.partners[0].logoSourcePage).toBe('https://behasport.no/');
  });

  it('viker for en logo som er satt i admin', () => {
    const ut = mergeContent(grunn, { content: [{ key: 'partners', value: [{ name: 'BEHA Sport', logo: '/images/partners/annen.png' }] }] });
    expect(ut.partners[0].logo).toBe('/images/partners/annen.png');
  });

  it('tar med bakgrunnen så hvite logoer ikke blir usynlige', () => {
    const ut = mergeContent(grunn, { content: [{ key: 'partners', value: [{ shortName: 'SiG', name: 'Studentsamfunnet i Grenland (SiG)' }] }] });
    expect(ut.partners[0].logoBackground).toBe('dark');
  });

  it('henter medlemsfordelen fra fila når databasen ikke har den', () => {
    const medFordel = {
      ...grunn,
      partners: [{ name: 'BEHA Sport', logo: null, offer: { title: { nb: 'Rabatt for SiG-medlemmer' }, body: { nb: '30 % på Hummel' } } }],
    };
    const ut = mergeContent(medFordel, { content: [{ key: 'partners', value: [{ name: 'BEHA Sport' }] }] });
    expect(ut.partners[0].offer.title.nb).toBe('Rabatt for SiG-medlemmer');
  });

  it('viker for en fordel som er skrevet i admin', () => {
    const medFordel = {
      ...grunn,
      partners: [{ name: 'BEHA Sport', offer: { title: { nb: 'Gammel' }, body: { nb: 'Gammel' } } }],
    };
    const ut = mergeContent(medFordel, { content: [{ key: 'partners', value: [{ name: 'BEHA Sport', offer: { title: { nb: 'Ny' }, body: { nb: 'Ny tekst' } } }] }] });
    expect(ut.partners[0].offer.title.nb).toBe('Ny');
  });

  it('lar en ukjent partner stå uten logo', () => {
    const ut = mergeContent(grunn, { content: [{ key: 'partners', value: [{ name: 'Ny partner' }] }] });
    expect(ut.partners[0].logo).toBe(null);
  });
});

describe('henting av bilder', () => {
  const fake = (svar) => {
    const kall = [];
    const db = { from: () => ({ select: (kol) => { kall.push(kol); const kjede = { or: () => kjede, order: () => svar(kol) }; return kjede; } }) };
    return { db, kall };
  };

  it('bruker de nye kolonnene når databasen har dem', async () => {
    const { db, kall } = fake(() => ({ data: [{ id: '1' }], error: null }));
    const r = await hentMedia(db);
    expect(r.data).toHaveLength(1);
    expect(kall).toEqual([MEDIA_NY]);
  });

  it('mister ikke alle bildene når en kolonne mangler', async () => {
    const { db, kall } = fake((kol) => (kol === MEDIA_NY
      ? { data: null, error: { code: '42703', message: 'column media.show_in_main does not exist' } }
      : { data: [{ id: '1' }, { id: '2' }], error: null }));
    const r = await hentMedia(db);
    expect(r.error).toBeFalsy();
    expect(r.data).toHaveLength(2);
    expect(kall).toEqual([MEDIA_NY, MEDIA_BASIS]);
  });
});
