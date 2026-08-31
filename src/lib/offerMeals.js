// Tilbud → middag. Motsatt vei av offerMatch.js, som tar planen din og
// finner tilbudene. Her spør vi: hva BØR du lage denne uka, gitt hva som
// faktisk er billig nå?
//
// Tre ting rangeringen må gjøre riktig, ellers blir den verdiløs:
//
//   1. Telle kroner, ikke treff. Teller vi treff, vinner alltid oppskriften
//      med 25 ingredienser. Vi regner spart beløp: (før − nå) × antall
//      pakker du faktisk må kjøpe.
//   2. Skille bærende fra bakgrunn. Kjøttdeigen bærer tacoen. Er bare
//      hvitløken på tilbud, er ikke tacoen billig — og da skal vi ikke si
//      at den er det.
//   3. Være ærlig om hva vi ikke vet. Mange høstede tilbud mangler
//      original_price. Da vet vi at varen er PÅ tilbud, men ikke hvor mye
//      som spares. Det skal stå, ikke gjettes.

import { nameHit, discountPct, NOISE, words } from './offerMatch.js';
import { purchases } from './format.js';

/**
 * Ingredienser målt i disse enhetene er krydder og småting — de bærer
 * aldri en middag, uansett hvor stor rabatten er.
 */
const BACKGROUND_UNITS = new Set(['ss', 'ts', 'klype', 'dl', 'cl', 'ml', 'fedd', 'neve', 'kvist']);

/** Varegrupper som nesten alltid er hovedsaken i en norsk middag. */
const BEARING_WORDS = [
  'kjøttdeig', 'karbonadedeig', 'kylling', 'laks', 'torsk', 'sei', 'ørret', 'reker',
  'svin', 'storfe', 'biff', 'entrecote', 'koteletter', 'ribbe', 'lam', 'kalkun',
  'pølse', 'bacon', 'skinke', 'kjøtt', 'fisk', 'scampi', 'tofu', 'kikerter', 'linser',
];

/**
 * Hvor mye en ingrediens betyr for retten: 1 = bærende, 0.35 = vanlig,
 * 0 = bakgrunnsstøy vi ikke rangerer på.
 *
 * Vekten avgjør både dekningsgraden og om et treff i det hele tatt får
 * lov til å kalle retten «billig nå».
 */
export function ingredientWeight(ing) {
  const name = String(typeof ing === 'string' ? ing : (ing?.n ?? ing?.name ?? '')).toLowerCase();
  if (!name) return 0;
  const w = words(name).filter((x) => !NOISE.has(x));
  if (!w.length) return 0;                      // bare salt/pepper/vann

  const unit = String(ing?.unit ?? '').toLowerCase();
  if (BACKGROUND_UNITS.has(unit)) return 0.15;  // 2 ss soyasaus teller lite

  if (BEARING_WORDS.some((b) => w.some((x) => x.startsWith(b) || b.startsWith(x)))) return 1;
  return 0.35;
}

/** Kroner spart på ett tilbud, gitt mengden oppskriften trenger. */
export function savingFor(offer, ing) {
  const price = Number(offer?.price);
  const orig = Number(offer?.original_price);
  if (!(price > 0) || !(orig > price)) return null;   // ukjent førpris
  const n = purchases(ing?.qty ?? 1, ing?.unit, offer?.pack_size);
  const saved = (orig - price) * n;
  // Samme vern som estimateCost: et «spart» på titusener er dårlige data.
  return saved > 5000 || saved <= 0 ? null : saved;
}

/** Ingredienslisten på en middag, uansett om den kommer fra oss eller kokeboka. */
function ingredientsOf(meal) {
  const raw = Array.isArray(meal?.ingredients) ? meal.ingredients
    : Array.isArray(meal?.raw_ingredients) ? meal.raw_ingredients
      : [];
  return raw.map((ing) => (typeof ing === 'string' ? { n: ing } : ing)).filter((i) => i?.n ?? i?.name);
}

const ingName = (ing) => String(ing?.n ?? ing?.name ?? '');

/**
 * Butikkonsentrasjon: den kjeden som dekker flest av treffene. Poenget
 * som ingen andre gir deg — «alt til taco på Coop Extra» er verdt mer enn
 * fire tilbud spredt på fire butikker du ikke gidder å kjøre innom.
 */
