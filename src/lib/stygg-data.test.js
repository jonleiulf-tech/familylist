import { describe, it, expect } from 'vitest';
import { mealNutrition } from './nutrition.js';
import { matchOffersToPlan } from './offerMatch.js';
import { offerPurchases, scoreMeal, rankMealsByOffers, cheapestOfDish, availableDishes } from './offerMeals.js';
import { generatePlan } from './planner.js';
import { mealScaleFactor, scaleQty, householdPortions } from './portions.js';
import { normalizeIngredients } from './recipe.js';
import { spendByPerson, calculateSettlement } from './settlement.js';
import { sortShoppingItems } from './sortItems.js';
import { addItem, parseListText, splitItems, progressLabel } from './customLists.js';
import { groupItems, countTotals, ensureIds, parseCountLine } from './countList.js';
import { conceptFor, dishConceptFor, normalizeText } from './foodConcepts.js';
import { estimatedTotal } from './format.js';
import { mealMatchesScope } from './planner.js';

/**
 * Data databasen ikke garanterer noe om.
 *
 * Fem av kolonnene appen leser er `jsonb`, og skjemaet sier bare
 * `not null default '[]'` — ingenting om hva som ligger inne i arrayet:
 *
 *   meals.ingredients            [{n, qty, unit}]
 *   meal_library.ingredients     [{n, qty, unit}]
 *   meal_week_templates.days     [{weekday, meal_name}]
 *   custom_lists.items           [{n, chk, qty}]
 *   households.hidden_meals      [navn]
 *
 * I tillegg kommer rader fra ting utenfor appen: en oppskrift hentet fra
 * en nettside, et bilde av en handleliste lest av en maskin, en kvittering
 * tolket fra PDF. Ingen av dem lover at feltene finnes.
 *
 * Tre hvite skjermer og én krasjet Lister-fane har alle vært samme sak:
 * `x.navn.toLowerCase()` der `navn` var undefined. Apekatt-testen finner
 * dem, men bruker en nettleser og et halvt minutt per runde. Denne gjør
 * det samme på millisekunder, og kjører på hver commit.
 *
 * Regelen er enkel: INGEN av disse funksjonene skal kaste. De kan gjerne
 * hoppe over en ødelagt rad, returnere null eller null-verdier — men de
 * skal aldri ta ned fanen de tegner.
 */

/** Ingredienser med alle feilene som er sett i praksis. */
const STYGGE_INGREDIENSER = [
  {},                                       // helt tom
  { n: null, qty: 1, unit: 'stk' },
  { n: undefined, qty: null, unit: null },
  { n: '', qty: 0, unit: '' },
  { n: '   ', qty: -5, unit: 'ukjent' },
  { n: 42, qty: '400', unit: 'g' },         // tall der tekst forventes
  { n: 'Melk', qty: NaN, unit: 'liter' },
  { n: 'x'.repeat(400), qty: 1e9, unit: 'kg' },
  { n: 'Egg', qty: 4 },                     // enhet mangler
  { qty: 2, unit: 'stk' },                  // navn mangler
  { n: 'Kjøttdeig 14 % — Gilde 🇳🇴', qty: 400, unit: 'g' },
];

const STYGGE_MIDDAGER = [
  {},
  { id: 'm1', name: null, ingredients: STYGGE_INGREDIENSER },
  { id: 'm2', name: '', ingredients: null },
  { id: 'm3', name: 'Taco', ingredients: undefined, base_servings: null },
  { id: 'm4', name: 'Laks', ingredients: [], base_servings: 0 },
  { id: 'm5', name: 42, ingredients: STYGGE_INGREDIENSER, base_servings: -3 },
  { id: 'm6', name: 'Grøt', ingredients: STYGGE_INGREDIENSER, base_servings: 1e6 },
];

const STYGGE_TILBUD = [
  {},
  { id: 'o1', match_name: null, product_name: null, price: null, store_name: null },
  { id: 'o2', match_name: '', product_name: '', price: 0, original_price: 0 },
  { id: 'o3', match_name: 'Egg', product_name: 'Egg 12pk', price: -1, original_price: null, unit: null },
  { id: 'o4', match_name: 'Melk', product_name: 'x'.repeat(300), price: 1e9, unit_price: NaN },
  { id: 'o5', match_name: 42, price: '19,90' },
];

