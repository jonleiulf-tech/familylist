import { describe, it, expect } from 'vitest';
import { matchOffersToPlan } from './offerMatch.js';

const meals = [
  { name: 'Taco', ingredients: [{ name: 'Kjøttdeig' }, { name: 'Tacokrydder' }, { name: 'Salt' }] },
  { name: 'Laksewok', ingredients: [{ name: 'Laks' }, { name: 'Wokgrønnsaker' }] },
];
const plan = [
  { plan_date: '2026-09-03', meal_name: 'Taco' },
  { plan_date: '2026-09-04', meal_name: 'Laksewok' },
  { plan_date: '2026-09-05', meal_name: null },
];

describe('matchOffersToPlan', () => {
  it('treffer forstavelser: laks → laksefilet, kjøttdeig → Kjøttdeig 400g', () => {
    const offers = [
      { id: 'o1', name: 'Laksefilet 4x125g', price: 89, original_price: 129 },
      { id: 'o2', name: 'Kjøttdeig 400g Gilde', price: 39, original_price: 55 },
      { id: 'o3', name: 'Melkesjokolade', price: 25, original_price: 40 },
    ];
    const hits = matchOffersToPlan(plan, meals, offers);
    expect(hits.map((h) => h.offer.id).sort()).toEqual(['o1', 'o2']);
    const laks = hits.find((h) => h.offer.id === 'o1');
    expect(laks.mealName).toBe('Laksewok');
    expect(laks.planDate).toBe('2026-09-04');
  });

  it('sorterer størst rabatt først og hopper over støy-ingredienser', () => {
    const offers = [
      { id: 'a', name: 'Kjøttdeig', price: 50, original_price: 55 },   // 9 %
      { id: 'b', name: 'Laks', price: 60, original_price: 120 },       // 50 %
      { id: 'c', name: 'Havsalt fint', price: 10, original_price: 30 }, // salt = støy
    ];
    const hits = matchOffersToPlan(plan, meals, offers);
    expect(hits.map((h) => h.offer.id)).toEqual(['b', 'a']);
    expect(hits[0].pct).toBe(50);
  });

  it('gir ett innslag per tilbud selv om flere middager treffer', () => {
    const offers = [{ id: 'x', name: 'Kjøttdeig', price: 40 }];
    const doublePlan = [...plan, { plan_date: '2026-09-06', meal_name: 'Taco' }];
    expect(matchOffersToPlan(doublePlan, meals, offers)).toHaveLength(1);
  });

  it('tåler tom plan, tomme tilbud og strengingredienser', () => {
    expect(matchOffersToPlan([], meals, [{ id: 1, name: 'Laks' }])).toEqual([]);
    expect(matchOffersToPlan(plan, meals, [])).toEqual([]);
    const strMeals = [{ name: 'Taco', ingredients: ['Kjøttdeig'] }];
    const hits = matchOffersToPlan([plan[0]], strMeals, [{ id: 'k', name: 'Kjøttdeig Gilde' }]);
    expect(hits).toHaveLength(1);
  });

  it('melk treffer ikke melkesjokolade (lengdetak på forstavelse)', () => {
    const m = [{ name: 'Grøt', ingredients: [{ name: 'Melk' }] }];
    const p = [{ plan_date: '2026-09-03', meal_name: 'Grøt' }];
    expect(matchOffersToPlan(p, m, [{ id: 's', name: 'Melkesjokolade 200g' }])).toEqual([]);
    expect(matchOffersToPlan(p, m, [{ id: 'm', name: 'Melk 1l Tine' }])).toHaveLength(1);
  });

  it('3-bokstavs varer (løk, egg, ost, ris) matcher tilbud', () => {
    const m = [{ name: 'Suppe', ingredients: [{ n: 'Løk' }, { n: 'Egg' }] }];
    const p = [{ plan_date: '2026-09-03', meal_name: 'Suppe' }];
    const offers = [
      { id: 'l', name: 'Løk i nett 1 kg', price: 15 },
      { id: 'e', name: 'Egg 12-pk', price: 39 },
    ];
    expect(matchOffersToPlan(p, m, offers).map((h) => h.offer.id).sort()).toEqual(['e', 'l']);
  });

  it('leser ingrediens {n} og tilbud product_name/match_name', () => {
    const m = [{ name: 'Taco', ingredients: [{ n: 'Kjøttdeig', qty: 400 }] }];
    const p = [{ plan_date: '2026-09-03', meal_name: 'Taco' }];
    expect(matchOffersToPlan(p, m, [{ id: 'k', product_name: 'Kjøttdeig 400g' }])).toHaveLength(1);
    expect(matchOffersToPlan(p, m, [{ id: 'k2', match_name: 'kjøttdeig' }])).toHaveLength(1);
  });
});
