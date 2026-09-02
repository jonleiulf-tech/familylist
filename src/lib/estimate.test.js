import { describe, it, expect } from 'vitest';
import { purchases, estimateCost, estimatedTotal, stepQty, qtyDetail } from './format.js';

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

describe('stepQty — snapper til hele trinn', () => {
  it('halve tall fra skalering kan rettes til hele: 3,5 stk → 4', () => {
    expect(stepQty(3.5, 1)).toBe(4);        // ikke 4,5
    expect(stepQty(3.5, -1)).toBe(3);       // ikke 2,5
  });

  it('hele tall oppfører seg som før', () => {
    expect(stepQty(4, 1)).toBe(5);
    expect(stepQty(4, -1)).toBe(3);
    expect(stepQty(1, -1)).toBe(0);         // kalleren fjerner varen
  });

  it('pakkevarer snapper til hele pakker', () => {
    expect(stepQty(530, 1, 400)).toBe(800);   // 1,3 pakker → 2 pakker
    expect(stepQty(530, -1, 400)).toBe(400);  // → 1 pakke
    expect(stepQty(400, 1, 400)).toBe(800);
    expect(stepQty(400, -1, 400)).toBe(0);
  });

  it('kvarte mål løftes til 1, og går aldri under 0', () => {
    expect(stepQty(0.25, 1)).toBe(1);
    expect(stepQty(0.25, -1)).toBe(0);
    expect(stepQty(0, -1)).toBe(0);
  });
});

describe('telte biter: pakken har flere i seg', () => {
  it('«8 pølser» er én pakke, ikke åtte kjøp', () => {
    expect(purchases(8, 'stk', 8)).toBe(1);
    expect(purchases(12, 'stk', 8)).toBe(2);
    expect(purchases(2, 'stk', 8)).toBe(1);
  });

  it('uten kjent pakke telles hver bit som et kjøp', () => {
    expect(purchases(8, 'stk', null)).toBe(8);
    expect(purchases(3, 'stk', undefined)).toBe(3);
  });

  it('forklaringsteksten sier hva antakelsen er', () => {
    expect(qtyDetail(8, 'stk', 8)).toBe('kjøpes som 1 pakke à ca. 8 stk');
    expect(qtyDetail(12, 'stk', 8)).toBe('kjøpes som 2 pakker à ca. 8 stk');
    expect(qtyDetail(3, 'stk', null)).toBe(null);
  });

  it('prisanslaget for pølser med lompe er én pakke pølser', () => {
    // Pakkeprisen er kr 72,20. Åtte pølser skal koste én pakke, ikke åtte.
    const row = { qty: 8, unit: 'stk', pack_size: 8, price: 72.2 };
    expect(estimateCost(row)).toBeCloseTo(72.2, 2);
  });
});
