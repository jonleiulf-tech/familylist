import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  parseHovedbok, linjeAv, tilTall, tilDato, delsumAv, totalsumAv, kontoAv,
  gikkOpp, medNøkler, nøkkelFor, planlegg,
} from './hovedbok.js';

const les = (navn) => readFileSync(new URL(`./__fixtures__/${navn}`, import.meta.url), 'utf8').split('\n');
const APRIL = les('hovedbok-2026-04.txt');
const AUGUST = les('hovedbok-2026-08.txt');

describe('tilTall', () => {
  it('leser norske beløp', () => {
    expect(tilTall('2 490,00')).toBe(2490);
    expect(tilTall('135 043,17')).toBe(135043.17);
    expect(tilTall('17,60')).toBe(17.6);
    expect(tilTall('416,71')).toBe(416.71);
  });

  it('takler hardt og smalt mellomrom', () => {
    // Hvilket mellomrom som havner i PDF-en avhenger av hvem som lagde den.
    expect(tilTall('42 982,20')).toBe(42982.2);
    expect(tilTall('42 982,20')).toBe(42982.2);
  });

  it('takler minus foran og bak', () => {
    expect(tilTall('-1 000,50')).toBe(-1000.5);
    expect(tilTall('1 000,50-')).toBe(-1000.5);
  });

  it('sier null på det som ikke er et tall', () => {
    expect(tilTall('')).toBe(null);
    expect(tilTall('Sum')).toBe(null);
    expect(tilTall(null)).toBe(null);
  });
});

describe('tilDato', () => {
  it('snur norsk dato til ISO', () => {
    expect(tilDato('13.01.2026')).toBe('2026-01-13');
    expect(tilDato('31.12.2025')).toBe('2025-12-31');
  });
  it('avviser noe annet', () => {
    expect(tilDato('2026-01-13')).toBe(null);
    expect(tilDato('')).toBe(null);
  });
});

describe('linjeAv – de vanskelige radene fra de virkelige filene', () => {
  it('vanlig rad med tekst og mvakode', () => {
    const r = linjeAv('9   13.01.2026   1   20182 - PING SERVICES AS - fakturanr. 38078036   0   10   2 490,00 6565', '10');
    expect(r).toMatchObject({ bilagsnr: '9', dato: '2026-01-13', periode: 1, mvakode: '0', avdeling: '10', belop: 2490, konto: '6565' });
    expect(r.tekst).toBe('20182 - PING SERVICES AS - fakturanr. 38078036');
  });

  it('rad helt uten tekst', () => {
    const r = linjeAv('259   21.04.2026   4   1   10   1 755,00 6565', '10');
    expect(r).toMatchObject({ bilagsnr: '259', tekst: null, mvakode: '1', belop: 1755 });
  });

  it('rad uten mvakode – uten å spise sifre av fakturanummeret', () => {
    // Et regex som plukker «siste to sifre» lager mvakode 61 av
    // «fakturanr. 93166661» og etterlater et forkortet fakturanummer.
    const r = linjeAv('57   31.01.2026   1   20045 - Porsgrunn kommune - fakturanr. 93166661   10   1 750,00 6565', '10');
    expect(r.tekst).toBe('20045 - Porsgrunn kommune - fakturanr. 93166661');
    expect(r.mvakode).toBe(null);
    expect(r.belop).toBe(1750);
  });

  it('rad der bilagsnummeret og avdelingen er samme tall', () => {
    // Bilag 10, avdeling 10, og fakturanummeret slutter på 10.
    const r = linjeAv('10   13.01.2026   1   20182 - PING SERVICES AS - fakturanr. 38078010   0   10   2 490,00 6565', '10');
    expect(r.belop).toBe(2490);
    expect(r.tekst).toBe('20182 - PING SERVICES AS - fakturanr. 38078010');
  });

  it('rad med spesialtegn i teksten', () => {
    const r = linjeAv('258   21.04.2026   4   ®fra:6565 - Undergrupper   10   270,00 6565', '10');
    expect(r).toMatchObject({ tekst: '®fra:6565 - Undergrupper', belop: 270, mvakode: null });
  });

  it('to sifret mvakode', () => {
    const r = linjeAv('101   27.02.2026   2   20271 - Høyt Under Taket Skien AS - fakturanr. 1000270   13   5   22 767,86 6565', '5');
    expect(r).toMatchObject({ mvakode: '13', belop: 22767.86 });
  });

  it('sier nei til noe som ikke er en rad', () => {
    expect(linjeAv('Bilagsnr.   Dato   Periode   Tekst', '10')).toBe(null);
    expect(linjeAv('42 982,20 Sum konto 6565, Avdeling nr. 10', '10')).toBe(null);
  });
});