const STYGGE_VARER = [
  {},
  { id: 'i1', name: null, qty: 1, unit: 'stk', category: null, store: null, price: null },
  { id: 'i2', name: '', qty: null, unit: null, category: '', store: '', price: 0 },
  { id: 'i3', name: 'Melk', qty: -2, unit: 'ukjent', price: -50, pack_size: 0 },
  { id: 'i4', name: 'x'.repeat(300), qty: 1e7, unit: 'kg', price: 1e9, pack_size: -1 },
  { id: 'i5', name: 42, qty: '2', unit: 'STK', price: '35,50' },
  { id: 'i6', name: 'Egg', checked: true, checked_by: null, price: 65, pack_size: 6, qty: 6, unit: 'stk' },
];

const STYGGE_PLANDAGER = [
  {},
  { plan_date: null, meal_name: null },
  { plan_date: 'ikke-en-dato', meal_name: '' },
  { plan_date: '2026-09-03', meal_name: null, skipped: false },
  { plan_date: '2026-09-04', meal_name: 42, guest_portions: null },
  { plan_date: '2026-09-05', meal_name: 'Taco', guest_portions: -8, locked: null },
];

const STYGGE_MEDLEMMER = [
  {},
  { user_id: null, display_name: null, initials: null },
  { user_id: 'u1', display_name: '', initials: '' },
  { user_id: 'u2', display_name: 42 },
];

const STYGGE_REGLER = [
  {},
  { id: 'r1', scope: null, rule_type: null, amount: null, enabled: true },
  { id: 'r2', scope: '', rule_type: 'min', amount: -1, enabled: true },
  { id: 'r3', scope: 'Fisk', rule_type: 'ukjent', amount: 1e6, enabled: true, weekdays: null },
  { id: 'r4', scope: 42, rule_type: 'weekday', amount: 1, enabled: true, weekdays: [99, -1, null] },
];

const STYGGE_LISTEELEMENTER = [
  {},
  { n: null, chk: false, qty: 1 },
  { n: undefined },
  { n: '', chk: true, qty: 0 },
  { n: 42, chk: null, qty: null },
  { n: 'Ved', chk: false },
  { id: 'c1', g: null, n: null, qty: null, chk: null },
  { id: 'c2', g: 'Sko', n: '39', qty: 3, chk: false },
];

describe('middager og ingredienser fra en jsonb-kolonne', () => {
  it('mealNutrition kaster ikke', () => {
    for (const m of STYGGE_MIDDAGER) {
      for (const s of [4, 0, null, -1, 1e6]) {
        expect(() => mealNutrition(m, s), `middag ${JSON.stringify(m).slice(0, 60)} porsjoner ${s}`).not.toThrow();
      }
    }
  });

  it('normalizeIngredients kaster ikke', () => {
    expect(() => normalizeIngredients(STYGGE_INGREDIENSER)).not.toThrow();
    for (const tomt of [null, undefined, [], {}, 'tekst', 42]) {
      expect(() => normalizeIngredients(tomt), `input ${JSON.stringify(tomt)}`).not.toThrow();
    }
  });

  it('porsjonsskalering kaster ikke', () => {
    for (const m of STYGGE_MIDDAGER) {
      expect(() => mealScaleFactor(m.base_servings, { adults: 2, children: 2 }, 0)).not.toThrow();
      expect(() => mealScaleFactor(m.base_servings, {}, null)).not.toThrow();
    }
    for (const i of STYGGE_INGREDIENSER) {
      expect(() => scaleQty(i.qty, 1.5, i.unit)).not.toThrow();
    }
    for (const h of [null, undefined, {}, { adults: null, children: null }, { adults: -1, children: 1e6 }]) {
      expect(() => householdPortions(h), `husholdning ${JSON.stringify(h)}`).not.toThrow();
    }
  });

  it('availableDishes og dishConceptFor kaster ikke', () => {
    expect(() => availableDishes(STYGGE_MIDDAGER)).not.toThrow();
    for (const m of STYGGE_MIDDAGER) expect(() => dishConceptFor(m.name)).not.toThrow();
  });
});

