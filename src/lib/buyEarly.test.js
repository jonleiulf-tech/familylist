import { describe, it, expect } from 'vitest';
import { buyEarlySuggestions } from './buyEarly.js';
import { itemStats, nextPurchase } from './purchaseStats.js';

const NÅ = Date.UTC(2026, 8, 3, 12);
const d = (n) => new Date(NÅ - n * 864e5).toISOString();
const iso = (n) => new Date(NÅ + n * 864e5).toISOString().slice(0, 10);

// Toalettpapir hver 14. dag, sist for 4 dager siden → neste om ca. 10 dager.
// Melk hver 7. dag, sist i går → neste om 6 dager.
const kjøp = [
  { item_name: 'Toalettpapir', purchased_at: d(4),  qty: 1, unit_price: 59.9 },
  { item_name: 'Toalettpapir', purchased_at: d(18), qty: 1, unit_price: 62.9 },
  { item_name: 'Toalettpapir', purchased_at: d(32), qty: 1, unit_price: 59.9 },
  { item_name: 'Toalettpapir', purchased_at: d(46), qty: 1, unit_price: 61.9 },
  { item_name: 'Melk', purchased_at: d(1),  qty: 3, unit_price: 22.9 },
  { item_name: 'Melk', purchased_at: d(8),  qty: 3, unit_price: 22.9 },
  { item_name: 'Melk', purchased_at: d(15), qty: 3, unit_price: 22.9 },
  { item_name: 'Melk', purchased_at: d(22), qty: 3, unit_price: 22.9 },
  { item_name: 'Kaffe', purchased_at: d(2), qty: 1, unit_price: 89 },   // bare ett kjøp
];
const katalog = [
  { name: 'Toalettpapir', stock_up_suitability: 'high' },
  { name: 'Melk', stock_up_suitability: 'low' },
  { name: 'Kaffe', stock_up_suitability: 'high' },
];
const byItem = itemStats(kjøp, { now: NÅ });
const next = nextPurchase(byItem);

describe('buyEarlySuggestions (§17–18)', () => {
  it('foreslår å kjøpe nå når tilbudet går ut før neste kjøp, varen tåler lager og prisen er lavere enn vanlig', () => {
    const tilbud = [{ id: 1, match_name: 'Toalettpapir', price: 44.9, valid_to: iso(3), store_name: 'MENY' }];
    const r = buyEarlySuggestions({ offers: tilbud, byItem, next, catalog: katalog, now: NÅ });
    expect(r).toHaveLength(1);
    expect(r[0].qty).toBe(2);                     // high → dobbelt av vanlig 1
    expect(r[0].saving).toBeCloseTo((61.15 - 44.9) * 2, 1);
    expect(r[0].reason).toMatch(/^Dere kjøper toalettpapir ca\. hver 14\. dag/);
    expect(r[0].reason).toMatch(/tilbudet går ut 06\.09/);
    expect(r[0].reason).toMatch(/Kjøp 2 nå og spar ca\. kr 3[23]/);
    expect(r[0].reason).toMatch(/tåler å ligge/);
  });

  it('sier ingenting når dere rekker tilbudet uansett', () => {
    const tilbud = [{ id: 1, match_name: 'Toalettpapir', price: 44.9, valid_to: iso(12) }];
    expect(buyEarlySuggestions({ offers: tilbud, byItem, next, catalog: katalog, now: NÅ })).toEqual([]);
  });

  it('ferskvare kjøpes aldri på forskudd', () => {
    const tilbud = [{ id: 1, match_name: 'Melk', price: 15, valid_to: iso(2) }];
    expect(buyEarlySuggestions({ offers: tilbud, byItem, next, catalog: katalog, now: NÅ })).toEqual([]);
  });

  it('krever et mønster (minst tre kjøp) og en reell besparelse mot egen historikk', () => {
    const kaffe = [{ id: 1, match_name: 'Kaffe', price: 59, valid_to: iso(1) }];
    expect(buyEarlySuggestions({ offers: kaffe, byItem, next, catalog: katalog, now: NÅ })).toEqual([]);
    const dyrt = [{ id: 2, match_name: 'Toalettpapir', price: 60.5, valid_to: iso(3), original_price: 99 }];
    // «førpris» 99 spiller ingen rolle — 60,50 er ikke under det dere betaler
    expect(buyEarlySuggestions({ offers: dyrt, byItem, next, catalog: katalog, now: NÅ })).toEqual([]);
  });

  it('hopper over utløpte tilbud og varer som alt står på lista', () => {
    const tilbud = [{ id: 1, match_name: 'Toalettpapir', price: 44.9, valid_to: iso(-1) }];
    expect(buyEarlySuggestions({ offers: tilbud, byItem, next, catalog: katalog, now: NÅ })).toEqual([]);
    const gyldig = [{ id: 1, match_name: 'Toalettpapir', price: 44.9, valid_to: iso(3) }];
    expect(buyEarlySuggestions({ offers: gyldig, byItem, next, catalog: katalog, now: NÅ, existingNames: new Set(['toalettpapir']) })).toEqual([]);
  });

  it('tåler rare data', () => {
    for (const v of [null, undefined, {}, { offers: [null, {}], byItem: null, next: 'x', catalog: [null] }]) {
      expect(() => buyEarlySuggestions(v)).not.toThrow();
    }
  });
});
