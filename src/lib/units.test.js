import { describe, it, expect } from 'vitest';
import { normalizeUnit, unitFamily, convertQty, tidyUnit, parseQty, UNIT_OPTIONS } from './units.js';

describe('normalizeUnit', () => {
  it('samler skrivemåtene som betyr det samme', () => {
    expect(normalizeUnit('l')).toBe('liter');
    expect(normalizeUnit('Liter')).toBe('liter');
    expect(normalizeUnit('hekto')).toBe('hg');
    expect(normalizeUnit('gram')).toBe('g');
    expect(normalizeUnit('Kilo')).toBe('kg');
    expect(normalizeUnit('pk')).toBe('pakke');
    expect(normalizeUnit('stk.')).toBe('stk');
  });

  it('gir null for tomt og ukjent', () => {
    expect(normalizeUnit(null)).toBe(null);
    expect(normalizeUnit('')).toBe(null);
    expect(normalizeUnit('klask')).toBe(null);
  });
});

describe('unitFamily', () => {
  it('skiller vekt, volum og de som ikke kan regnes om', () => {
    expect(unitFamily('kg')).toBe('vekt');
    expect(unitFamily('dl')).toBe('volum');
    expect(unitFamily('ss')).toBe('volum');
    expect(unitFamily('stk')).toBe(null);
    expect(unitFamily('pakke')).toBe(null);
  });
});

describe('convertQty', () => {
  it('regner om innenfor volum', () => {
    expect(convertQty(20, 'dl', 'liter')).toEqual({ qty: 2, converted: true });
    expect(convertQty(2, 'liter', 'dl')).toEqual({ qty: 20, converted: true });
    expect(convertQty(4, 'ss', 'dl')).toEqual({ qty: 0.6, converted: true });
    expect(convertQty(1, 'ts', 'ml')).toEqual({ qty: 5, converted: true });
  });

  it('regner om innenfor vekt', () => {
    expect(convertQty(500, 'g', 'kg')).toEqual({ qty: 0.5, converted: true });
    expect(convertQty(1.5, 'kg', 'g')).toEqual({ qty: 1500, converted: true });
    expect(convertQty(4, 'hg', 'g')).toEqual({ qty: 400, converted: true });
  });

  it('lar tallet stå når det ikke finnes en fasit', () => {
    // 20 dl mel er ikke 2 kg mel — tettheten er ukjent.
    expect(convertQty(20, 'dl', 'kg')).toEqual({ qty: 20, converted: false });
    expect(convertQty(3, 'stk', 'pakke')).toEqual({ qty: 3, converted: false });
    expect(convertQty(3, 'dl', 'dl')).toEqual({ qty: 3, converted: false });
    expect(convertQty(3, null, 'kg')).toEqual({ qty: 3, converted: false });
  });

  it('tar imot komma og tekst', () => {
    expect(convertQty('2,5', 'liter', 'dl')).toEqual({ qty: 25, converted: true });
    expect(convertQty('tull', 'liter', 'dl')).toEqual({ qty: null, converted: false });
  });
});

describe('tidyUnit', () => {
  it('velger enheten man ville sagt høyt', () => {
    expect(tidyUnit(2000, 'g')).toEqual({ qty: 2, unit: 'kg' });
    expect(tidyUnit(20, 'dl')).toEqual({ qty: 2, unit: 'liter' });
    expect(tidyUnit(0.5, 'dl')).toEqual({ qty: 50, unit: 'ml' });
    expect(tidyUnit(400, 'g')).toEqual({ qty: 4, unit: 'hg' });
  });

  it('rører ikke skjeer, stk eller ukjente enheter', () => {
    expect(tidyUnit(4, 'ss')).toEqual({ qty: 4, unit: 'ss' });
    expect(tidyUnit(3, 'stk')).toEqual({ qty: 3, unit: 'stk' });
    expect(tidyUnit(3, 'klask')).toEqual({ qty: 3, unit: null });
  });
});

describe('parseQty og valglisten', () => {
  it('tolker tall', () => {
    expect(parseQty('1,75')).toBe(1.75);
    expect(parseQty('')).toBe(null);
  });

  it('har bare kanoniske verdier i velgeren', () => {
    for (const o of UNIT_OPTIONS) expect(normalizeUnit(o.value)).toBe(o.value);
  });
});

describe('bunt og klase', () => {
  it('er egne enheter i velgeren', () => {
    expect(UNIT_OPTIONS.map((o) => o.value)).toContain('bunt');
    expect(UNIT_OPTIONS.map((o) => o.value)).toContain('klase');
  });

  it('tåler flertall', () => {
    expect(normalizeUnit('bunter')).toBe('bunt');
    expect(normalizeUnit('Klaser')).toBe('klase');
  });

  it('regnes ikke om til vekt eller volum', () => {
    expect(unitFamily('bunt')).toBe(null);
    expect(convertQty(2, 'bunt', 'kg')).toEqual({ qty: 2, converted: false });
  });
});
