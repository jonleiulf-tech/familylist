import { describe, it, expect } from 'vitest';
import { statusAv, erAktiv, erPauset, erSynlig, aktivFlagg, pausetekst } from './gruppestatus.js';

describe('statusAv', () => {
  it('leser status når den er satt', () => {
    expect(statusAv({ status: 'aktiv' })).toBe('aktiv');
    expect(statusAv({ status: 'pauset' })).toBe('pauset');
    expect(statusAv({ status: 'skjult' })).toBe('skjult');
  });

  it('leser den gamle boolean-en når status mangler', () => {
    // Radene i databasen har bare active til noen har vært innom dem i
    // admin. De skal oppføre seg nøyaktig som før.
    expect(statusAv({ active: true })).toBe('aktiv');
    expect(statusAv({ active: false })).toBe('skjult');
    expect(statusAv({})).toBe('aktiv');
  });

  it('lar status vinne over active', () => {
    // En pauset gruppe har active: false i databasen, fordi
    // kalenderfeeden leser den kolonnen. Uten at status vinner her, ville
    // gruppa blitt lest som skjult og mistet sida si.
    expect(statusAv({ status: 'pauset', active: false })).toBe('pauset');
  });

  it('ignorerer en status vi ikke kjenner', () => {
    expect(statusAv({ status: 'noe-rart', active: true })).toBe('aktiv');
    expect(statusAv({ status: 'noe-rart', active: false })).toBe('skjult');
  });

  it('tåler tomt', () => {
    expect(statusAv(null)).toBe('aktiv');
    expect(statusAv(undefined)).toBe('aktiv');
  });
});

describe('hvem vises hvor', () => {
  const aktiv = { status: 'aktiv' };
  const pauset = { status: 'pauset' };
  const skjult = { status: 'skjult' };

  it('bare aktive er «aktive»', () => {
    expect([aktiv, pauset, skjult].filter(erAktiv)).toEqual([aktiv]);
  });

  it('pausede grupper har fortsatt en side', () => {
    // Hele poenget med pause framfor sletting: historikken blir stående.
    expect([aktiv, pauset, skjult].filter(erSynlig)).toEqual([aktiv, pauset]);
    expect(erPauset(pauset)).toBe(true);
  });

  it('active-kolonnen settes bare for aktive grupper', () => {
    // Kalenderfeeden leser active. En pauset gruppe skal ikke lage
    // treningsoppføringer i noens kalender.
    expect(aktivFlagg('aktiv')).toBe(true);
    expect(aktivFlagg('pauset')).toBe(false);
    expect(aktivFlagg('skjult')).toBe(false);
  });
});

describe('pausetekst', () => {
  it('fyller ut gruppe og e-post', () => {
    const mal = 'Er du interessert i å starte opp igjen {gruppe}, send en e-post til {epost}.';
    expect(pausetekst(mal, { gruppe: 'PSI Klatring', epost: 'leder@sig.no' }))
      .toBe('Er du interessert i å starte opp igjen PSI Klatring, send en e-post til leder@sig.no.');
  });

  it('bytter ut alle forekomster', () => {
    expect(pausetekst('{gruppe} … {gruppe}', { gruppe: 'Padel' })).toBe('Padel … Padel');
  });

  it('lar ukjente plassholdere stå', () => {
    expect(pausetekst('Hei {noeannet}', { gruppe: 'X' })).toBe('Hei {noeannet}');
  });

  it('tåler tom mal', () => {
    expect(pausetekst('', { gruppe: 'X' })).toBe('');
    expect(pausetekst(null, { gruppe: 'X' })).toBe('');
  });

  it('lar ikke en manglende verdi legge igjen «undefined»', () => {
    expect(pausetekst('Send til {epost}.', { gruppe: 'X' })).toBe('Send til .');
  });
});
