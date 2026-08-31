// Kalorier per porsjon — som et nøytralt faktum ved siden av prisen.
//
// Tre regler dette laget er bygget etter, og som ikke skal vike:
//
//   1. Ingen dom. Ingen fargekoder, ingen «sunt/usunt», ingen dagsbudsjett
//      eller sum over uka. I det øyeblikket appen begynner å telle dagen
//      din, er den en slankeapp — og det skal denne ikke være.
//   2. Av som standard. Den som ikke slår det på i Preferanser skal aldri
//      se et kilokalori-tall noe sted.
//   3. Aldri et tall vi ikke kan forsvare. Klarer vi bare 6 av 9
//      ingredienser, står det at vi klarte 6 av 9. Klarer vi ikke den
//      bærende ingrediensen, viser vi ingenting i det hele tatt.
//
// Kildene for selve tallene ligger i foodConcepts.js — se merknaden der om
// at de er anslag inntil Matvaretabellen er importert.

import { conceptFor } from './foodConcepts.js';
import { NOISE } from './offerMatch.js';

/** Omregning til gram for mål som ikke oppgir vekt direkte. */
const VOLUME_ML = { dl: 100, cl: 10, ml: 1, liter: 1000, l: 1000, ss: 15, ts: 5, kopp: 240 };

/** Grovanslag når en oppskrift teller i biter av noe vi ikke har stk-vekt på. */
const PIECE_FALLBACK_G = 100;

/**
 * Hvor mange gram en ingrediensrad utgjør. Returnerer null når vi ikke kan
 * vite det — da telles raden som uløst i stedet for å gjettes inn i summen.
 */
export function gramsOf(ing, concept) {
  const qty = Number(ing?.qty);
  const unit = String(ing?.unit ?? '').toLowerCase();
  if (!Number.isFinite(qty) || qty <= 0) return null;

  if (unit === 'g') return qty;
  if (unit === 'kg') return qty * 1000;

  if (VOLUME_ML[unit] !== undefined) {
    // Væsketetthet settes til 1 g/ml. Feilen er liten for melk, fløte og
    // olje, og alternativet er å droppe halve oppskriften.
    return qty * VOLUME_ML[unit];
  }

  if (['stk', 'pakke', 'pk', 'boks', 'pose', 'glass', 'skive', 'fedd'].includes(unit) || !unit) {
    const per = ing?.pack_size ?? concept?.g;
    if (Number(per) > 0) return qty * Number(per);
    if (unit === 'fedd') return qty * 5;
    return qty * PIECE_FALLBACK_G;
  }

  return null;   // neve, klype, bunt … for upresist til å telle
}

const ingName = (ing) => String(ing?.n ?? ing?.name ?? '');

function ingredientsOf(meal) {
  const raw = Array.isArray(meal?.ingredients) ? meal.ingredients
    : Array.isArray(meal?.raw_ingredients) ? meal.raw_ingredients
      : [];
  return raw.map((i) => (typeof i === 'string' ? { n: i } : i)).filter((i) => ingName(i));
}

/**
 * Næringsinnhold for en hel rett.
 *
 * @param {object} meal            middagen, med ingredients eller raw_ingredients
 * @param {number} servings        hvor mange porsjoner mengdene rekker til
 * @returns {{kcal, protein, perPortion, resolved, total, unresolved, bearingMissing, reliable}|null}
 *   perPortion er {kcal, protein}. `reliable` er false når vi bommet på
 *   noe vesentlig — da skal tallet enten skjules eller merkes tydelig.
 */
export function mealNutrition(meal, servings = 4) {
  const ings = ingredientsOf(meal);
  if (!ings.length) return null;

  let kcal = 0;
  let protein = 0;
  let resolved = 0;
  let bearingMissing = false;
  const unresolved = [];

  for (const ing of ings) {
    const c = conceptFor(ingName(ing));
    const grams = c ? gramsOf(ing, c) : null;
    if (!c || grams === null) {
      // Rene krydder teller ikke som et hull — de betyr ingenting for tallet.
      const bare = ingName(ing).toLowerCase().trim();
      const trivial = c?.role === 'background' || !bare || NOISE.has(bare);
      if (!trivial) unresolved.push(ingName(ing));
      continue;
    }
    kcal += (c.kcal * grams) / 100;
    protein += (c.protein * grams) / 100;
    resolved += 1;
  }

  if (!resolved) return null;

  // Mangler vi den bærende ingrediensen, er tallet meningsløst lavt.
  for (const ing of ings) {
    const c = conceptFor(ingName(ing));
    if (c?.role === 'bearing' && gramsOf(ing, c) === null) bearingMissing = true;
    if (!c && /kjøtt|kylling|fisk|laks|deig/i.test(ingName(ing))) bearingMissing = true;
  }

  const p = Math.max(1, Number(servings) || 1);
  return {
    kcal: Math.round(kcal),
    protein: Math.round(protein),
    perPortion: { kcal: Math.round(kcal / p), protein: Math.round(protein / p) },
    resolved,
    total: ings.length,
    unresolved,
    bearingMissing,
    reliable: !bearingMissing && resolved / ings.length >= 0.6,
  };
}

/**
 * «Ca. 640 kcal per porsjon» — eller null når vi ikke bør si noe.
 * Aldri et blankt tall: dekningen følger alltid med i `detail`.
 */
export function nutritionLabel(n) {
  if (!n || n.bearingMissing) return null;
  return {
    main: `ca. ${n.perPortion.kcal.toLocaleString('nb-NO')} kcal`,
    sub: `per porsjon · ${n.protein > 0 ? `${n.perPortion.protein} g protein · ` : ''}beregnet fra ${n.resolved} av ${n.total} varer`,
    reliable: n.reliable,
  };
}

/**
 * «Lettere enn dere pleier» — sammenlignet med husholdningens EGNE middager,
 * ikke mot en kostholdsnorm. Vi har ikke grunnlag for å felle den dommen,
 * og skal ikke prøve.
 *
 * @returns {'lettere'|'som vanlig'|'tyngre'|null}
 */
export function relativeToUsual(kcalPerPortion, allKcalPerPortion) {
  const xs = (allKcalPerPortion ?? []).filter((x) => Number(x) > 0).sort((a, b) => a - b);
  if (xs.length < 5 || !(kcalPerPortion > 0)) return null;
  const q = (f) => xs[Math.min(xs.length - 1, Math.floor(xs.length * f))];
  if (kcalPerPortion <= q(0.33)) return 'lettere';
  if (kcalPerPortion >= q(0.67)) return 'tyngre';
  return 'som vanlig';
}

// ── På/av ────────────────────────────────────────────────────────────────
// Bevisst en PERSONLIG innstilling i nettleseren, ikke en husholdnings-
// innstilling i databasen: i samme familie kan én være interessert i
// kalorier og en annen ikke. Av som standard.
const PREF_KEY = 'pl.nutrition';

export function loadNutritionPref() {
  try { return localStorage.getItem(PREF_KEY) === '1'; } catch { return false; }
}

export function saveNutritionPref(on) {
  try { localStorage.setItem(PREF_KEY, on ? '1' : '0'); } catch { /* ignorer */ }
}
