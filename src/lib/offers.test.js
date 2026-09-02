import { describe, it, expect } from 'vitest';
import { scoreOffer, RELEVANCE_THRESHOLD } from './offers.js';

describe('match_name som ikke stemmer med varen', () => {
  const ctx = {
    catalog: [{ name: 'soyamelk uten sukker', frequency_sig: 'Svært ofte' }],
    shopItems: [], plannedIngredients: new Set(),
    staples: new Set(), dairyFree: new Set(['soyamelk uten sukker']),
  };

  it('en energidrikk arver ikke soyamelkens vaner', () => {
    const r = scoreOffer({
      id: 'x', product_name: 'Battery 0,5 l, med/uten sukker',
      match_name: 'soyamelk uten sukker', price: 16.9,
    }, ctx);
    expect(r.reasons.join(' ')).not.toContain('soyamelk');
    expect(r.score).toBeLessThan(RELEVANCE_THRESHOLD);
  });

  it('et ekte treff beholder begrunnelsen sin', () => {
    const r = scoreOffer({
      id: 'y', product_name: 'Alpro soyamelk uten sukker 1 l',
      match_name: 'soyamelk uten sukker', price: 25,
    }, ctx);
    expect(r.reasons.join(' ')).toContain('soyamelk');
    expect(r.score).toBeGreaterThanOrEqual(RELEVANCE_THRESHOLD);
  });
});

describe('begrunnelsen «under deres vanlige pris»', () => {
  const ctx = {
    catalog: [{ name: 'kjøttdeig', frequency_sig: 'Ofte', avg_price: 66.5 }],
    shopItems: [], plannedIngredients: new Set(),
    staples: new Set(), dairyFree: new Set(),
  };

  // Denne grenen brukte kr() uten at funksjonen var importert. Resultatet
  // var «kr is not defined» — og fordi både Tilbud og Forslag rangerer
  // tilbud, ble begge fanene blanke i det ett tilbud var billigere enn
  // snittprisen i varedatabasen.
  it('formaterer snittprisen i stedet for å kaste', () => {
    const r = scoreOffer({ id: 'a', product_name: 'Kjøttdeig', price: 39.9 }, ctx);
    expect(r.reasons.join(' ')).toContain('under deres vanlige pris (ca. kr 66,50)');
  });

  it('ingen slik begrunnelse når tilbudet er dyrere', () => {
    const r = scoreOffer({ id: 'b', product_name: 'Kjøttdeig', price: 79 }, ctx);
    expect(r.reasons.join(' ')).not.toContain('vanlige pris');
  });
});

describe('skitne rader velter ikke rangeringen', () => {
  const ctx = {
    catalog: [{ name: null }, { name: 42 }, { name: 'melk', avg_price: 20 }],
    shopItems: [{ name: null, checked: false }],
    plannedIngredients: new Set(),
    staples: ['melk'],            // liste i stedet for Set
    dairyFree: new Set(),
  };

  it('tåler navn som mangler eller ikke er tekst', () => {
    expect(() => scoreOffer({ id: 'c', product_name: null, price: 10 }, ctx)).not.toThrow();
    expect(() => scoreOffer({ id: 'd', product_name: 12345, price: 10 }, ctx)).not.toThrow();
    expect(() => scoreOffer({ id: 'e', product_name: 'Melk', price: 10 }, ctx)).not.toThrow();
  });
});
