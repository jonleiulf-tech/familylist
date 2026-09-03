import { describe, it, expect } from 'vitest';
import {
  quote, pickPrice, createOfferProvider, createManualProvider, bestCurrentPrice, SOURCE_RANK,
  storeCodeFrom,
} from './provider.js';

const dag = (n) => new Date(Date.now() - n * 864e5).toISOString();

describe('quote — én form for alle kilder', () => {
  it('tåler rader fra price_observations, offers og shopping_items', () => {
    expect(quote({ price: 22.9, unit_price: 22.9, store_code: 'COOP_EXTRA', source: 'receipt', confidence: 1 }).price).toBe(22.9);
    expect(quote({ price: '19,90', source: 'weekly_offer' }).price).toBeCloseTo(19.9);
    expect(quote({ price: 0 })).toBe(null);
    expect(quote({ price: null })).toBe(null);
    expect(quote({})).toBe(null);
    for (const v of [null, undefined, 42, 'x', [], {}]) expect(() => quote(v)).not.toThrow();
  });
});

describe('pickPrice — kildeprioritet for et NÅVÆRENDE anslag (§23)', () => {
  it('ferskt Kassalapp-oppslag slår egen kvittering', () => {
    const p = pickPrice([
      { price: 99.9, source: 'receipt', observed_at: dag(2), store_code: 'COOP_EXTRA' },
      { price: 109.9, source: 'kassalapp', observed_at: dag(0), store_code: 'COOP_EXTRA' },
    ]);
    expect(p.source).toBe('kassalapp');
    expect(p.price).toBe(109.9);
  });

  it('tilbud som gjelder slår kvittering, men ikke API', () => {
    expect(SOURCE_RANK.weekly_offer).toBeLessThan(SOURCE_RANK.receipt);
    expect(SOURCE_RANK.kassalapp).toBeLessThan(SOURCE_RANK.weekly_offer);
  });

  it('samme butikk vinner over samme kilde fra en annen butikk', () => {
    const p = pickPrice([
      { price: 24.9, source: 'receipt', observed_at: dag(1), store_code: 'MENY_NO' },
      { price: 22.9, source: 'receipt', observed_at: dag(5), store_code: 'COOP_EXTRA' },
    ], { storeCode: 'COOP_EXTRA' });
    expect(p.price).toBe(22.9);
  });

  it('innenfor samme rang vinner den nyeste', () => {
    const p = pickPrice([
      { price: 20, source: 'receipt', observed_at: dag(30) },
      { price: 23, source: 'receipt', observed_at: dag(3) },
    ]);
    expect(p.price).toBe(23);
  });

  it('gamle observasjoner er ikke «nåværende» og faller til neste kilde', () => {
    const p = pickPrice([
      { price: 200, source: 'kassalapp', observed_at: dag(400) },
      { price: 22, source: 'receipt', observed_at: dag(10) },
    ], { maxAgeDays: 120 });
    expect(p.price).toBe(22);
  });

  it('uten kandidater: null, ikke kast', () => {
    expect(pickPrice([])).toBe(null);
    expect(pickPrice(null)).toBe(null);
    expect(pickPrice([{ price: null }, {}])).toBe(null);
  });
});

describe('leverandørene uten nett', () => {
  const tilbud = [
    { id: 'o1', match_name: 'Gulost', product_name: 'Norvegia 1 kg', price: 89, store_code: 'MENY_NO', valid_from: dag(1).slice(0, 10), valid_to: dag(-5).slice(0, 10) },
    { id: 'o2', match_name: 'Gulost', product_name: 'Norvegia 1 kg', price: 79, store_code: 'KIWI', valid_from: dag(20).slice(0, 10), valid_to: dag(10).slice(0, 10) }, // utløpt
  ];

  it('tilbudsleverandøren ser bare tilbud som gjelder nå', async () => {
    const p = createOfferProvider(tilbud);
    const q = await p.getCurrentPrice('gulost');
    expect(q.price).toBe(89);
    expect(q.isOffer).toBe(true);
    expect(await p.getCurrentPrice('finnes ikke')).toBe(null);
  });

  it('manuell leverandør bruker bare det brukeren selv har satt', async () => {
    const p = createManualProvider([
      { name: 'Ved', price: 120, price_source: 'manual', store: 'Byggmakker' },
      { name: 'Melk', price: 22, price_source: 'catalog' },
    ]);
    expect((await p.getCurrentPrice('ved')).price).toBe(120);
    expect(await p.getCurrentPrice('melk')).toBe(null);
  });

  it('bestCurrentPrice spør alle og tåler at én feiler', async () => {
    const feiler = { getCurrentPrice: async () => { throw new Error('nett borte'); } };
    const q = await bestCurrentPrice([feiler, createOfferProvider(tilbud)], 'Gulost');
    expect(q.price).toBe(89);
  });

  it('stygge data kaster ikke', async () => {
    for (const v of [null, undefined, 42, 'x', {}, [null], [{}]]) {
      expect(() => createOfferProvider(v)).not.toThrow();
      expect(() => createManualProvider(v)).not.toThrow();
      expect(await createOfferProvider(v).getCurrentPrice(null)).toBe(null);
    }
  });
});

describe('storeCodeFrom — kjedekode fra det Kassalapp-funksjonen sender', () => {
  it('kjenner koder, slår opp navn og lar ukjente koder passere', () => {
    expect(storeCodeFrom('MENY_NO')).toBe('MENY_NO');
    expect(storeCodeFrom('Meny')).toBe('MENY_NO');
    expect(storeCodeFrom('MENY')).toBe('MENY_NO');
    expect(storeCodeFrom('KIWI')).toBe('KIWI');
    expect(storeCodeFrom('Coop Extra')).toBe('COOP_EXTRA');
    expect(storeCodeFrom('COOP_MEGA')).toBe('COOP_MEGA');
    expect(storeCodeFrom('Nærbutikken på hjørnet')).toBe(null);
    expect(storeCodeFrom(null)).toBe(null);
    expect(storeCodeFrom(42)).toBe(null);
  });
});
