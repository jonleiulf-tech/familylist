import { describe, it, expect } from 'vitest';
import { purchases, estimateCost, estimatedTotal } from './format.js';

describe('purchases — mengde → antall innkjøp', () => {
  it('gram regnes i pakker (standard 400 g)', () => {
    expect(purchases(600, 'g')).toBe(2);
    expect(purchases(130, 'g')).toBe(1);      // 130 g ribbe = 1 pakke, ikke 130
    expect(purchases(800, 'g', 400)).toBe(2);
  });

  it('liter bruker flaske-/kartongstørrelse når den er kjent', () => {
    expect(purchases(1.75, 'liter', 1.75)).toBe(1);   // 1,75 l melk = 1 kartong
    expect(purchases(6, 'liter', 1.5)).toBe(4);       // 4×1,5 l brus = 4 flasker
    expect(purchases(2, 'liter')).toBe(2);            // ukjent størrelse: 2 liter = 2
    expect(purchases(1, 'l', 1)).toBe(1);
  });

  it('små mål er én innkjøpt enhet', () => {
    expect(purchases(6, 'dl')).toBe(1);       // 6 dl fløte = 1 kartong
    expect(purchases(2, 'fedd')).toBe(1);     // 2 fedd = 1 hvitløk
    expect(purchases(2, 'ss')).toBe(1);
  });

  it('stk rundes opp til hele — man kjøper ikke kvart sitron', () => {
    expect(purchases(0.25, 'stk')).toBe(1);
    expect(purchases(8, 'stk')).toBe(8);
    expect(purchases(3, 'pakke')).toBe(3);
  });

  it('liter rundes opp', () => {
    expect(purchases(1.5, 'liter')).toBe(2);
  });
});

describe('estimateCost — aldri pakkepris × gram', () => {
  it('130 g baby back ribs à 135 kr = 135 kr, ikke 17 550', () => {
    expect(estimateCost({ price: 135, qty: 130, unit: 'g' })).toBe(135);
  });

  it('600 g laks à 126,85 = 2 pakker', () => {
    expect(estimateCost({ price: 126.85, qty: 600, unit: 'g' })).toBeCloseTo(253.7);
  });

  it('estimatedTotal bruker samme omregning', () => {
    const { sum } = estimatedTotal([
      { price: 135, qty: 130, unit: 'g' },
      { price: 25, qty: 2, unit: 'liter' },
    ]);
    expect(sum).toBe(135 + 50);
  });
});

describe('estimateCost — vern mot dårlige prisdata («63 425 for en laks»)', () => {
  it('pakkestørrelse på 1 gram ignoreres — standard 400 g brukes', () => {
    // Jons skjermbilde: Laks 500 g à 126,85 viste kr 63 425 (126,85 × 500).
    expect(estimateCost({ price: 126.85, qty: 500, unit: 'g', pack_size: 1 })).toBeCloseTo(253.7);
  });

  it('ørepris fra import (31 712,50 for laks) gir skjult estimat, ikke kr 63 425', () => {
    expect(estimateCost({ price: 31712.5, qty: 500, unit: 'g' })).toBe(0);
  });

  it('vanlige dyre varer klippes ikke', () => {
    expect(estimateCost({ price: 899, qty: 1, unit: 'stk' })).toBe(899);
  });
});