describe('overskrifter og summer', () => {
  it('leser delsum per avdeling', () => {
    expect(delsumAv('42 982,20 Sum konto 6565, Avdeling nr. 10')).toEqual({ sum: 42982.2, konto: '6565', avdeling: '10' });
  });
  it('leser totalsum', () => {
    expect(totalsumAv('135 043,17 Sum konto 6565:')).toEqual({ sum: 135043.17, konto: '6565' });
  });
  it('leser hvilken konto rapporten gjelder', () => {
    expect(kontoAv('Hovedbokskonto 6565 - Undergrupper')).toEqual({ konto: '6565', kontonavn: 'Undergrupper' });
  });
});

describe('hele rapporten fra august 2026', () => {
  const r = parseHovedbok(AUGUST);

  it('leser år, konto og alle linjene', () => {
    expect(r.ar).toBe(2026);
    expect(r.konto).toBe('6565');
    expect(r.linjer).toHaveLength(43);
  });

  it('finner alle seks avdelingene', () => {
    expect(r.avdelinger.map((a) => a.nr).sort()).toEqual(['10', '11', '12', '2', '5', '9']);
  });

  it('summerer hver avdeling likt med det rapporten selv oppgir', () => {
    // Dette er den viktigste prøven i fila. Rapporten oppgir sine egne
    // delsummer, så en parser som leser feil kan tas på fersken.
    for (const a of r.avdelinger) expect([a.nr, a.sum]).toEqual([a.nr, a.oppgittSum]);
  });

  it('lander på samme totalsum som rapporten', () => {
    expect(r.sum).toBe(135043.17);
    expect(r.sum).toBe(r.oppgittSum);
  });

  it('gir ingen advarsler', () => {
    expect(r.advarsler).toEqual([]);
    expect(gikkOpp(r)).toBe(true);
  });

  it('hopper over sidefot og kolonneoverskrifter', () => {
    // Rapporten er på to sider, med gjentatt topptekst midt i.
    expect(r.linjer.every((l) => l.bilagsnr && l.dato)).toBe(true);
  });
});

describe('rapporten fra april 2026', () => {
  const r = parseHovedbok(APRIL);
  it('går opp den også', () => {
    expect(r.linjer).toHaveLength(25);
    expect(r.sum).toBe(58037.37);
    expect(r.advarsler).toEqual([]);
  });
});

describe('parseren tar seg selv i å lese feil', () => {
  it('sier fra når en delsum ikke stemmer', () => {
    const tuklet = AUGUST.map((l) => (l.startsWith('42 982,20 Sum') ? '99 999,99 Sum konto 6565, Avdeling nr. 10' : l));
    const r = parseHovedbok(tuklet);
    expect(r.advarsler.some((a) => a.includes('Avdeling 10'))).toBe(true);
    expect(gikkOpp(r)).toBe(false);
  });

  it('sier fra når en rad ikke lot seg lese', () => {
    const tuklet = [...AUGUST];
    const i = tuklet.findIndex((l) => l.includes('PING SERVICES'));
    tuklet[i] = '9   13.01.2026   1   noe helt rart uten beløp';
    const r = parseHovedbok(tuklet);
    expect(r.advarsler.some((a) => a.includes('Klarte ikke lese'))).toBe(true);
  });

  it('sier fra på en tom fil i stedet for å påstå at alt er i orden', () => {
    expect(gikkOpp(parseHovedbok([]))).toBe(false);
    expect(gikkOpp(parseHovedbok(['Helt annen PDF']))).toBe(false);
  });
});

