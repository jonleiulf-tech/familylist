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
import { percentile } from './priceLearning.js';

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


// ---------------------------------------------------------------------
// Runde to: resten av biblioteket, samme regel.
// ---------------------------------------------------------------------

import { discountPercent, scoreOffer, rankOffers, reasonText } from './offers.js';
import { sameProduct, contradictsProduct, detectPriceDrop, productToOffer, rankDrops, wordMatch } from './priceDrop.js';
import { median, ordinaryUnitPrice, recentObservations, dominantUnitGroup, learnedPrice, usualQty, nextHabit, habitQty } from './priceLearning.js';
import { levelFor, motivation, subscriptionLabel } from './points.js';
import { billingState, needsAttention, canWrite, daysUntil } from './billing.js';
import { categoryOf, dietHistogram, ruleProgress, suggestRules, ruleTitle, ruleDescription, ruleChip } from './rulesInsights.js';
import { weekStart, isoWeek, pickerDays, weekGroups, dayNote, moveRows } from './dayPicker.js';
import {
  isPackUnit, piecesPerPack, packSizeFor, guessCategory, guessUnit,
  normalizeName, resolveCatalogItem, searchCatalog, parseSpeech, frequentMissing,
} from './catalog.js';
import {
  num, kr, purchases, stepQty, qtyDetail, estimateCost, unitPrice,
  weekdayName, dayLabel, shortDate, longDate, tripName,
} from './format.js';
import { normalizeUnit, unitFamily, parseQty, convertQty, tidyUnit } from './units.js';
import { storeKey, observedRoute, routeInfo, routedStores } from './storeRoutes.js';
import { rank, rankProducts } from './kassalRank.js';
import { parseImportLine, classifyLine, toShoppingRow, processImport } from './keepImport.js';
import { classifyFlyerRow, filterFlyerRows } from './flyerRows.js';
import { parseIngredientLine, translateName, normalizeExternalIngredient, normalizeExternalIngredients } from './recipes/ingredients.js';
import { normalizeServings, scaleFactor } from './recipes/servings.js';
import { tidyTitle } from './recipes/title.js';
import { gramsOf, nutritionLabel, relativeToUsual } from './nutrition.js';
import { stemEq, nameHit, discountPct } from './offerMatch.js';
import { ingredientWeight, packSizeFromName, savingFor, sourceLabel, validLabel, storeConcentration, coverageLabel, savingLabel, storeLabel } from './offerMeals.js';
import { synonymsOf, conceptById, isDerivedProduct, conceptMatch, dishById } from './foodConcepts.js';
import { safeUrl } from './safeUrl.js';

/** Alt som kan komme inn der en tekst forventes. */
const RARE_VERDIER = [
  null, undefined, '', '   ', 0, -1, 42, NaN, Infinity, -Infinity,
  false, true, [], {}, 'ÆØÅ', '日本語', '<script>x</script>',
  'x'.repeat(500), '100 %', '2,5', '1e9', '\n\t',
];

/** Alt som kan komme inn der en liste forventes. */
const RARE_LISTER = [null, undefined, [], {}, 'tekst', 42, [null], [undefined], [{}]];

/** Kaller fn med hver rare verdi i hver posisjon, og krever at den ikke kaster. */
function tålerAlt(navn, fn, arity = 1, faste = []) {
  for (let pos = 0; pos < arity; pos += 1) {
    for (const v of RARE_VERDIER) {
      const args = [...faste];
      while (args.length < arity) args.push(undefined);
      args[pos] = v;
      expect(() => fn(...args), `${navn}(arg ${pos} = ${JSON.stringify(v)?.slice(0, 40)})`).not.toThrow();
    }
  }
}

/** Samme, men for funksjoner som tar en liste av rader. */
function tålerAlleLister(navn, fn, faste = []) {
  for (const l of RARE_LISTER) {
    expect(() => fn(l, ...faste), `${navn}(${JSON.stringify(l)?.slice(0, 30)})`).not.toThrow();
  }
}

