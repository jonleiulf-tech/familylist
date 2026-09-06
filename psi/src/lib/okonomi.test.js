import { describe, it, expect } from 'vitest';
import { sum, kr, øre, kroner, regnUt, oversikt, total, andelBrukt, periodeFor, sorterPerioder, periodeNavn, teller, grupperFor, FELLES } from './okonomi.js';

describe('kroner uten flyttallsdrift', () => {
  it('summerer beløp med desimaler riktig', () => {
    // 0.1 + 0.2 er 0.30000000000000004 i JavaScript. Et budsjett som
    // ikke går opp er verdiløst uansett hvor lite avviket er.
    expect(sum([0.1, 0.2])).toBe(0.3);
    expect(sum([38.125, 2193.75])).toBe(2231.88);
  });

  it('summerer de faktiske tallene fra regnearket', () => {
    // Utlegg Jon, PSI Fotball, vår 2026: 860 + 99,90 + 195 + 35 + 20 + 20
    expect(sum([860, 99.9, 195, 35, 20, 20])).toBe(1229.9);
  });

  it('holder seg presis over mange rader', () => {
    const mange = Array.from({ length: 1000 }, () => 0.01);
    expect(sum(mange)).toBe(10);
  });

  it('summerer objekter med belop', () => {
    expect(sum([{ belop: 100 }, { belop: 250.5 }])).toBe(350.5);
  });

  it('tåler tomt og tull', () => {
    expect(sum([])).toBe(0);
    expect(sum([null, undefined, ''])).toBe(0);
  });

  it('øre og kroner er hverandres motsatte', () => {
    expect(kroner(øre(2193.75))).toBe(2193.75);
    expect(øre(38.125)).toBe(3813);   // rundes til nærmeste øre
  });
});

describe('kr()', () => {
  it('skriver hele kroner uten desimaler', () => {
    expect(kr(22800)).toBe('kr 22 800');
    expect(kr(0)).toBe('kr 0');
  });

  it('tar med desimaler bare når det trengs', () => {
    expect(kr(2193.75)).toBe('kr 2 193,75');
  });

  it('bruker hardt mellomrom som tusenskille', () => {
    // Vanlig mellomrom lar tallet brekke midt i en tabellcelle.
    expect(kr(168323)).toContain(' ');
    expect(kr(168323)).not.toMatch(/\d \d/);
  });

  it('takler negative tall', () => {
    expect(kr(-2905)).toBe('kr −2 905');
  });
});

describe('regnUt', () => {
  /* Fotball vår 2026, hentet fra regnearket:
     innvilget 22 800, til gode fra 2025: 6 625, budsjettert 32 330,
     faktisk 6 100 (2 100 halleie + 1 100 førstehjelp + 1 230 leggskinn
     + 1 670 annet). Resterende skal bli 23 325. */
  const fotball = {
    tildeling: { innvilget: 22800, overfort: 6625 },
    poster: [
      { budsjettert: 0 }, { budsjettert: 2100 }, { budsjettert: 8900 }, { budsjettert: 3000 },
      { budsjettert: 2000 }, { budsjettert: 2100 }, { budsjettert: 13000 }, { budsjettert: 1230 },
    ],
    bilag: [
      { belop: 2100, status: 'refundert' },
      { belop: 1100, status: 'sendt' },
      { belop: 1230, status: 'registrert' },
      { belop: 1670, status: 'registrert' },
    ],
  };

  it('regner ut det samme som regnearket', () => {
    const r = regnUt(fotball);
    expect(r.tilgjengelig).toBe(29425);     // 22 800 + 6 625
    expect(r.budsjettert).toBe(32330);
    expect(r.brukt).toBe(6100);
    expect(r.rest).toBe(23325);
  });

  it('sier fra når det er budsjettert for mye', () => {
    // 32 330 budsjettert mot 29 425 tilgjengelig: regnearket viser −2 905.
    const r = regnUt(fotball);
    expect(r.restBudsjettert).toBe(-2905);
    expect(r.overbudsjettert).toBe(true);
    expect(r.overforbruk).toBe(false);      // brukt er godt innenfor
  });

  it('skiller refundert fra det som fortsatt venter', () => {
    const r = regnUt(fotball);
    expect(r.refundert).toBe(2100);
    expect(r.venter).toBe(4000);            // 1 100 + 1 230 + 1 670
    expect(sum([r.refundert, r.venter])).toBe(r.brukt);
  });

  it('lar avviste bilag være ute av regnestykket', () => {
    const r = regnUt({ ...fotball, bilag: [...fotball.bilag, { belop: 5000, status: 'avvist' }] });
    expect(r.brukt).toBe(6100);
    expect(r.antallBilag).toBe(4);
    expect(teller({ status: 'avvist' })).toBe(false);
    expect(teller({ status: 'registrert' })).toBe(true);
  });

  it('sier fra ved overforbruk', () => {
    const r = regnUt({ tildeling: { innvilget: 1000 }, bilag: [{ belop: 1500, status: 'registrert' }] });
    expect(r.rest).toBe(-500);
    expect(r.overforbruk).toBe(true);
  });

  it('takler en gruppe uten tildeling og uten bilag', () => {
    const r = regnUt({});
    expect(r.tilgjengelig).toBe(0);
    expect(r.brukt).toBe(0);
    expect(r.rest).toBe(0);
    expect(r.overforbruk).toBe(false);
  });
});

