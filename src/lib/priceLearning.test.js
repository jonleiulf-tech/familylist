import { describe, it, expect } from 'vitest';
import {
  median, ordinaryUnitPrice, learnedPrice, usualQty, recentObservations, MAX_SHIFT,
  nextHabit, habitQty,
} from './priceLearning.js';

const iso = (daysAgo) => new Date(Date.now() - daysAgo * 864e5).toISOString();
const obs = (unit_price, extra = {}) => ({ unit_price, observed_at: iso(1), ...extra });

/**
 * Observasjoner fra ULIKE dager.
 *
 * Læringen krever nå to forskjellige datoer, ikke bare to rader: to linjer
 * på samme kvittering er ikke to uavhengige observasjoner, og en dobbelt
 * opplastet kvittering er det slett ikke — likevel var det nok til å flytte
 * prisen. Testene under bruker derfor denne, ikke obs() to ganger.
 */
const days = (...prices) => prices.map((p, i) => obs(p, { observed_at: iso(i + 1) }));

describe('median', () => {
  it('midtverdien, ikke snittet', () => {
    expect(median([1, 2, 3])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    // Én feillest linje skal ikke rikke medianen.
    expect(median([22, 23, 22.33, 1290])).toBe(22.665);
  });
  it('tåler søppel', () => {
    expect(median([])).toBe(null);
    expect(median(['a', null, 0, -5])).toBe(null);
  });
});

describe('ordinaryUnitPrice', () => {
  it('ordinær pris slår tilbudspris', () => {
    // Agurken kostet 16,74 — men det var 40 % avslag, ordinært 27,90.
    expect(ordinaryUnitPrice({ unit_price: 16.74, regular_unit_price: 27.9 })).toBe(27.9);
  });
  it('faller tilbake til betalt pris når rabatt ikke er oppgitt', () => {
    expect(ordinaryUnitPrice({ unit_price: 22.33 })).toBe(22.33);
    expect(ordinaryUnitPrice({ price: 40 })).toBe(40);
    expect(ordinaryUnitPrice({})).toBe(null);
  });
});

describe('learnedPrice', () => {
  it('retter en pris som er 2,6× for høy — men bare til taket', () => {
    // Havredrikk: basen sier 58, kvitteringene sier 22,33.
    const res = learnedPrice(days(22.33, 22.33, 21.9), 58);
    expect(res.capped).toBe(true);
    expect(res.price).toBe(Number((58 * (1 - MAX_SHIFT)).toFixed(2)));   // 37.70
    expect(res.n).toBe(3);
  });

  it('kommer helt fram etter noen runder', () => {
    let price = 58;
    for (let i = 0; i < 6; i += 1) {
      price = learnedPrice(days(22.33, 22.33), price).price;
    }
    expect(price).toBeCloseTo(22.33, 1);
  });

  it('flytter ikke en etablert pris på én enkelt observasjon', () => {
    expect(learnedPrice([obs(9.9)], 55)).toBe(null);
  });

  it('men én observasjon er bedre enn ingen pris', () => {
    expect(learnedPrice([obs(29.9)], null).price).toBe(29.9);
  });

  it('ignorerer gamle observasjoner', () => {
    expect(learnedPrice([obs(22, { observed_at: iso(400) })], null)).toBe(null);
  });

  it('en feillest linje endrer ingenting', () => {
    // OCR leser 129 som 1290: medianen av tre riktige og én gal er riktig.
    const res = learnedPrice(days(129, 129, 1290, 125), 129);
    expect(res.price).toBeCloseTo(129, 0);
  });

  it('gir null når det ikke finnes noe å lære av', () => {
    expect(learnedPrice([], 30)).toBe(null);
    expect(learnedPrice(null, null)).toBe(null);
  });

  it('to linjer på SAMME kvittering flytter ingen etablert pris', () => {
    // Den samme varen to ganger på én kvittering — eller den samme
    // kvitteringen lastet opp to ganger — er én observasjon, ikke to.
    expect(learnedPrice([obs(22.33), obs(22.33)], 58)).toBe(null);
  });

  it('blander ikke kroner per kilo med kroner per stykk', () => {
    // Eplene ble kjøpt på vekt én gang og i antall en annen. Snittet av
    // 24,90 kr/kg og 19,90 kr/stk er 22,40 — en pris per ingenting, og
    // den ble skrevet til varedatabasen og ganget opp med pakker.
    const res = learnedPrice([
      obs(24.9, { unit: 'kg', observed_at: iso(1) }),
      obs(24.5, { unit: 'kg', observed_at: iso(9) }),
      obs(19.9, { unit: 'stk', observed_at: iso(3) }),
    ], null);
    expect(res.unit).toBe('kg');
    expect(res.n).toBe(2);
    expect(res.price).toBe(24.7);
  });

  it('«l» og «liter» er samme enhet', () => {
    const res = learnedPrice([
      obs(22.33, { unit: 'l', observed_at: iso(1) }),
      obs(22.33, { unit: 'liter', observed_at: iso(4) }),
    ], null);
    expect(res.unit).toBe('liter');
    expect(res.n).toBe(2);
  });

  it('en seedpris rettes i ett hopp — den er en gjetning, ikke noe vi har lært', () => {
    // 58 mot 22,33 brukte fire netter med taket på. En importert pris har
    // ingen læring bak seg og skal kunne byttes ut med én gang.
    const res = learnedPrice(days(22.33, 22.33), 58, { seeded: true });
    expect(res.price).toBe(22.33);
    expect(res.capped).toBe(false);
  });

  it('prisspennet tåler én lesefeil', () => {
    // Min og maks lot én rad på 1 290 stå som «høyeste pris» for alltid,
    // og skjermen viste «kr 22–kr 1290».
    const res = learnedPrice(days(22, 22.5, 23, 22.8, 1290), null);
    expect(res.high).toBeLessThan(200);
  });
});

describe('usualQty', () => {
  it('lærer at vi kjøper to av alt', () => {
    // Piloten: 93 artikler mot 46 linjer.
    expect(usualQty([obs(20, { qty: 2, unit: 'stk' }), obs(20, { qty: 2, unit: 'stk' })]))
      .toEqual({ qty: 2, unit: 'stk', n: 2 });
  });

  it('én tur er nok til å begynne med — det er vår egen vane', () => {
    expect(usualQty([obs(22.33, { qty: 3, unit: 'stk' })])).toMatchObject({ qty: 3, n: 1 });
  });

  it('runder til hele for stykkvarer', () => {
    expect(usualQty([
      obs(20, { qty: 2, unit: 'stk' }), obs(20, { qty: 3, unit: 'stk' }),
      obs(20, { qty: 3, unit: 'stk' }),
    ]).qty).toBe(3);
  });

  it('vektvarer teller ikke som vane i antall', () => {
    // «876 g epler» sier mer om posen enn om hvor mye vi kjøper.
    const res = usualQty([
      obs(39.9, { qty: 0.876, unit: 'g' }), obs(39.9, { qty: 2, unit: 'stk' }),
      obs(39.9, { qty: 2, unit: 'stk' }),
    ]);
    expect(res).toEqual({ qty: 2, unit: 'stk', n: 2 });
  });

  it('gir null uten mengdeopplysninger', () => {
    expect(usualQty([obs(20)])).toBe(null);
    expect(usualQty([])).toBe(null);
  });
});

describe('recentObservations', () => {
  it('nyeste først, gamle bort', () => {
    const rows = recentObservations([
      { observed_at: iso(10) }, { observed_at: iso(1) }, { observed_at: iso(500) },
    ]);
    expect(rows).toHaveLength(2);
    expect(new Date(rows[0].observed_at) > new Date(rows[1].observed_at)).toBe(true);
  });
});

describe('nextHabit', () => {
  it('første kjøp er vanen', () => {
    expect(nextHabit(null, { qty: 3, unit: 'stk' }))
      .toEqual({ usual_qty: 3, unit: 'stk', times_bought: 1 });
  });

  it('glir mot det vi faktisk gjør, uten at én tur avgjør', () => {
    // Vanen er 1, men vi kjøpte 5. Den skal bevege seg, ikke hoppe.
    const h = nextHabit({ usual_qty: 1, unit: 'stk', times_bought: 4 }, { qty: 5, unit: 'stk' });
    expect(h.usual_qty).toBe(2.2);
    expect(h.times_bought).toBe(5);
    expect(habitQty(h)).toBe(2);
  });

  it('finner fram etter noen turer — tallet lagres urundet', () => {
    // Runder man av i hvert steg, låser vanen seg på 2 for alltid:
    // 2·0,7 + 3·0,3 = 2,3 → 2 → 2,3 → 2 …
    let h = { usual_qty: 1, unit: 'stk', times_bought: 1 };
    for (let i = 0; i < 6; i += 1) h = nextHabit(h, { qty: 3, unit: 'stk' });
    expect(h.usual_qty).toBeGreaterThan(2.7);
    expect(habitQty(h)).toBe(3);
  });

  it('vektvarer beholder desimalene', () => {
    const h = nextHabit(null, { qty: 0.876, unit: 'kg' });
    expect(h.usual_qty).toBe(0.876);
    expect(habitQty(h)).toBe(0.88);
  });

  it('uten mengde er det ingenting å lære', () => {
    expect(nextHabit(null, {})).toBe(null);
    expect(nextHabit({ usual_qty: 2 }, { qty: 0 })).toBe(null);
    expect(habitQty(null)).toBe(null);
  });
});


import { priceThresholds, priceTrend, priceConfidence, confidenceLabel } from './priceLearning.js';

describe('fase 2: god pris, trend, sikkerhet', () => {
  const nå = new Date('2026-09-03T12:00:00Z');
  const d = (n) => new Date(nå.getTime() - n * 864e5).toISOString();

  it('priceThresholds: god og svært god fra egne priser, ikke førpriser', () => {
    const t = priceThresholds([119, 116, 119, 121, 109, 119, 115, 118]);
    expect(t.median).toBe(118.5);
    expect(t.good).toBeLessThan(t.median);
    expect(t.excellent).toBeLessThanOrEqual(t.good);
    expect(t.good).toBeLessThanOrEqual(118.5 * 0.88 + 0.01);
    expect(priceThresholds([119, 116, 119])).toBe(null);          // for få
    for (const v of [null, undefined, [], ['x'], [0, -1]]) expect(priceThresholds(v)).toBe(null);
  });

  it('priceTrend: 30 dager mot 31–90', () => {
    const obs = [
      { unit_price: 31.5, observed_at: d(2) }, { unit_price: 31.0, observed_at: d(10) },
      { unit_price: 29.9, observed_at: d(40) }, { unit_price: 28.9, observed_at: d(70) },
    ];
    const t = priceTrend(obs, { now: nå });
    expect(t.trend).toBe('rising');
    expect(t.pct).toBeCloseTo(((31.25 - 29.4) / 29.4) * 100, 0);
    expect(priceTrend([obs[0], obs[2]], { now: nå }).trend).toBe('unknown');
    expect(priceTrend([{ unit_price: 20, observed_at: d(1) }, { unit_price: 20.5, observed_at: d(5) }, { unit_price: 20.2, observed_at: d(50) }, { unit_price: 19.9, observed_at: d(60) }], { now: nå }).trend).toBe('stable');
    for (const v of [null, [], [{}], [{ observed_at: 'x' }]]) expect(priceTrend(v).trend).toBe('unknown');
  });

  it('priceConfidence: fersk + flere + samme butikk + enighet = høy', () => {
    const høy = priceConfidence([
      { unit_price: 22.9, observed_at: d(1), store_code: 'COOP_EXTRA', source: 'receipt' },
      { unit_price: 22.5, observed_at: d(3), store_code: 'COOP_EXTRA', source: 'kassalapp' },
      { unit_price: 22.9, observed_at: d(8), store_code: 'COOP_EXTRA', source: 'receipt' },
      { unit_price: 23.0, observed_at: d(15), store_code: 'COOP_EXTRA', source: 'receipt' },
    ], { storeCode: 'COOP_EXTRA', now: nå });
    expect(høy).toBeGreaterThanOrEqual(70);
    expect(confidenceLabel(høy)).toBe('Høy sikkerhet');

    const lav = priceConfidence([{ unit_price: 22.9, observed_at: d(110), store_code: 'MENY_NO', source: 'estimate' }], { storeCode: 'COOP_EXTRA', now: nå });
    expect(lav).toBeLessThan(40);
    expect(confidenceLabel(lav)).toBe('Lav sikkerhet');

    expect(priceConfidence([])).toBe(0);
    expect(confidenceLabel(NaN)).toBe('Lav sikkerhet');
    for (const v of [null, [null], [{}]]) expect(() => priceConfidence(v)).not.toThrow();
  });
});
