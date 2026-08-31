import { describe, it, expect } from 'vitest';
import {
  ingredientWeight, savingFor, scoreMeal, rankMealsByOffers,
  storeConcentration, savingLabel, storeLabel, coverageLabel,
} from './offerMeals.js';

const offer = (o) => ({ id: o.name, product_name: o.name, price: o.price, original_price: o.orig ?? null, store_code: o.store ?? 'rema', store_name: o.storeName ?? 'REMA 1000', ...o });

const taco = {
  name: 'Taco',
  ingredients: [
    { n: 'Kjøttdeig', qty: 400, unit: 'g' },
    { n: 'Tacokrydder', qty: 1, unit: 'pakke' },
    { n: 'Tortillalefser', qty: 1, unit: 'pakke' },
    { n: 'Rømme', qty: 1, unit: 'stk' },
    { n: 'Salt', qty: 1, unit: 'ts' },
  ],
};

describe('ingredientWeight — bærende vs bakgrunn', () => {
  it('kjøtt og fisk bærer retten', () => {
    expect(ingredientWeight({ n: 'Kjøttdeig', qty: 400, unit: 'g' })).toBe(1);
    expect(ingredientWeight({ n: 'Laksefilet', qty: 600, unit: 'g' })).toBe(1);
  });

  it('rene krydderingredienser teller ikke', () => {
    expect(ingredientWeight({ n: 'Salt' })).toBe(0);
    expect(ingredientWeight({ n: 'Vann', qty: 5, unit: 'dl' })).toBe(0);
  });

  it('små mål vektes lavt selv når varen er ekte', () => {
    expect(ingredientWeight({ n: 'Soyasaus', qty: 2, unit: 'ss' })).toBe(0.15);
  });

  it('vanlige varer havner i midten', () => {
    expect(ingredientWeight({ n: 'Tortillalefser', qty: 1, unit: 'pakke' })).toBe(0.35);
  });
});

describe('savingFor — kroner, ikke prosent', () => {
  it('regner spart mot antall pakker som faktisk trengs', () => {
    // 600 g kjøttdeig = 2 pakker à 400 g, 10 kr spart per pakke.
    expect(savingFor(offer({ name: 'Kjøttdeig', price: 40, orig: 50 }), { qty: 600, unit: 'g' })).toBe(20);
  });

  it('uten førpris vet vi ikke hva som spares', () => {
    expect(savingFor(offer({ name: 'Kjøttdeig', price: 40 }), { qty: 400, unit: 'g' })).toBeNull();
  });

  it('absurde beløp fra dårlige prisdata forkastes', () => {
    expect(savingFor(offer({ name: 'Laks', price: 1, orig: 40000 }), { qty: 1, unit: 'stk' })).toBeNull();
  });
});

describe('scoreMeal', () => {
  it('finner treff, dekning og bærende ingrediens', () => {
    const s = scoreMeal(taco, [
      offer({ name: 'Gilde kjøttdeig 400 g', price: 40, orig: 60 }),
      offer({ name: 'Rømme 300 g', price: 20, orig: 25 }),
    ]);
    expect(s.hits).toHaveLength(2);
    expect(s.bearingHits).toBe(1);
    expect(s.saved).toBe(25);
    expect(s.savedKnown).toBe(true);
    expect(s.coverage).toBeGreaterThan(0.5);
  });

  it('savedKnown er false når ett treff mangler førpris', () => {
    const s = scoreMeal(taco, [offer({ name: 'Kjøttdeig', price: 40 })]);
    expect(s.savedKnown).toBe(false);
    expect(savingLabel(s)).toBe('på tilbud nå');
  });

  it('samme tilbud brukes ikke to ganger i én rett', () => {
    const s = scoreMeal(
      { name: 'Ostesmørbrød', ingredients: [{ n: 'Ost' }, { n: 'Ost' }] },
      [offer({ name: 'Norvegia ost', price: 50, orig: 70 })],
    );
    expect(s.hits).toHaveLength(1);
  });

  it('middag uten ingredienser gir ingen score', () => {
    expect(scoreMeal({ name: 'Rester', ingredients: [] }, [offer({ name: 'Ost', price: 1 })])).toBeNull();
  });

  it('kokebokoppskrifter med raw_ingredients som tekst virker også', () => {
    const s = scoreMeal(
      { name: 'Laksewok', raw_ingredients: ['400 g laksefilet', '2 ss soyasaus'] },
      [offer({ name: 'Laks i skiver', price: 89, orig: 129 })],
    );
    expect(s.hits).toHaveLength(1);
    expect(s.bearingHits).toBe(1);
  });
});

