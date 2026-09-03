import { describe, it, expect } from 'vitest';
import { buildPriceIndex, optimizeBasket, DEFAULT_SETTINGS } from './basketOptimizer.js';
import { storePreference } from './purchaseStats.js';

const NAVN = { COOP_EXTRA: 'Coop Extra', MENY_NO: 'MENY', KIWI: 'KIWI' };
const navn = (c) => NAVN[c] ?? c;

// Lista: kjøttdeig 600 g (2 pakker à 400), gulost, melk, brød
const liste = [
  { id: 'a', name: 'Kjøttdeig', qty: 600, unit: 'g', pack_size: 400, store: 'Coop Extra', price: 59.9 },
  { id: 'b', name: 'Gulost',    qty: 1,   unit: 'stk', pack_size: null, store: 'Coop Extra', price: 119 },
  { id: 'c', name: 'Melk',      qty: 3,   unit: 'liter', pack_size: 1, store: 'Coop Extra', price: 22.9 },
  { id: 'd', name: 'Brød',      qty: 1,   unit: 'stk', pack_size: null, store: 'Coop Extra', price: 32 },
  { id: 'e', name: 'Ved',       qty: 1,   unit: 'stk', pack_size: null, store: 'Coop Extra', price: null },
];
// MENY: kjøttdeig 49.9 (sparer 20), gulost 89 på tilbud (sparer 30); melk dyrere
const snapshot = [
  { item_name: 'Kjøttdeig', store_code: 'MENY_NO', unit_price: 49.9, observed_at: '2026-09-01T10:00:00Z', source: 'receipt', n: 3 },
  { item_name: 'Melk',      store_code: 'MENY_NO', unit_price: 24.9, observed_at: '2026-09-01T10:00:00Z', source: 'receipt', n: 2 },
  { item_name: 'Brød',      store_code: 'KIWI',    unit_price: 29,   observed_at: '2026-09-01T10:00:00Z', source: 'receipt', n: 1 },
];
const tilbud = [
  { match_name: 'Gulost', store_code: 'MENY_NO', price: 89, valid_from: '2026-01-01', valid_to: '2099-12-31' },
  { match_name: 'Gulost', store_code: 'KIWI',    price: 79, valid_from: '2000-01-01', valid_to: '2000-01-07' }, // utløpt
];
const kode = (n) => ({ 'Coop Extra': 'COOP_EXTRA', MENY: 'MENY_NO', KIWI: 'KIWI' }[n] ?? n);

describe('buildPriceIndex (§23)', () => {
  it('tilbud som gjelder slår observasjon, og utløpte tilbud ignoreres', () => {
    const idx = buildPriceIndex({ snapshot, offers: tilbud, items: liste, storeCode: kode });
    expect(idx.get('gulost').get('MENY_NO').price).toBe(89);
    expect(idx.get('gulost').get('MENY_NO').isOffer).toBe(true);
    expect(idx.get('gulost').has('KIWI')).toBe(false);
    expect(idx.get('kjøttdeig').get('COOP_EXTRA').price).toBe(59.9);   // fra lista
    expect(idx.get('kjøttdeig').get('MENY_NO').price).toBe(49.9);      // fra snapshot
  });

  it('tåler rare data', () => {
    for (const v of [null, undefined, {}, { snapshot: [null], offers: [{}], items: [null] }]) {
      expect(() => buildPriceIndex(v)).not.toThrow();
    }
  });
});