describe('tilbud fra høsting, kundeavis-skann og API', () => {
  it('scoreMeal og rankMealsByOffers kaster ikke', () => {
    for (const m of STYGGE_MIDDAGER) {
      expect(() => scoreMeal(m, STYGGE_TILBUD), `middag ${m.id}`).not.toThrow();
    }
    expect(() => rankMealsByOffers(STYGGE_MIDDAGER, STYGGE_TILBUD)).not.toThrow();
    expect(() => rankMealsByOffers([], [])).not.toThrow();
  });

  it('offerPurchases kaster ikke', () => {
    for (const o of STYGGE_TILBUD) {
      for (const i of STYGGE_INGREDIENSER) {
        expect(() => offerPurchases(o, i)).not.toThrow();
      }
    }
  });

  it('cheapestOfDish kaster ikke', () => {
    for (const id of [null, undefined, '', 'finnes-ikke', 42]) {
      expect(() => cheapestOfDish(id, STYGGE_MIDDAGER, STYGGE_TILBUD)).not.toThrow();
    }
  });

  it('matchOffersToPlan kaster ikke', () => {
    expect(() => matchOffersToPlan(STYGGE_PLANDAGER, STYGGE_MIDDAGER, STYGGE_TILBUD)).not.toThrow();
    expect(() => matchOffersToPlan([], [], [])).not.toThrow();
  });
});

describe('ukeplan og husregler', () => {
  it('generatePlan kaster ikke', () => {
    for (const mode of ['variert', 'billigst', 'rutine', 'ukjent']) {
      expect(() => generatePlan({
        plan: STYGGE_PLANDAGER, meals: STYGGE_MIDDAGER, rules: STYGGE_REGLER,
        offers: STYGGE_TILBUD, mode, random: () => 0.5, servings: 4,
      }), `modus ${mode}`).not.toThrow();
    }
    // Tom plan og tomme middager er en ny bruker — den vanligste tilstanden
    // av alle på dag én.
    expect(() => generatePlan({ plan: [], meals: [], random: () => 0.5 })).not.toThrow();
  });

  it('mealMatchesScope kaster ikke', () => {
    for (const m of STYGGE_MIDDAGER) {
      for (const r of STYGGE_REGLER) {
        expect(() => mealMatchesScope(m, r.scope)).not.toThrow();
      }
    }
  });
});

describe('handleliste, sortering og oppgjør', () => {
  it('sortShoppingItems kaster ikke', () => {
    for (const mode of ['butikk', 'kategori', 'alfabetisk', 'lagt-inn', 'ukjent', null]) {
      expect(() => sortShoppingItems(STYGGE_VARER, mode, { positionOf: () => null }), `modus ${mode}`).not.toThrow();
    }
  });

  it('estimatedTotal kaster ikke, og lyver ikke', () => {
    expect(() => estimatedTotal(STYGGE_VARER)).not.toThrow();
    const e = estimatedTotal(STYGGE_VARER);
    // Med rader uten pris kan summen ALDRI meldes som eksakt.
    expect(e.exact).toBe(false);
    expect(e.missing).toBeGreaterThan(0);
    expect(Number.isFinite(e.sum)).toBe(true);
  });

  it('oppgjør kaster ikke', () => {
    expect(() => spendByPerson(STYGGE_VARER, STYGGE_MEDLEMMER)).not.toThrow();
    expect(() => calculateSettlement(STYGGE_VARER, STYGGE_MEDLEMMER)).not.toThrow();
    expect(() => calculateSettlement([], [])).not.toThrow();
  });
});

describe('egne lister og tellelister', () => {
  it('customLists kaster ikke', () => {
    expect(() => addItem(STYGGE_LISTEELEMENTER, 'Melk')).not.toThrow();
    expect(() => addItem(STYGGE_LISTEELEMENTER, null)).not.toThrow();
    expect(() => splitItems(STYGGE_LISTEELEMENTER)).not.toThrow();
    expect(() => progressLabel(STYGGE_LISTEELEMENTER)).not.toThrow();
    for (const t of [null, undefined, '', 42, 'a\nb\n\n- c\n[x] d']) {
      expect(() => parseListText(t)).not.toThrow();
    }
  });

  it('tellelister kaster ikke', () => {
    expect(() => groupItems(STYGGE_LISTEELEMENTER)).not.toThrow();
    expect(() => countTotals(STYGGE_LISTEELEMENTER)).not.toThrow();
    expect(() => ensureIds(STYGGE_LISTEELEMENTER)).not.toThrow();
    for (const t of [null, undefined, '', 42, 'Sko / 39 x10']) {
      expect(() => parseCountLine(t)).not.toThrow();
    }
  });
});

describe('varegjenkjenning', () => {
  it('conceptFor og normalizeText kaster ikke', () => {
    for (const v of [null, undefined, '', '   ', 42, NaN, 'x'.repeat(500), '<b>Melk</b>', 'ÆØÅ', '日本語']) {
      expect(() => normalizeText(v), `verdi ${String(v)}`).not.toThrow();
      expect(() => conceptFor(v), `verdi ${String(v)}`).not.toThrow();
    }
  });
});
