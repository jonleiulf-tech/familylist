import { describe, it, expect } from 'vitest';
import { detectPriceDrop, productToOffer, rankDrops, DROP_THRESHOLD } from './priceDrop.js';

const NORVEGIA = { name: 'Norvegia', avg_price: 110, price_low: 95, price_high: 125 };

describe('detectPriceDrop', () => {
  it('kjenner igjen et tydelig prisfall', () => {
    const d = detectPriceDrop(89, NORVEGIA);
    expect(d.isOffer).toBe(true);
    expect(d.drop).toBeCloseTo(0.191, 2);
  });

  it('markerer som sterkt når prisen er under laveste registrerte', () => {
    const d = detectPriceDrop(89, NORVEGIA);       // 89 < 95
    expect(d.strength).toBe('strong');
    expect(d.belowLowest).toBe(true);
    expect(d.reason).toMatch(/noen gang/);
  });

  it('markerer som normal ved moderat fall over laveste', () => {
    const d = detectPriceDrop(96, NORVEGIA);       // 12,7 % under snitt, men over 95
    expect(d.strength).toBe('normal');
    expect(d.belowLowest).toBe(false);
    expect(d.reason).toMatch(/under deres snittpris/);
  });

  it('markerer som sterkt ved fall over 20 % selv uten laveste-treff', () => {
    const d = detectPriceDrop(80, { name: 'X', avg_price: 110 });
    expect(d.strength).toBe('strong');
  });

  it('avviser pris like under snittet', () => {
    expect(detectPriceDrop(105, NORVEGIA)).toBeNull();   // bare 4,5 %
  });

  it('avviser pris over snittet', () => {
    expect(detectPriceDrop(120, NORVEGIA)).toBeNull();
  });

  it('avviser når snittpris mangler', () => {
    expect(detectPriceDrop(50, { name: 'X' })).toBeNull();
    expect(detectPriceDrop(50, { name: 'X', avg_price: 0 })).toBeNull();
  });

  it('avviser ugyldig dagspris', () => {
    expect(detectPriceDrop(0, NORVEGIA)).toBeNull();
    expect(detectPriceDrop(-5, NORVEGIA)).toBeNull();
    expect(detectPriceDrop(NaN, NORVEGIA)).toBeNull();
  });

  it('treffer nøyaktig på terskelen', () => {
    const atThreshold = 110 * (1 - DROP_THRESHOLD);
    expect(detectPriceDrop(atThreshold, NORVEGIA)).not.toBeNull();
    expect(detectPriceDrop(atThreshold + 0.5, NORVEGIA)).toBeNull();
  });
});

describe('productToOffer', () => {
  const product = {
    name: 'Norvegia Original 1kg', brand: 'Tine', store: 'KIWI',
    current_price: 89, current_unit_price: 89, weight_unit: 'kg',
    url: 'https://kassal.app/produkter/111',
  };

  it('lager en tilbudsrad', () => {
    const o = productToOffer(product, NORVEGIA);
    expect(o).toMatchObject({
      product_name: 'Norvegia Original 1kg',
      match_name: 'Norvegia',
      price: 89,
      original_price: 110,
      store_name: 'KIWI',
      source_type: 'api',
      is_sample: false,
    });
  });

  it('bruker familiens snittpris som førpris', () => {
    expect(productToOffer(product, NORVEGIA).original_price).toBe(110);
  });

  it('merker kilden så det ikke forveksles med butikkens førpris', () => {
    expect(productToOffer(product, NORVEGIA).source).toMatch(/snittpris/);
  });

  it('setter gyldighet sju dager fram', () => {
    const o = productToOffer(product, NORVEGIA);
    const days = (new Date(o.valid_to) - new Date(o.valid_from)) / 86400000;
    expect(Math.round(days)).toBe(7);
  });

  it('returnerer null når prisen ikke er et tilbud', () => {
    expect(productToOffer({ ...product, current_price: 120 }, NORVEGIA)).toBeNull();
  });

  it('takler manglende enhetspris', () => {
    const o = productToOffer({ ...product, current_unit_price: 0 }, NORVEGIA);
    expect(o.unit_price).toBeNull();
  });
});

describe('rankDrops', () => {
  it('setter sterke tilbud først', () => {
    const out = rankDrops([
      { strength: 'normal', drop: 0.5 },
      { strength: 'strong', drop: 0.15 },
    ]);
    expect(out[0].strength).toBe('strong');
  });
  it('sorterer på fall innenfor samme styrke', () => {
    const out = rankDrops([
      { strength: 'normal', drop: 0.13 },
      { strength: 'normal', drop: 0.18 },
    ]);
    expect(out[0].drop).toBe(0.18);
  });
});
