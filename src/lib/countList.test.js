import { describe, it, expect } from 'vitest';
import {
  countItem, ensureIds, needsIds, parseCountLine, groupItems, countTotals,
  bumpLocal, removeById, setQty, toCsv, csvName,
} from './countList.js';

describe('parseCountLine', () => {
  it('deler hovedvare og variant på / og :', () => {
    expect(parseCountLine('Sko / 39')).toEqual({ group: 'Sko', name: '39', qty: 0 });
    expect(parseCountLine('T-skjorte: M')).toEqual({ group: 'T-skjorte', name: 'M', qty: 0 });
  });
  it('leser antall bakerst', () => {
    expect(parseCountLine('Sko / 39 x10')).toEqual({ group: 'Sko', name: '39', qty: 10 });
    expect(parseCountLine('Kjegler ×24')).toEqual({ group: null, name: 'Kjegler', qty: 24 });
  });
  it('uten hovedvare blir g null', () => {
    expect(parseCountLine('Ball').group).toBeNull();
  });
});

describe('groupItems', () => {
  const items = [
    countItem('Sko', '39', 4), countItem('Sko', '40', 6),
    countItem(null, 'Ball', 12), countItem('Shorts', 'M', 3),
  ];
  it('grupperer med delsum i innsettingsrekkefølge', () => {
    const g = groupItems(items);
    expect(g.map((x) => x.group)).toEqual(['Sko', null, 'Shorts']);
    expect(g[0].sum).toBe(10);
    expect(g[0].rows).toHaveLength(2);
  });
});

describe('countTotals', () => {
  it('teller linjer og enheter', () => {
    expect(countTotals([{ qty: 10 }, { qty: 5 }, { qty: 0 }])).toEqual({ lines: 3, units: 15 });
  });
  it('tåler tom liste', () => {
    expect(countTotals(null)).toEqual({ lines: 0, units: 0 });
  });
});

describe('bumpLocal / setQty', () => {
  it('øker og senker, men aldri under 0 — 0 er et gyldig svar i en telling', () => {
    const items = [countItem('Sko', '39', 2)];
    const id = items[0].id;
    expect(bumpLocal(items, id, 10)[0].qty).toBe(12);
    expect(bumpLocal(items, id, -5)[0].qty).toBe(0);
  });
  it('rører ikke andre linjer', () => {
    const a = countItem('Sko', '39', 2);
    const b = countItem('Sko', '40', 7);
    expect(bumpLocal([a, b], a.id, 1)[1].qty).toBe(7);
  });
  it('setQty setter tallet direkte', () => {
    const items = [countItem(null, 'Ball', 3)];
    expect(setQty(items, items[0].id, 25)[0].qty).toBe(25);
    expect(setQty(items, items[0].id, -4)[0].qty).toBe(0);
  });
});

describe('ensureIds', () => {
  it('gir gamle linjer uten id en stabil id', () => {
    const legacy = [{ n: 'Ball', qty: 3 }, countItem(null, 'Sko', 1)];
    expect(needsIds(legacy)).toBe(true);
    const fixed = ensureIds(legacy);
    expect(fixed.every((i) => i.id)).toBe(true);
    expect(needsIds(fixed)).toBe(false);
    expect(fixed[1].id).toBe(legacy[1].id);   // beholder eksisterende
  });
});

describe('removeById', () => {
  it('fjerner bare den ene linjen', () => {
    const a = countItem('Sko', '39', 1);
    const b = countItem('Sko', '40', 1);
    expect(removeById([a, b], a.id).map((i) => i.n)).toEqual(['40']);
  });
});

describe('toCsv', () => {
  const list = {
    name: 'Utstyr 2026',
    items: [countItem('Sko', '39', 4), countItem('Sko', '40', 6), countItem(null, 'Ball', 12)],
  };
  it('semikolon, BOM og totalrad — åpner rett i norsk Excel', () => {
    const csv = toCsv(list);
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.replace('﻿', '').split('\r\n');
    expect(lines[0]).toBe('Hovedvare;Variant;Antall');
    expect(lines[1]).toBe('Sko;39;4');
    expect(lines[3]).toBe(';Ball;12');
    expect(lines.at(-1)).toBe(';Totalt;22');
  });
  it('escaper semikolon og hermetegn i navn', () => {
    const csv = toCsv({ items: [countItem('Sko; brukt', 'str "39"', 1)] });
    expect(csv).toContain('"Sko; brukt"');
    expect(csv).toContain('"str ""39"""');
  });
});

describe('csvName', () => {
  it('lager trygt filnavn med dato', () => {
    expect(csvName({ name: 'Utstyr på Hytta' }, new Date('2026-08-31T10:00:00Z')))
      .toBe('telling-utstyr-paa-hytta-2026-08-31.csv');
  });
});
