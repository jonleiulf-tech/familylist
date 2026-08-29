import { describe, it, expect } from 'vitest';
import {
  normalizeProductName, parseSize, unitPriceFor,
  matchToCatalog, hotspotToOffer, dedupeOffers,
} from './tjek.js';

const CATALOG = ['Norvegia', 'Gulost', 'Kjøttdeig', 'Melk', 'Brød', 'Tacolefser', 'Kaffe'];

describe('normalizeProductName', () => {
  it('senker og trimmer', () => {
    expect(normalizeProductName('  Norvegia Original  ')).toBe('norvegia original');
  });
  it('fjerner anførselstegn og parenteser', () => {
    expect(normalizeProductName('«Norvegia» (1kg)')).toBe('norvegia 1kg');
  });
  it('fjerner «pr. stk»', () => {
    expect(normalizeProductName('Agurk pr. stk')).toBe('agurk');
  });
  it('takler tom input', () => {
    expect(normalizeProductName(null)).toBe('');
  });
});

describe('parseSize', () => {
  it('leser enkel vekt', () => {
    expect(parseSize('500 g')).toEqual({ value: 500, unit: 'g' });
  });
  it('leser kilo', () => {
    expect(parseSize('Norvegia 1 kg')).toEqual({ value: 1, unit: 'kg' });
  });
  it('leser multipakning', () => {
    expect(parseSize('4 x 1,5 l')).toEqual({ value: 6, unit: 'l' });
  });
  it('leser komma som desimal', () => {
    expect(parseSize('1,5 l')).toEqual({ value: 1.5, unit: 'l' });
  });
  it('returnerer null uten størrelse', () => {
    expect(parseSize('Agurk')).toBeNull();
  });
});

describe('unitPriceFor', () => {
  it('regner kr/kg fra gram', () => {
    expect(unitPriceFor(39.9, { value: 400, unit: 'g' })).toEqual({ value: 99.75, unit: 'kg' });
  });
  it('regner kr/kg fra kilo', () => {
    expect(unitPriceFor(89, { value: 1, unit: 'kg' })).toEqual({ value: 89, unit: 'kg' });
  });
  it('regner kr/l fra multipakning', () => {
    expect(unitPriceFor(115, { value: 6, unit: 'l' })).toEqual({ value: 19.17, unit: 'l' });
  });
  it('returnerer null uten størrelse', () => {
    expect(unitPriceFor(50, null)).toBeNull();
  });
  it('returnerer null ved ugyldig pris', () => {
    expect(unitPriceFor(NaN, { value: 1, unit: 'kg' })).toBeNull();
  });
});

describe('matchToCatalog', () => {
  it('matcher eksakt', () => {
    expect(matchToCatalog('Norvegia', CATALOG)).toBe('Norvegia');
  });
  it('matcher merkenavn inne i tilbudsnavnet', () => {
    expect(matchToCatalog('Norvegia Original 1kg', CATALOG)).toBe('Norvegia');
  });
  it('matcher delstreng', () => {
    expect(matchToCatalog('Revet gulost 200g', CATALOG)).toBe('Gulost');
  });
  it('returnerer null uten treff', () => {
    expect(matchToCatalog('Sykkelpumpe', CATALOG)).toBeNull();
  });
  it('unngår treff på svært korte navn', () => {
    expect(matchToCatalog('Stor pose med noe', ['Os'])).toBeNull();
  });
});

describe('hotspotToOffer', () => {
  const base = { dealerId: 'b3e8Fm', catalogNames: CATALOG, validFrom: '2026-09-01', validTo: '2026-09-07' };

  it('gjør et hotspot om til en tilbudsrad', () => {
    const o = hotspotToOffer({
      offer: { heading: 'Norvegia Original 1 kg', pricing: { price: 89, pre_price: 119.9 } },
    }, base);
    expect(o).toMatchObject({
      store_code: 'JOKER',
      store_name: 'Joker',
      product_name: 'Norvegia Original 1 kg',
      match_name: 'Norvegia',
      price: 89,
      original_price: 119.9,
      source_type: 'api',
      is_sample: false,
    });
    expect(o.unit_price).toBe(89);
    expect(o.unit).toBe('kg');
  });

  it('setter førpris til null når den ikke er høyere enn prisen', () => {
    const o = hotspotToOffer({ offer: { heading: 'Melk 1l', pricing: { price: 25, pre_price: 25 } } }, base);
    expect(o.original_price).toBeNull();
  });

  it('takler hotspot uten offer-innpakning', () => {
    const o = hotspotToOffer({ heading: 'Brød 750g', price: 34.9 }, base);
    expect(o.product_name).toBe('Brød 750g');
    expect(o.match_name).toBe('Brød');
  });

  it('forkaster hotspot uten pris', () => {
    expect(hotspotToOffer({ offer: { heading: 'Noe' } }, base)).toBeNull();
  });
  it('forkaster hotspot uten navn', () => {
    expect(hotspotToOffer({ offer: { pricing: { price: 10 } } }, base)).toBeNull();
  });
  it('forkaster negativ pris', () => {
    expect(hotspotToOffer({ offer: { heading: 'X', pricing: { price: -5 } } }, base)).toBeNull();
  });

  it('bærer med seg gyldighetsperioden', () => {
    const o = hotspotToOffer({ offer: { heading: 'Melk', pricing: { price: 25 } } }, base);
    expect(o.valid_from).toBe('2026-09-01');
    expect(o.valid_to).toBe('2026-09-07');
  });
});

describe('dedupeOffers', () => {
  it('beholder den billigste av like varer', () => {
    const out = dedupeOffers([
      { store_code: 'JOKER', normalized_name: 'melk 1l', price: 25 },
      { store_code: 'JOKER', normalized_name: 'melk 1l', price: 22 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].price).toBe(22);
  });
  it('beholder samme vare i ulike butikker', () => {
    const out = dedupeOffers([
      { store_code: 'JOKER', normalized_name: 'melk 1l', price: 25 },
      { store_code: 'KIWI', normalized_name: 'melk 1l', price: 24 },
    ]);
    expect(out).toHaveLength(2);
  });
});
