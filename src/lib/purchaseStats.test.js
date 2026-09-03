import { describe, it, expect } from 'vitest';
import { itemStats, storePreference, preferredProduct, householdStats, preferenceText, OFFER_WEIGHT } from './purchaseStats.js';

const d = (n) => new Date(Date.UTC(2026, 8, 3, 12) - n * 864e5).toISOString();
const NÅ = Date.UTC(2026, 8, 3, 12);

const kjøp = [
  // Melk: kjøpt 4 dager (to linjer én av dagene), 6-7 dagers mellomrom
  { item_name: 'Melk', chain_code: 'COOP_EXTRA', purchased_at: d(0), qty: 3, unit: 'liter', unit_price: 22.9, price_paid: 22.9, purchase_reason: 'normal' },
  { item_name: 'Melk', chain_code: 'COOP_EXTRA', purchased_at: d(0), qty: 1, unit: 'liter', unit_price: 22.9, price_paid: 22.9, purchase_reason: 'normal' },
  { item_name: 'Melk', chain_code: 'COOP_EXTRA', purchased_at: d(7), qty: 3, unit: 'liter', unit_price: 22.5, price_paid: 22.5, purchase_reason: 'normal' },
  { item_name: 'Melk', chain_code: 'MENY_NO',    purchased_at: d(13), qty: 3, unit: 'liter', unit_price: 24.9, price_paid: 24.9, purchase_reason: 'normal' },
  { item_name: 'melk', chain_code: 'COOP_EXTRA', purchased_at: d(20), qty: 3, unit: 'liter', unit_price: 21.9, price_paid: 21.9, purchase_reason: 'normal' },
  // Norvegia: Coop fast, MENY bare på tilbud
  { item_name: 'Norvegia', chain_code: 'COOP_EXTRA', purchased_at: d(2),  unit_price: 119, price_paid: 119, purchase_reason: 'normal', product_id: 7 },
  { item_name: 'Norvegia', chain_code: 'COOP_EXTRA', purchased_at: d(23), unit_price: 116, price_paid: 116, purchase_reason: 'normal', product_id: 7 },
  { item_name: 'Norvegia', chain_code: 'MENY_NO',    purchased_at: d(44), unit_price: 89,  price_paid: 89,  purchase_reason: 'offer',  product_id: 8 },
  { item_name: 'Norvegia', chain_code: 'MENY_NO',    purchased_at: d(65), unit_price: 89,  price_paid: 89,  purchase_reason: 'offer',  product_id: 7 },
  // uten kjede
  { item_name: 'Ved', chain_code: null, purchased_at: d(1), qty: 1, price_paid: 120 },
];

describe('itemStats (§5)', () => {
  it('regner intervaller mellom DISTINKTE kjøpsdager', () => {
    const s = itemStats(kjøp, { now: NÅ }).get('melk');
    expect(s.purchase_count).toBe(4);       // 4 dager, ikke 5 linjer
    expect(s.line_count).toBe(5);
    expect(s.avg_days_between).toBeCloseTo((7 + 6 + 7) / 3, 1);
    expect(s.median_days_between).toBe(7);
    expect(s.days_since_last).toBe(0);
    expect(s.total_qty).toBe(13);
  });

  it('skiller snitt betalt fra nylig snitt', () => {
    const s = itemStats(kjøp, { now: NÅ, recentDays: 10 }).get('melk');
    expect(s.avg_paid).toBeCloseTo((22.9 * 2 + 22.5 + 24.9 + 21.9) / 5, 2);
    expect(s.recent_avg_paid).toBeCloseTo((22.9 * 2 + 22.5) / 3, 2);
    expect(s.lowest).toBe(21.9);
    expect(s.highest).toBe(24.9);
  });

  it('tåler rare rader', () => {
    for (const v of [null, undefined, [], [null], [{}], [{ item_name: null }], [{ item_name: 'X', purchased_at: 'ikke-dato', qty: 'mange' }]]) {
      expect(() => itemStats(v)).not.toThrow();
    }
    expect(itemStats([{ item_name: 'X', purchased_at: 'ikke-dato' }]).get('x').purchase_count).toBe(0);
  });
});

describe('storePreference (§6–7)', () => {
  it('finner fast butikk for melk', () => {
    const p = storePreference(kjøp).get('melk');
    expect(p.preferred_store).toBe('COOP_EXTRA');
    expect(p.stores[0].count).toBe(4);
    expect(p.stores[0].share).toBeCloseTo(0.8, 2);
  });

  it('et tilbudskjøp flytter ikke preferansen — men huskes som «villig når billigere»', () => {
    const p = storePreference(kjøp).get('norvegia');
    // 2 vanlige på Coop mot 2 tilbud på MENY: uten vekting ville det stått 50/50
    expect(p.preferred_store).toBe('COOP_EXTRA');
    const meny = p.stores.find((s) => s.chain_code === 'MENY_NO');
    expect(meny.offer_share).toBe(1);
    expect(meny.weighted_share).toBeCloseTo((2 * OFFER_WEIGHT) / (2 + 2 * OFFER_WEIGHT), 3);
    expect(p.willing_when_cheaper).toEqual(['MENY_NO']);
  });

  it('krever minst to kjøp og halve vekten for å kalle noe fast', () => {
    const p = storePreference([{ item_name: 'Egg', chain_code: 'KIWI', purchased_at: d(1) }]).get('egg');
    expect(p.preferred_store).toBe(null);
  });

  it('varer uten kjede gir ingen preferanse', () => {
    expect(storePreference(kjøp).has('ved')).toBe(false);
  });
});

describe('preferredProduct og samlefunksjonen', () => {
  it('velger produktet som er kjøpt flest ganger', () => {
    expect(preferredProduct(kjøp).get('norvegia')).toEqual({ product_id: 7, count: 3 });
    expect(preferredProduct(kjøp).has('melk')).toBe(false);
  });

  it('householdStats pakker alt', () => {
    const s = householdStats(kjøp, { now: NÅ });
    expect(s.rows).toBe(10);
    expect(s.byItem.size).toBe(3);
    expect(s.storePref.size).toBe(2);
  });

  it('preferenceText er norsk og tåler null', () => {
    const p = storePreference(kjøp).get('melk');
    expect(preferenceText(p, (c) => ({ COOP_EXTRA: 'Coop Extra' }[c] ?? c))).toBe('Dere kjøper vanligvis dette på Coop Extra (80 %)');
    expect(preferenceText(null)).toBe(null);
    expect(preferenceText({ preferred_store: null })).toBe(null);
  });
});