describe('optimizeBasket (§13–14, §29)', () => {
  const idx = buildPriceIndex({ snapshot, offers: tilbud, items: liste, storeCode: kode });

  it('alternativ A er alt hjemme; B flytter det som lønner seg til den beste ekstrabutikken', () => {
    const r = optimizeBasket({ items: liste, priceIndex: idx, defaultStore: 'COOP_EXTRA', storeName: navn });
    const A = r.options.find((o) => o.id === 'A');
    const B = r.options.find((o) => o.id === 'B');
    // hjemme: 2×59.9 + 119 + 3×22.9 + 32 = 339.5 (ved uten pris er utenfor)
    expect(A.total).toBeCloseTo(339.5, 2);
    expect(r.unpriced).toBe(1);
    expect(B.stores[1].store).toBe('MENY_NO');
    expect(B.moves.map((m) => m.name).sort()).toEqual(['Gulost', 'Kjøttdeig']);
    // sparer 20 (kjøttdeig, 2 pakker × 10) + 30 (gulost) = 50; melk er dyrere på MENY og blir hjemme
    expect(B.saving).toBeCloseTo(50, 2);
  });

  it('respekterer friksjonen: 50 kr er under standardkravet på 60 → anbefaler alt hjemme, og sier hvorfor', () => {
    const r = optimizeBasket({ items: liste, priceIndex: idx, defaultStore: 'COOP_EXTRA', storeName: navn });
    expect(r.recommended.id).toBe('A');
    expect(r.moves).toEqual([]);
    expect(r.message).toMatch(/^Handle alt på Coop Extra\./);
    expect(r.message).toMatch(/MENY er ca\. kr 50 billigere på 2 varer/);
    expect(r.message).toMatch(/ikke nok/);
  });

  it('med lavere krav anbefales splitten, og setningen kan leses opp høyt', () => {
    const r = optimizeBasket({
      items: liste, priceIndex: idx, defaultStore: 'COOP_EXTRA', storeName: navn,
      settings: { min_saving_extra_store: 40, min_saving_pct: 5 },
    });
    expect(r.recommended.id).toBe('B');
    expect(r.moves).toHaveLength(2);
    expect(r.message).toBe('Handle hovedhandelen på Coop Extra. Kjøp disse 2 på MENY: Gulost, Kjøttdeig. Estimert besparelse: kr 50.');
    expect(r.moves.find((m) => m.name === 'Gulost').reason).toBe('tilbud');
    expect(r.moves.find((m) => m.name === 'Kjøttdeig').reason).toBe('billigere');
  });

  it('bekvemmelighetsvekt skjerper kravet', () => {
    const r = optimizeBasket({
      items: liste, priceIndex: idx, defaultStore: 'COOP_EXTRA', storeName: navn,
      settings: { min_saving_extra_store: 40, convenience_weight: 2 },   // 40 × 2 = 80 > 50
    });
    expect(r.recommended.id).toBe('A');
  });

  it('en tredje butikk foreslås aldri når max_extra_stores er 1', () => {
    const r = optimizeBasket({ items: liste, priceIndex: idx, defaultStore: 'COOP_EXTRA', settings: { min_saving_extra_store: 1, min_saving_pct: 0 } });
    expect(r.options.find((o) => o.id === 'C')).toBeUndefined();
    const r2 = optimizeBasket({ items: liste, priceIndex: idx, defaultStore: 'COOP_EXTRA', settings: { min_saving_extra_store: 1, min_saving_pct: 0, max_extra_stores: 2 } });
    const C = r2.options.find((o) => o.id === 'C');
    expect(C?.stores.map((s) => s.store)).toEqual(['COOP_EXTRA', 'MENY_NO', 'KIWI']);
    // B består alt friksjonen — den med FÆRREST butikker anbefales
    expect(r2.recommended.id).toBe('B');
  });

  it('vane trekker en vare med selv om den ikke er billigere (§6)', () => {
    const kjøp = [
      { item_name: 'Melk', chain_code: 'MENY_NO', purchased_at: '2026-08-01T12:00:00Z', purchase_reason: 'normal' },
      { item_name: 'Melk', chain_code: 'MENY_NO', purchased_at: '2026-08-08T12:00:00Z', purchase_reason: 'normal' },
      { item_name: 'Melk', chain_code: 'MENY_NO', purchased_at: '2026-08-15T12:00:00Z', purchase_reason: 'normal' },
    ];
    const idx2 = buildPriceIndex({
      snapshot: [{ item_name: 'Melk', store_code: 'MENY_NO', unit_price: 22.9, observed_at: '2026-09-01T10:00:00Z' }],
      items: liste, storeCode: kode,
    });
    const r = optimizeBasket({
      items: liste, priceIndex: idx2, defaultStore: 'COOP_EXTRA', storePref: storePreference(kjøp),
      settings: { min_saving_extra_store: 0, min_saving_pct: 0 },
    });
    const melk = r.options.find((o) => o.id === 'B')?.moves.find((m) => m.name === 'Melk');
    expect(melk?.reason).toBe('vane');
    expect(melk?.saving).toBe(0);
  });

  it('uten hjemmebutikk eller uten varer: tomt, ikke kast', () => {
    expect(optimizeBasket({ items: [], defaultStore: 'COOP_EXTRA' }).options).toEqual([]);
    expect(optimizeBasket({ items: liste, priceIndex: idx }).recommended).toBe(null);
    for (const v of [null, undefined, {}, { items: [null, {}], defaultStore: 42 }]) {
      expect(() => optimizeBasket(v)).not.toThrow();
    }
  });

  it('standardinnstillingene er de spesifikasjonen nevner', () => {
    expect(DEFAULT_SETTINGS.max_extra_stores).toBe(1);
    expect(DEFAULT_SETTINGS.min_saving_extra_store).toBe(60);
  });
});
