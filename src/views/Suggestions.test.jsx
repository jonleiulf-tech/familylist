// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Suggestions } from './Suggestions.jsx';

const catalog = [
  { id: 'c1', name: 'Melk', major_category: 'Meieri', primary_store: 'REMA 1000', avg_price: 22.9, pack_size: 1, unit: 'l', times_bought: 12 },
  { id: 'c2', name: 'Kjøttdeig', major_category: 'Kjøtt', primary_store: 'REMA 1000', avg_price: 66.5, pack_size: 400, unit: 'g', times_bought: 8 },
  { id: 'c3', name: 'Egg', major_category: 'Meieri', primary_store: 'KIWI', avg_price: 63.6, pack_size: 12, unit: 'stk', times_bought: 5 },
];

const offers = [
  { id: 'o1', product_name: 'Kjøttdeig 400 g', store: 'REMA 1000', price: 39.9, was_price: 66.5, valid_to: '2026-09-14', unit: 'pakke' },
  { id: 'o2', product_name: 'Laks i skiver', store: 'KIWI', price: 89, was_price: 129, valid_to: '2026-09-12' },
];

const plan = [
  { plan_date: '2026-09-07', meal_name: 'Taco', skipped: false, locked: false, done: false, guest_portions: 0, sent_to_list_at: null },
  { plan_date: '2026-09-08', meal_name: null, skipped: false, locked: false, done: false, guest_portions: 0, sent_to_list_at: null },
];

const meals = [
  { id: 'm1', name: 'Taco', category: 'Kjøtt', ingredients: [{ n: 'Kjøttdeig', qty: 400, unit: 'g' }, { n: 'Tortilla', qty: 1 }] },
];

function setup(extra = {}) {
  const props = {
    trips: [{ id: 't1', name: 'Ukehandel', items: [{ name: 'Melk', qty: 1, unit: 'l' }] }],
    catalog,
    normRules: new Map(),
    offers,
    existingNames: new Set(['tortilla']),
    defaultStore: 'REMA 1000',
    plan,
    meals,
    rules: [{ id: 'r1', scope: 'Fisk', rule_type: 'min_per_week', amount: 2, weekdays: null, enabled: true }],
    shopItems: [{ id: 'i1', name: 'Tortilla', qty: 1, unit: 'pakke', category: 'Tørrvarer', store: 'REMA 1000', checked: false }],
    plannedIngredients: new Set(['kjøttdeig', 'tortilla']),
    itemTags: { staples: new Set(['Melk']), dairyFree: new Set() },
    onSendToList: vi.fn(),
    onDeleteTrip: vi.fn(),
    onAddOffer: vi.fn(),
    onGo: vi.fn(),
    toast: vi.fn(),
    ...extra,
  };
  render(<Suggestions {...props} />);
}

describe('Forslag-fanen', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('rendrer uten feil med ekte data', () => {
    const spy = vi.spyOn(console, 'error');
    setup();
    expect(spy).not.toHaveBeenCalled();
  });

  it('tåler at alt er tomt', () => {
    const spy = vi.spyOn(console, 'error');
    setup({
      trips: [], catalog: [], offers: [], plan: [], meals: [], rules: [],
      shopItems: [], plannedIngredients: new Set(), existingNames: new Set(),
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('tåler at itemTags mangler', () => {
    const spy = vi.spyOn(console, 'error');
    setup({ itemTags: undefined });
    expect(spy).not.toHaveBeenCalled();
  });

  it('tåler tilbud uten pris og dato', () => {
    const spy = vi.spyOn(console, 'error');
    setup({ offers: [{ id: 'o9', product_name: 'Ukjent vare', store: null, price: null, valid_to: null }] });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('Forslag-fanen tåler skitne data', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  const cases = {
    'tilbud uten navn': { offers: [{ id: 'o1', product_name: null, store: 'KIWI', price: 20, valid_to: null }] },
    'tilbud med tall som navn': { offers: [{ id: 'o1', product_name: 12345, store: 'KIWI', price: 20 }] },
    'tilbud uten butikk og id': { offers: [{ product_name: 'Laks', price: 20 }] },
    'katalogvare uten navn': { catalog: [{ id: 'c1', name: null, major_category: 'Annet', times_bought: 4 }] },
    'katalogvare med tall som navn': { catalog: [{ id: 'c1', name: 42, major_category: 'Annet', times_bought: 4 }] },
    'handletur uten varer': { trips: [{ id: 't1', name: 'Tur', items: null }] },
    'handletur uten navn': { trips: [{ id: 't1', name: null, items: [] }] },
    'handleliste-vare uten navn': { shopItems: [{ id: 'i1', name: null, qty: 1 }] },
    'middag uten ingredienser': { meals: [{ id: 'm1', name: 'Taco', ingredients: null }] },
    'ingrediens uten navn': { meals: [{ id: 'm1', name: 'Taco', ingredients: [{ n: null, qty: 1 }] }] },
    'plandag med ukjent middag': { plan: [{ plan_date: '2026-09-07', meal_name: 'Finnes ikke', skipped: false }] },
    'regel uten felter': { rules: [{ id: 'r1' }] },
    'itemTags mangler helt': { itemTags: undefined },
    'itemTags med lister i stedet for Set': { itemTags: { staples: [], dairyFree: [] } },
  };

  for (const [label, extra] of Object.entries(cases)) {
    it(`krasjer ikke: ${label}`, () => {
      const spy = vi.spyOn(console, 'error');
      setup(extra);
      const calls = spy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(calls, calls).not.toMatch(/error occurred in|Uncaught/i);
    });
  }
});
