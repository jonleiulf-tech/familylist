import { describe, it, expect } from 'vitest';
import {
  itemStats, storePreference, preferredProduct, householdStats, preferenceText, OFFER_WEIGHT,
  nextPurchase, dueItems, coOccurrence, companionsText, savingsSummary,
} from './purchaseStats.js';

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

describe('nextPurchase og dueItems (§19)', () => {
  const stats = itemStats(kjøp, { now: NÅ });

  it('melk hver 7. dag, kjøpt i dag: ikke tid ennå', () => {
    const n = nextPurchase(stats).get('melk');
    expect(n.median_days_between).toBe(7);
    expect(n.expected_in_days).toBe(7);
    expect(n.probability).toBeLessThan(0.1);
    expect(n.due).toBe(false);
  });

  it('sannsynligheten stiger jevnt mot og over intervallet', () => {
    const lag = (dager) => nextPurchase(new Map([['x', { name: 'X', purchase_count: 4, median_days_between: 10, days_since_last: dager }]])).get('x');
    expect(lag(5).probability).toBeLessThan(0.2);
    expect(lag(10).probability).toBe(0.5);
    expect(lag(13).probability).toBeGreaterThan(0.7);
    expect(lag(13).due).toBe(true);
    expect(lag(13).expected_in_days).toBe(-3);
  });

  it('en vare det er gått over tre intervaller for regnes som sluttet med', () => {
    const n = nextPurchase(new Map([['x', { name: 'X', purchase_count: 5, median_days_between: 7, days_since_last: 40 }]])).get('x');
    expect(n.lapsed).toBe(true);
    expect(n.due).toBe(false);
  });

  it('under tre kjøp finnes det ikke noe mønster', () => {
    expect(nextPurchase(stats).has('ved')).toBe(false);        // ett kjøp
    expect(nextPurchase(stats).has('norvegia')).toBe(true);    // fire kjøpsdager
    expect(nextPurchase(new Map([['y', { name: 'Y', purchase_count: 2, median_days_between: 7, days_since_last: 7 }]])).size).toBe(0);
    expect(nextPurchase(null).size).toBe(0);
  });

  it('dueItems: mest sannsynlig først, aldri det som alt står på lista', () => {
    const next = new Map([
      ['a', { name: 'A', probability: 0.9, lapsed: false }],
      ['b', { name: 'B', probability: 0.7, lapsed: false }],
      ['c', { name: 'C', probability: 0.95, lapsed: true }],
      ['d', { name: 'D', probability: 0.3, lapsed: false }],
    ]);
    expect(dueItems(next, new Set(['b'])).map((n) => n.name)).toEqual(['A']);
    expect(dueItems(next).map((n) => n.name)).toEqual(['A', 'B']);
    expect(dueItems(null)).toEqual([]);
  });
});

describe('coOccurrence (§21)', () => {
  const tur = (id, dag, ...navn) => navn.map((n) => ({ item_name: n, purchased_at: d(dag), receipt_upload_id: id, household_id: 'h' }));
  const kvitteringer = [
    ...tur('k1', 1, 'Kjøttdeig', 'Tacolefser', 'Rømme', 'Melk'),
    ...tur('k2', 8, 'Kjøttdeig', 'Tacolefser', 'Melk'),
    ...tur('k3', 15, 'Kjøttdeig', 'Tacolefser', 'Rømme'),
    ...tur('k4', 22, 'Kjøttdeig', 'Pasta'),
    ...tur('k5', 29, 'Melk', 'Brød'),
    ...tur('k6', 36, 'Melk', 'Brød'),
  ];

  it('finner det som pleier å følge med — og krever både antall og andel', () => {
    const t = coOccurrence(kvitteringer);
    const med = t.get('kjøttdeig');
    expect(med[0]).toEqual({ name: 'Tacolefser', count: 3, share: 0.75 });
    expect(med.find((c) => c.name === 'Rømme')).toBeUndefined();   // bare 2 av 4
    expect(med.find((c) => c.name === 'Melk')).toBeUndefined();    // 2 av 4
    // melk er med på 4 turer; kjøttdeig på 2 av dem → under 0,5
    expect(t.get('melk')?.find((c) => c.name === 'Kjøttdeig')).toBeUndefined();
  });

  it('uten kvitterings-id er samme dag én tur', () => {
    const rader = kvitteringer.map((r) => ({ ...r, receipt_upload_id: null }));
    expect(coOccurrence(rader).get('kjøttdeig')[0].name).toBe('Tacolefser');
  });

  it('companionsText er norsk og tåler tomt', () => {
    expect(companionsText([{ name: 'Tacolefser' }, { name: 'Rømme' }])).toBe('Pleier å følge med: Tacolefser, Rømme');
    expect(companionsText([])).toBe(null);
    expect(companionsText(null)).toBe(null);
    expect(() => coOccurrence([null, {}, { item_name: 'X' }])).not.toThrow();
  });
});

describe('savingsSummary (§24)', () => {
  const rader = [
    { purchased_at: d(2),  estimated_saving: 8,    saving_confidence: 0.9 },
    { purchased_at: d(5),  estimated_saving: 12.5, saving_confidence: 0.7 },
    { purchased_at: d(9),  estimated_saving: 0,    saving_confidence: 0.9 },   // dyrere enn vanlig: 0, ikke minus
    { purchased_at: d(12), estimated_saving: 30,   saving_confidence: 0.3 },   // for usikker
    { purchased_at: d(45), estimated_saving: 100,  saving_confidence: 0.9 },   // forrige måned
    { purchased_at: d(1),  estimated_saving: null, saving_confidence: null },
  ];

  it('summerer konservativt: bare sikre, positive linjer i perioden', () => {
    const s = savingsSummary(rader, { now: NÅ });
    expect(s.saving).toBe(21);          // 8 + 12,5 avrundet
    expect(s.count).toBe(2);
    expect(s.confidence).toBe(0.8);
    expect(s.text).toBe('Spart ca. kr 21 denne måneden på 2 kjøp');
  });

  it('sier «anslag» når sikkerheten er lav, og ingenting når det ikke er spart noe', () => {
    expect(savingsSummary(rader, { now: NÅ, minConfidence: 0.3 }).text).toMatch(/\(anslag\)$/);
    expect(savingsSummary([], { now: NÅ }).text).toBe(null);
    expect(savingsSummary(null).saving).toBe(0);
  });

  it('householdStats pakker fase 4 med', () => {
    const s = householdStats(kjøp, { now: NÅ });
    expect(s.next).toBeInstanceOf(Map);
    expect(s.together).toBeInstanceOf(Map);
    expect(s.savings.saving).toBe(0);
  });
});