export function storeConcentration(hits) {
  if (!hits.length) return null;
  const byStore = new Map();
  for (const h of hits) {
    const code = h.offer.store_code || h.offer.store_name;
    if (!code) continue;
    const cur = byStore.get(code) ?? { code, name: h.offer.store_name || code, count: 0 };
    cur.count += 1;
    byStore.set(code, cur);
  }
  if (!byStore.size) return null;
  const best = [...byStore.values()].sort((a, b) => b.count - a.count)[0];
  return { ...best, share: best.count / hits.length, stores: byStore.size };
}

/**
 * Scorer ÉN middag mot aktive tilbud.
 *
 * @returns {{meal, hits, coverage, bearingHits, saved, savedKnown, store}}
 *   coverage er vektet andel av oppskriften som er på tilbud (0–1).
 *   savedKnown er false når minst ett treff mangler førpris — da er
 *   `saved` et minstebeløp, ikke fasiten.
 */
export function scoreMeal(meal, offers) {
  const ings = ingredientsOf(meal);
  if (!ings.length) return null;

  let weightTotal = 0;
  let weightHit = 0;
  let saved = 0;
  let savedKnown = true;
  let bearingHits = 0;
  const hits = [];
  const usedOffers = new Set();

  for (const ing of ings) {
    const weight = ingredientWeight(ing);
    weightTotal += weight;
    if (weight <= 0) continue;

    // Beste tilbud for denne ingrediensen: størst rabatt, så lavest pris.
    let best = null;
    for (const offer of offers) {
      if (usedOffers.has(offer.id)) continue;
      const offerName = offer.match_name || offer.product_name || offer.name;
      if (!nameHit(ingName(ing), offerName)) continue;
      const pct = discountPct(offer);
      if (!best || pct > best.pct || (pct === best.pct && Number(offer.price) < Number(best.offer.price))) {
        best = { offer, pct };
      }
    }
    if (!best) continue;

    usedOffers.add(best.offer.id);
    weightHit += weight;
    if (weight >= 1) bearingHits += 1;
    const s = savingFor(best.offer, ing);
    if (s === null) savedKnown = false; else saved += s;
    hits.push({ offer: best.offer, ingredient: ingName(ing), pct: best.pct, saved: s, weight });
  }

  if (!hits.length) return null;

  return {
    meal,
    hits,
    coverage: weightTotal > 0 ? weightHit / weightTotal : 0,
    bearingHits,
    saved: Math.round(saved),
    savedKnown,
    store: storeConcentration(hits),
    ingredientCount: ings.length,
  };
}

/**
 * Rangerer middager etter hvor billige de er akkurat nå.
 *
 * Terskelen finnes med vilje: en rett der bare paprikaen er på tilbud er
 * ikke «billig nå», og å påstå det én gang er nok til å miste tilliten.
 * Derfor kreves enten et bærende treff eller reell dekning.
 */
export function rankMealsByOffers(meals, offers, { limit = 12, minCoverage = 0.25 } = {}) {
  if (!meals?.length || !offers?.length) return [];
  const scored = [];
  for (const meal of meals) {
    const s = scoreMeal(meal, offers);
    if (!s) continue;
    if (s.bearingHits === 0 && s.coverage < minCoverage) continue;
    scored.push(s);
  }
  return scored
    .sort((a, b) => (
      b.bearingHits - a.bearingHits
      || b.saved - a.saved
      || b.coverage - a.coverage
    ))
    .slice(0, limit);
}

/** «4 av 9 varer på tilbud» — dekningen sagt ærlig, uten prosentpynt. */
export function coverageLabel(s) {
  return `${s.hits.length} av ${s.ingredientCount} varer på tilbud`;
}

/**
 * Besparelsen formulert så den aldri lover mer enn vi vet.
 * Uten førpris på alle treff blir det «minst kr X», ikke «kr X».
 */
export function savingLabel(s) {
  if (!s.saved) return s.savedKnown ? null : 'på tilbud nå';
  return `${s.savedKnown ? 'Sparer ca. ' : 'Sparer minst '}kr ${s.saved.toLocaleString('nb-NO')}`;
}

/** «Alt hos REMA 1000» / «3 av 4 hos COOP EXTRA» — eller null om spredt. */
export function storeLabel(s) {
  const st = s.store;
  if (!st || st.count < 2) return null;
  if (st.share === 1) return `Alt hos ${st.name}`;
  if (st.share >= 0.6) return `${st.count} av ${s.hits.length} hos ${st.name}`;
  return null;
}
