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