describe('rankMealsByOffers — ærlig terskel', () => {
  const wok = { name: 'Wok', ingredients: [{ n: 'Kylling', qty: 600, unit: 'g' }, { n: 'Paprika' }] };

  it('rett der bare pynten er på tilbud slipper ikke gjennom', () => {
    const salat = {
      name: 'Storfesalat',
      ingredients: [
        { n: 'Entrecote', qty: 400, unit: 'g' }, { n: 'Salat' }, { n: 'Tomat' },
        { n: 'Agurk' }, { n: 'Olivenolje', qty: 2, unit: 'ss' },
      ],
    };
    const ranked = rankMealsByOffers([salat], [offer({ name: 'Agurk', price: 10, orig: 15 })]);
    expect(ranked).toHaveLength(0);
  });

  it('bærende treff rangeres over mange småtreff', () => {
    const ranked = rankMealsByOffers([taco, wok], [
      offer({ name: 'Kyllingfilet', price: 79, orig: 129 }),
      offer({ name: 'Tortillalefser', price: 20, orig: 30 }),
      offer({ name: 'Rømme', price: 18, orig: 22 }),
    ]);
    expect(ranked[0].meal.name).toBe('Wok');
  });

  it('uten tilbud eller uten middager gir tom liste', () => {
    expect(rankMealsByOffers([taco], [])).toEqual([]);
    expect(rankMealsByOffers([], [offer({ name: 'Ost', price: 1 })])).toEqual([]);
  });
});

describe('butikkonsentrasjon', () => {
  it('«alt hos én kjede» er poenget', () => {
    const s = scoreMeal(taco, [
      offer({ name: 'Kjøttdeig', price: 40, orig: 60, store: 'coop_extra', storeName: 'COOP EXTRA' }),
      offer({ name: 'Tortillalefser', price: 20, orig: 30, store: 'coop_extra', storeName: 'COOP EXTRA' }),
    ]);
    expect(storeLabel(s)).toBe('Alt hos COOP EXTRA');
  });

  it('spredte tilbud gir ingen påstand om butikk', () => {
    const s = scoreMeal(taco, [
      offer({ name: 'Kjøttdeig', price: 40, orig: 60, store: 'rema', storeName: 'REMA 1000' }),
      offer({ name: 'Tortillalefser', price: 20, orig: 30, store: 'meny', storeName: 'MENY' }),
    ]);
    expect(storeLabel(s)).toBeNull();
  });

  it('storeConcentration tåler tilbud uten butikk', () => {
    expect(storeConcentration([{ offer: { store_code: null, store_name: null } }])).toBeNull();
  });
});

describe('etiketter', () => {
  it('dekningen sies i varer, ikke prosent', () => {
    const s = scoreMeal(taco, [offer({ name: 'Kjøttdeig', price: 40, orig: 60 })]);
    expect(coverageLabel(s)).toBe('1 av 5 varer på tilbud');
  });

  it('ukjent førpris gir «minst», ikke «ca.»', () => {
    const s = scoreMeal(taco, [
      offer({ name: 'Kjøttdeig', price: 40, orig: 60 }),
      offer({ name: 'Rømme', price: 18 }),
    ]);
    expect(savingLabel(s)).toBe('Sparer minst kr 20');
  });
});
