import { describe, it, expect } from 'vitest';
import {
  median, ordinaryUnitPrice, learnedPrice, usualQty, recentObservations, MAX_SHIFT,
  nextHabit, habitQty,
} from './priceLearning.js';

const iso = (daysAgo) => new Date(Date.now() - daysAgo * 864e5).toISOString();
const obs = (unit_price, extra = {}) => ({ unit_price, observed_at: iso(1), ...extra });

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
    const res = learnedPrice([obs(22.33), obs(22.33), obs(21.9)], 58);
    expect(res.capped).toBe(true);
    expect(res.price).toBe(Number((58 * (1 - MAX_SHIFT)).toFixed(2)));   // 37.70
    expect(res.n).toBe(3);
  });

  it('kommer helt fram etter noen runder', () => {
    let price = 58;
    for (let i = 0; i < 6; i += 1) {
      price = learnedPrice([obs(22.33), obs(22.33)], price).price;
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
    const res = learnedPrice([obs(129), obs(129), obs(1290), obs(125)], 129);
    expect(res.price).toBeCloseTo(129, 0);
  });

  it('gir null når det ikke finnes noe å lære av', () => {
    expect(learnedPrice([], 30)).toBe(null);
    expect(learnedPrice(null, null)).toBe(null);
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