describe('andelBrukt', () => {
  it('gir andelen av tildelingen som er brukt', () => {
    expect(andelBrukt({ tilgjengelig: 1000, brukt: 250 })).toBe(0.25);
  });

  it('klipper på 100 prosent ved overforbruk', () => {
    expect(andelBrukt({ tilgjengelig: 1000, brukt: 1500 })).toBe(1);
  });

  it('deler ikke på null', () => {
    // En gruppe uten innvilget beløp skal ikke tegne en søyle som blir NaN.
    expect(andelBrukt({ tilgjengelig: 0, brukt: 0 })).toBe(0);
    expect(andelBrukt({ tilgjengelig: 0, brukt: 500 })).toBe(1);
  });
});

describe('oversikt og total', () => {
  const grupper = grupperFor([
    { slug: 'fotball', name: 'PSI Fotball', icon: '⚽' },
    { slug: 'padel', name: 'PSI Padel', icon: '🎾' },
  ]);
  const tildelinger = [
    { sport_slug: 'fotball', innvilget: 22800 },
    { sport_slug: 'padel', innvilget: 30000 },
    { sport_slug: null, innvilget: 40000 },     // Felles PSI
  ];
  const bilag = [
    { sport_slug: 'fotball', belop: 6100, status: 'registrert' },
    { sport_slug: null, belop: 2000, status: 'refundert' },
    { sport_slug: 'padel', belop: 500, status: 'avvist' },
  ];

  it('har med Felles PSI som en gruppe uten slug', () => {
    expect(grupper.at(-1)).toEqual(FELLES);
    const rader = oversikt({ grupper, tildelinger, bilag });
    const felles = rader.find((r) => r.slug === null);
    expect(felles.name).toBe('Felles PSI');
    expect(felles.tilgjengelig).toBe(40000);
    expect(felles.brukt).toBe(2000);
  });

  it('holder gruppene fra hverandre', () => {
    const rader = oversikt({ grupper, tildelinger, bilag });
    expect(rader.find((r) => r.slug === 'fotball').brukt).toBe(6100);
    expect(rader.find((r) => r.slug === 'padel').brukt).toBe(0);     // bare et avvist bilag
    expect(rader.find((r) => r.slug === 'padel').rest).toBe(30000);
  });

  it('summerer totalen fra radene', () => {
    // Totalen regnes ikke om på nytt: tabellen og summen under den kan
    // aldri si to forskjellige ting.
    const rader = oversikt({ grupper, tildelinger, bilag });
    const t = total(rader);
    expect(t.tilgjengelig).toBe(92800);
    expect(t.brukt).toBe(8100);
    expect(t.rest).toBe(84700);
    expect(t.antallBilag).toBe(2);
  });
});

describe('perioder', () => {
  it('vår går ut juli, høst tar resten', () => {
    // Semesteret slutter når eksamen er over, ikke ved nyttår.
    expect(periodeFor(new Date('2026-01-15'))).toEqual({ ar: 2026, semester: 'var' });
    expect(periodeFor(new Date('2026-07-31'))).toEqual({ ar: 2026, semester: 'var' });
    expect(periodeFor(new Date('2026-08-01'))).toEqual({ ar: 2026, semester: 'host' });
    expect(periodeFor(new Date('2026-12-24'))).toEqual({ ar: 2026, semester: 'host' });
  });

  it('sorterer nyeste først', () => {
    const p = sorterPerioder([
      { ar: 2025, semester: 'var' }, { ar: 2026, semester: 'host' },
      { ar: 2026, semester: 'var' }, { ar: 2025, semester: 'host' },
    ]);
    expect(p.map(periodeNavn)).toEqual(['Høst 2026', 'Vår 2026', 'Høst 2025', 'Vår 2025']);
  });
});