describe('nøkler', () => {
  it('gir samme nøkkel for samme bokføringslinje', () => {
    const a = parseHovedbok(APRIL).linjer[0];
    const b = parseHovedbok(APRIL).linjer[0];
    expect(nøkkelFor(a)).toBe(nøkkelFor(b));
  });

  it('skiller to linjer som bare ligner', () => {
    const [a, b] = parseHovedbok(APRIL).linjer;   // bilag 9, mvakode 0 og 1
    expect(nøkkelFor(a)).not.toBe(nøkkelFor(b));
  });

  it('skiller to helt like rader med løpenummer', () => {
    const rad = { konto: '6565', avdeling: '10', bilagsnr: '1', dato: '2026-01-01', mvakode: null, belop: 100 };
    const ut = medNøkler([rad, { ...rad }]);
    expect(ut[0].nokkel).not.toBe(ut[1].nokkel);
  });
});

describe('planlegging: samme rapport kan importeres om igjen', () => {
  const kobling = { 10: 'fotball', 11: 'padel', 2: 'volleyball', 5: 'klatring', 9: null, 12: 'sigrun' };
  const april = parseHovedbok(APRIL).linjer;
  const august = parseHovedbok(AUGUST).linjer;

  it('første import er bare nye linjer', () => {
    const p = planlegg({ linjer: april, eksisterende: [], kobling });
    expect(p.nye).toHaveLength(25);
    expect(p.uendret).toHaveLength(0);
  });

  it('neste rapport legger bare til det som er kommet til', () => {
    // Augustrapporten inneholder alt som sto i aprilrapporten. Importerer
    // man begge, skal januar ikke telles to ganger.
    const base = planlegg({ linjer: april, eksisterende: [], kobling }).nye.map((r, i) => ({ ...r, id: `i${i}` }));
    const p = planlegg({ linjer: august, eksisterende: base, kobling });
    expect(p.uendret).toHaveLength(25);
    expect(p.nye).toHaveLength(18);
    expect(base.length + p.nye.length).toBe(43);
  });

  it('samme fil to ganger gir ingenting nytt', () => {
    const base = planlegg({ linjer: august, eksisterende: [], kobling }).nye.map((r, i) => ({ ...r, id: `i${i}` }));
    const p = planlegg({ linjer: august, eksisterende: base, kobling });
    expect(p.nye).toHaveLength(0);
    expect(p.uendret).toHaveLength(43);
  });

  it('oppdager at en linje er rettet i regnskapet', () => {
    const base = planlegg({ linjer: august, eksisterende: [], kobling }).nye.map((r, i) => ({ ...r, id: `i${i}` }));
    base[0] = { ...base[0], tekst: 'Noe annet' };
    const p = planlegg({ linjer: august, eksisterende: base, kobling });
    expect(p.endret).toHaveLength(1);
  });

  it('sier fra om avdelinger som ikke er koblet til en gruppe', () => {
    // Uten kobling vet vi ikke hvilken gruppe pengene hører til, og da
    // skal importen spørre i stedet for å gjette.
    const p = planlegg({ linjer: august, eksisterende: [], kobling: { 10: 'fotball' } });
    expect(p.ukjenteAvdelinger.sort()).toEqual(['11', '12', '2', '5', '9']);
  });

  it('regner Felles PSI som koblet, selv om slug-en er null', () => {
    const p = planlegg({ linjer: august, eksisterende: [], kobling });
    expect(p.ukjenteAvdelinger).toEqual([]);
    expect(p.nye.find((r) => r.avdeling === '9').sport_slug).toBe(null);
  });
});