describe('tilbud, prisfall og prislæring', () => {
  it('rangering og poengsetting av tilbud kaster ikke', () => {
    for (const o of STYGGE_TILBUD) {
      expect(() => discountPercent(o)).not.toThrow();
      expect(() => scoreOffer(o, { items: STYGGE_VARER, catalog: [], habits: [] })).not.toThrow();
      expect(() => reasonText(o, {})).not.toThrow();
    }
    expect(() => rankOffers(STYGGE_TILBUD, { items: STYGGE_VARER, catalog: [], habits: [] })).not.toThrow();
    expect(() => rankOffers([], { items: [], catalog: [], habits: [] })).not.toThrow();
  });

  it('prisfall kaster ikke', () => {
    for (const a of STYGGE_TILBUD) {
      for (const b of STYGGE_TILBUD) {
        expect(() => sameProduct(a, b)).not.toThrow();
        expect(() => contradictsProduct(a, b)).not.toThrow();
      }
      expect(() => productToOffer(a)).not.toThrow();
    }
    // wordMatch og stemEq får bare ord fra words(), altså alltid tekst —
    // derfor testes de med tekst, ikke med null.
    for (const a of ['melk', '', 'æøå', 'x'.repeat(200)]) {
      for (const b of ['melk', '', 'melkesjokolade', '2']) expect(() => wordMatch(a, b)).not.toThrow();
    }
    expect(() => rankDrops(STYGGE_TILBUD)).not.toThrow();
    expect(() => rankDrops([])).not.toThrow();
    expect(() => detectPriceDrop(STYGGE_TILBUD, STYGGE_TILBUD)).not.toThrow();
  });

  it('prislæring kaster ikke', () => {
    const OBS = [
      {}, { unit_price: null, unit: null, observed_at: null },
      { unit_price: 0, unit: '', observed_at: 'ikke-en-dato' },
      { unit_price: -5, unit: 'kg', observed_at: '2026-09-01' },
      { unit_price: 1e9, unit: 42, observed_at: '2026-09-02' },
      { unit_price: '19,90', unit: 'stk', observed_at: '2026-09-03' },
    ];
    for (const l of [[], [null], [undefined], [{}]]) {
      expect(() => median(l)).not.toThrow();
      expect(() => percentile(l, 0.5)).not.toThrow();
      expect(() => recentObservations(l)).not.toThrow();
      expect(() => dominantUnitGroup(l)).not.toThrow();
    }
    expect(() => median(OBS.map((o) => o.unit_price))).not.toThrow();
    expect(() => recentObservations(OBS)).not.toThrow();
    expect(() => dominantUnitGroup(OBS)).not.toThrow();
    expect(() => learnedPrice(OBS)).not.toThrow();
    expect(() => ordinaryUnitPrice(OBS)).not.toThrow();
    // usualQty(observasjoner, opsjoner) — det er observasjonene som er
    // rare, ikke opsjonene, som alltid settes av kallstedet.
    expect(() => usualQty(OBS)).not.toThrow();
    expect(() => usualQty([])).not.toThrow();
    for (const i of STYGGE_VARER) {
      expect(() => habitQty({ usual_qty: i?.qty, unit: i?.unit }, i?.unit)).not.toThrow();
      expect(() => nextHabit(null, i)).not.toThrow();
      expect(() => nextHabit({ usual_qty: null, unit: null, times_bought: null }, i)).not.toThrow();
    }
  });
});

describe('poeng og abonnement', () => {
  it('kaster ikke', () => {
    tålerAlt('levelFor', levelFor, 1);
    tålerAlt('motivation', motivation, 1);
    tålerAlt('daysUntil', daysUntil, 1);
    for (const s of [
      null, undefined, {}, { status: null, paid_until: null },
      { status: '', paid_until: '' }, { status: 'ukjent', paid_until: 'ikke-en-dato' },
      { status: 'prøve', paid_until: '2026-01-01' }, { status: 'forfalt', paid_until: null },
    ]) {
      expect(() => billingState(s), `abonnement ${JSON.stringify(s)}`).not.toThrow();
      expect(() => needsAttention(billingState(s))).not.toThrow();
      expect(() => canWrite(billingState(s))).not.toThrow();
      expect(() => subscriptionLabel(s)).not.toThrow();
    }
  });
});

describe('husregler og innsikt', () => {
  it('kaster ikke', () => {
    // categoryOf(navn, middager) — middager kommer alltid fra state, så
    // det er NAVNET som kan være rart.
    for (const v of RARE_VERDIER) expect(() => categoryOf(v, STYGGE_MIDDAGER)).not.toThrow();
    expect(() => dietHistogram([], STYGGE_MIDDAGER)).not.toThrow();
    expect(() => dietHistogram(STYGGE_PLANDAGER, STYGGE_MIDDAGER)).not.toThrow();
    expect(() => ruleProgress(STYGGE_REGLER, STYGGE_PLANDAGER, STYGGE_MIDDAGER)).not.toThrow();
    expect(() => suggestRules(STYGGE_PLANDAGER, STYGGE_MIDDAGER, STYGGE_REGLER)).not.toThrow();
    for (const r of STYGGE_REGLER) {
      expect(() => ruleTitle(r)).not.toThrow();
      expect(() => ruleDescription(r)).not.toThrow();
      expect(() => ruleChip(r)).not.toThrow();
    }
  });
});

