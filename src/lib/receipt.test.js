import { describe, it, expect } from 'vitest';
import {
  detectStore, detectDate, parseLines, detectTotal,
  validateReceipt, blendPrice,
} from './receipt.js';

const TODAY = new Date('2026-08-29T12:00:00');

const GOOD = `COOP EXTRA DR. MUNK
Org.nr 123456789
Dato: 27.08.2026  Kasse 3

Lettmelk 1,2% 1l        24,90
Kneippbrød 750g         34,90
Norvegia 1kg           119,90
Kjøttdeig 400g          64,90
Agurk                   27,90

SUM                    272,50
Bankkort               272,50
Takk for handelen`;

describe('detectStore', () => {
  it('finner Coop Extra', () => {
    expect(detectStore(GOOD).code).toBe('COOP_EXTRA');
  });
  it('finner Meny', () => {
    expect(detectStore('MENY MAJORSTUEN\nDato 01.01.2026').code).toBe('MENY_NO');
  });
  it('finner Rema', () => {
    expect(detectStore('REMA 1000 STORO').code).toBe('REMA_1000');
  });
  it('returnerer null for ukjent butikk', () => {
    expect(detectStore('KOLONIAL EN ELLER ANNEN')).toBeNull();
  });
  it('leter bare i toppen av kvitteringen', () => {
    const late = `${'x\n'.repeat(30)}MENY`;
    expect(detectStore(late)).toBeNull();
  });
});

describe('detectDate', () => {
  it('leser dd.mm.yyyy', () => expect(detectDate('Dato: 27.08.2026')).toBe('2026-08-27'));
  it('leser dd.mm.yy', () => expect(detectDate('27.08.26')).toBe('2026-08-27'));
  it('leser ISO', () => expect(detectDate('2026-08-27')).toBe('2026-08-27'));
  it('leser skråstrek', () => expect(detectDate('27/08/2026')).toBe('2026-08-27'));
  it('returnerer null uten dato', () => expect(detectDate('ingen dato her')).toBeNull());
});

describe('parseLines', () => {
  it('finner alle varelinjene', () => {
    const lines = parseLines(GOOD);
    expect(lines).toHaveLength(5);
    expect(lines[0]).toEqual({ name: 'Lettmelk 1,2% 1l', price: 24.9 });
  });
  it('hopper over sum, betaling og støy', () => {
    const names = parseLines(GOOD).map((l) => l.name.toLowerCase());
    expect(names.some((n) => n.includes('sum'))).toBe(false);
    expect(names.some((n) => n.includes('bankkort'))).toBe(false);
  });
  it('hopper over pant og rabatt', () => {
    const lines = parseLines('Brus 1,5l     32,90\nPant             3,00\nRabatt          -5,00');
    expect(lines).toHaveLength(1);
    expect(lines[0].name).toBe('Brus 1,5l');
  });
  it('takler «kr» etter beløpet', () => {
    expect(parseLines('Melk    24,90 kr')[0].price).toBe(24.9);
  });
  it('takler punktum som desimalskille', () => {
    expect(parseLines('Melk    24.90')[0].price).toBe(24.9);
  });
  it('ignorerer linjer uten beløp', () => {
    expect(parseLines('Bare tekst uten pris')).toHaveLength(0);
  });
});

describe('detectTotal', () => {
  it('finner SUM', () => expect(detectTotal(GOOD)).toBe(272.5));
  it('finner «Å betale»', () => expect(detectTotal('Å betale   150,00')).toBe(150));
  it('returnerer null uten sum', () => expect(detectTotal('Melk 24,90')).toBeNull());
});

describe('validateReceipt', () => {
  it('godtar en gyldig kvittering', () => {
    const r = validateReceipt(GOOD, { today: TODAY });
    expect(r.valid).toBe(true);
    expect(r.problems).toEqual([]);
    expect(r.store.code).toBe('COOP_EXTRA');
    expect(r.date).toBe('2026-08-27');
    expect(r.lines).toHaveLength(5);
  });

  it('avviser ukjent butikk', () => {
    const r = validateReceipt(GOOD.replace('COOP EXTRA DR. MUNK', 'UKJENT BUTIKK'), { today: TODAY });
    expect(r.valid).toBe(false);
    expect(r.problems.join(' ')).toMatch(/butikk/i);
  });

  it('avviser dato fram i tid', () => {
    const r = validateReceipt(GOOD.replace('27.08.2026', '27.08.2027'), { today: TODAY });
    expect(r.valid).toBe(false);
    expect(r.problems.join(' ')).toMatch(/fram i tid/i);
  });

  it('avviser kvittering eldre enn 12 måneder', () => {
    const r = validateReceipt(GOOD.replace('27.08.2026', '27.08.2024'), { today: TODAY });
    expect(r.valid).toBe(false);
    expect(r.problems.join(' ')).toMatch(/eldre enn/i);
  });

  it('avviser færre enn to varelinjer', () => {
    const r = validateReceipt('COOP EXTRA\n27.08.2026\nMelk   24,90\nSUM    24,90', { today: TODAY });
    expect(r.valid).toBe(false);
    expect(r.problems.join(' ')).toMatch(/to varelinjer/i);
  });

  it('avviser når totalsum avviker mer enn 15 %', () => {
    const r = validateReceipt(GOOD.replace('SUM                    272,50', 'SUM                    500,00'), { today: TODAY });
    expect(r.valid).toBe(false);
    expect(r.problems.join(' ')).toMatch(/avviker/i);
  });

  it('godtar avvik innenfor 15 %', () => {
    // 272,50 -> 290,00 er ca. 6 %
    const r = validateReceipt(GOOD.replace('SUM                    272,50', 'SUM                    290,00'), { today: TODAY });
    expect(r.valid).toBe(true);
  });

  it('samler opp flere problemer samtidig', () => {
    const r = validateReceipt('UKJENT\nMelk 24,90', { today: TODAY });
    expect(r.problems.length).toBeGreaterThan(1);
  });

  it('avviser tom input uten å krasje', () => {
    const r = validateReceipt('', { today: TODAY });
    expect(r.valid).toBe(false);
    expect(r.lines).toEqual([]);
  });

  it('regner ut linjesummen', () => {
    expect(validateReceipt(GOOD, { today: TODAY }).lineSum).toBe(272.5);
  });
});

describe('blendPrice', () => {
  it('bruker ny pris når det ikke finnes en gammel', () => {
    expect(blendPrice(null, 30)).toBe(30);
  });
  it('vekter 75/25 mot den gamle', () => {
    expect(blendPrice(20, 40)).toBe(25);
  });
  it('flytter snittet lite ved ett avvik', () => {
    expect(blendPrice(100, 200)).toBe(125);
  });
});