describe('dagvelger og ukeplan-datoer', () => {
  it('kaster ikke på rare datoer', () => {
    // weekStart/isoWeek får en dato fra plan_date, som er `date not null`
    // i basen — men jsonb-planen i meal_week_templates og den
    // mellomlagrede planen har ingen slik garanti.
    for (const d of ['2026-09-03', '', 'ikke-en-dato', '2026-13-45', null, undefined]) {
      expect(() => weekStart(d), `weekStart(${String(d)})`).not.toThrow();
      expect(() => isoWeek(d), `isoWeek(${String(d)})`).not.toThrow();
    }
    // pickerDays tar PLANEN, ikke en dato.
    expect(() => pickerDays(STYGGE_PLANDAGER)).not.toThrow();
    expect(() => pickerDays([])).not.toThrow();
    expect(() => weekGroups(pickerDays(STYGGE_PLANDAGER))).not.toThrow();
    for (const p of STYGGE_PLANDAGER) expect(() => dayNote(p)).not.toThrow();
    expect(() => moveRows(STYGGE_VARER, 0, 1)).not.toThrow();
  });
});

describe('varekatalog og gjenkjenning', () => {
  it('kaster ikke', () => {
    tålerAlt('isPackUnit', isPackUnit, 1);
    tålerAlt('piecesPerPack', piecesPerPack, 1);
    tålerAlt('guessCategory', guessCategory, 1);
    tålerAlt('guessUnit', guessUnit, 1);
    for (const v of RARE_VERDIER) expect(() => normalizeName(v, new Map()), `normalizeName(${String(v)})`).not.toThrow();
    tålerAlt('parseSpeech', parseSpeech, 1);
    tålerAlt('packSizeFor', packSizeFor, 3);
    for (const v of RARE_VERDIER) {
      expect(() => resolveCatalogItem(v, [], new Map()), `resolveCatalogItem(${String(v)})`).not.toThrow();
      expect(() => searchCatalog(v, []), `searchCatalog(${String(v)})`).not.toThrow();
    }
    // En katalog med ødelagte rader er det farligste: den er FELLES for
    // alle familier, og natt-gjennomgangen skriver i den.
    const STYGG_KATALOG = [
      {}, { name: null }, { name: '', major_category: null, avg_price: null },
      { name: 42, avg_price: -1, price_low: 1e9, price_high: null },
      { name: 'Melk', avg_price: 22, avg_price_unit: 42, score: null },
    ];
    expect(() => resolveCatalogItem('melk', STYGG_KATALOG, new Map())).not.toThrow();
    expect(() => searchCatalog('mel', STYGG_KATALOG)).not.toThrow();
    expect(() => frequentMissing(STYGG_KATALOG, STYGGE_VARER)).not.toThrow();
  });
});

describe('formatering, enheter og butikkruter', () => {
  it('kaster ikke', () => {
    for (const f of [num, kr, purchases, stepQty, weekdayName, dayLabel, shortDate, longDate]) {
      tålerAlt(f.name, f, 2);
    }
    // tripName har en standardverdi og kalles alltid uten argument.
    expect(() => tripName()).not.toThrow();
    expect(() => tripName(new Date('2026-09-03'))).not.toThrow();
    for (const i of STYGGE_VARER) {
      expect(() => estimateCost(i)).not.toThrow();
      expect(() => qtyDetail(i)).not.toThrow();
      expect(() => unitPrice(i)).not.toThrow();
    }
    for (const f of [normalizeUnit, unitFamily, parseQty, tidyUnit]) tålerAlt(f.name, f, 1);
    tålerAlt('convertQty', convertQty, 3);
    tålerAlt('storeKey', storeKey, 1);
    tålerAlleLister('observedRoute', (l) => observedRoute(l, 'Coop Extra'));
    tålerAlleLister('routedStores', (l) => routedStores(l));
    expect(() => routeInfo(STYGGE_VARER, 'Coop Extra')).not.toThrow();
  });
});

describe('import, skanning og eksterne oppskrifter', () => {
  it('Keep-import kaster ikke', () => {
    tålerAlt('parseImportLine', parseImportLine, 1);
    // classifyLine(rad, katalog) — raden kommer fra parseImportLine, som
    // alltid gir et objekt; det er FELTENE i den som kan være rare.
    for (const v of RARE_VERDIER) {
      expect(() => classifyLine({ name: v, qty: v, unit: v }, [], new Map()), `classifyLine navn ${String(v)}`).not.toThrow();
      expect(() => toShoppingRow({ name: v, qty: v, unit: v }, [], new Map())).not.toThrow();
    }
    for (const t of [null, undefined, '', 'Melk\nEgg\n\n- Ost', 42]) {
      expect(() => processImport(t, [], new Map()), `processImport(${String(t)})`).not.toThrow();
    }
  });

  it('kundeavis-rader kaster ikke', () => {
    for (const o of STYGGE_TILBUD) expect(() => classifyFlyerRow(o)).not.toThrow();
    // Kallstedet gjør `data?.rows ?? []` og sjekker .length, så det er
    // alltid en liste — men radene inni er lest ut av et bilde.
    expect(() => filterFlyerRows(STYGGE_TILBUD)).not.toThrow();
    expect(() => filterFlyerRows([])).not.toThrow();
  });

  it('eksterne ingredienser kaster ikke', () => {
    tålerAlt('parseIngredientLine', parseIngredientLine, 1);
    tålerAlt('translateName', translateName, 1);
    tålerAlt('tidyTitle', tidyTitle, 1);
    tålerAlt('normalizeServings', normalizeServings, 1);
    tålerAlt('scaleFactor', scaleFactor, 2);
    // JSON-LD på eksterne oppskriftssider har ofte recipeIngredient som
    // ÉN streng, ett objekt eller et tall — ikke en liste av strenger.
    for (const v of RARE_VERDIER) {
      expect(() => normalizeExternalIngredient(v, [], new Map()), `ingrediens ${String(v)}`).not.toThrow();
    }
    for (const l of [[], ['2 dl melk'], [null], [{}], [42]]) {
      expect(() => normalizeExternalIngredients(l, [], new Map()), `liste ${JSON.stringify(l)}`).not.toThrow();
    }
  });

  it('Kassalapp-rangering kaster ikke', () => {
    const STYGGE_PRODUKTER = [
      {}, { name: null, current_price: null }, { name: '', current_price: 0 },
      { name: 42, current_price: -1, brand: null }, { name: 'Melk 1l', current_price: '22,90' },
    ];
    for (const p of STYGGE_PRODUKTER) {
      for (const v of RARE_VERDIER) expect(() => rank(p, v)).not.toThrow();
    }
    // rankProducts(søk, produkter) — søket først.
    expect(() => rankProducts('melk', STYGGE_PRODUKTER)).not.toThrow();
    expect(() => rankProducts('', [])).not.toThrow();
  });

  it('eksterne lenker kaster ikke', () => {
    tålerAlt('safeUrl', safeUrl, 1);
  });
});

describe('ernæring og tilbudsmatching', () => {
  it('kaster ikke', () => {
    tålerAlt('gramsOf', gramsOf, 3);
    for (const a of ['melk', '', 'æøå']) for (const b of ['melk', '', '2']) expect(() => stemEq(a, b)).not.toThrow();
    tålerAlt('nameHit', nameHit, 2);
    tålerAlt('ingredientWeight', ingredientWeight, 1);
    tålerAlt('packSizeFromName', packSizeFromName, 1);
    tålerAlt('sourceLabel', sourceLabel, 1);
    tålerAlt('validLabel', validLabel, 1);
    // coverageLabel/savingLabel/storeLabel tar resultatet av scoreMeal,
    // og scoreMeal kan returnere null — men alle tre kallstedene sjekker
    // det først (planner.js:239, og listene er filtrert). Derfor testes
    // de med ekte scoreMeal-resultater, ikke med null.
    for (const m of STYGGE_MIDDAGER) {
      const sc = scoreMeal(m, STYGGE_TILBUD);
      if (!sc) continue;
      expect(() => coverageLabel(sc)).not.toThrow();
      expect(() => savingLabel(sc)).not.toThrow();
      expect(() => storeLabel(sc)).not.toThrow();
    }
    for (const o of STYGGE_TILBUD) {
      expect(() => discountPct(o)).not.toThrow();
      for (const i of STYGGE_INGREDIENSER) expect(() => savingFor(o, i)).not.toThrow();
    }
    // storeConcentration tar TREFF ({offer, ing, …}) fra scoreMeal, ikke
    // tilbud. Derfor testes den med det scoreMeal faktisk produserer.
    expect(() => storeConcentration([])).not.toThrow();
    for (const m of STYGGE_MIDDAGER) {
      const sc = scoreMeal(m, STYGGE_TILBUD);
      if (sc) expect(() => storeConcentration(sc.hits)).not.toThrow();
    }
    for (const m of STYGGE_MIDDAGER) {
      expect(() => nutritionLabel(mealNutrition(m, 4))).not.toThrow();
      // relativeToUsual(kcalPerPortion, alleKcalPerPortion) — et TALL og
      // en LISTE, ikke to næringsobjekter.
      const n = mealNutrition(m, 4);
      expect(() => relativeToUsual(n?.kcalPerPortion, [500, 600, 700, 800, 900])).not.toThrow();
      expect(() => relativeToUsual(n?.kcalPerPortion, [])).not.toThrow();
    }
    for (const v of RARE_VERDIER) {
      expect(() => synonymsOf(v)).not.toThrow();
      expect(() => conceptById(v)).not.toThrow();
      expect(() => isDerivedProduct(v)).not.toThrow();
      expect(() => dishById(v)).not.toThrow();
      expect(() => conceptMatch(v, v)).not.toThrow();
    }
  });
});
