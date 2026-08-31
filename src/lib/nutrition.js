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

/**
 * Grovanslag når oppskriften teller i enheter vi ikke har vekt på.
 *
 * Pakker og bokser er STORE — «1 pk spaghetti» er en halvkilo, ikke en
 * neve. 400 g er samme antakelse som prisestimatet (purchases) bruker, så
 * kalorier og kroner bygger på samme forutsetning. Løse stykker er små.
 */
const PACK_FALLBACK_G = 400;
const PIECE_FALLBACK_G = 100;
const PACK_UNITS = ['pakke', 'pk', 'boks', 'pose', 'glass'];

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

  if (['stk', 'skive', 'fedd'].includes(unit) || PACK_UNITS.includes(unit) || !unit) {
    const per = ing?.pack_size ?? concept?.pack ?? (PACK_UNITS.includes(unit) ? null : concept?.g);
    if (Number(per) > 0) return qty * Number(per);
    if (unit === 'fedd') return qty * 5;
    return qty * (PACK_UNITS.includes(unit) ? PACK_FALLBACK_G : PIECE_FALLBACK_G);
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
  let resolved = 0;           // alle rader vi klarte, krydder inkludert
  let countedTotal = 0;       // rader som SKAL telle i dekningen
  let countedHit = 0;         // …og hvor mange av dem vi klarte
  let bearingSeen = false;    // fantes det en bærende vare vi klarte?
  let bearingLost = false;    // …og en vi ikke klarte
  const unresolved = [];

  for (const ing of ings) {
    const name = ingName(ing);
    const c = conceptFor(name);
    const grams = c ? gramsOf(ing, c) : null;

    // Krydder, vann og salt betyr ingenting for tallet. De er verken et
    // hull i dekningen eller en del av nevneren — ellers blir en oppskrift
    // med tre krydder «usikker» selv når alt annet gikk perfekt.
    const bare = name.toLowerCase().trim();
    const trivial = c?.role === 'background' || !bare || NOISE.has(bare);
    if (!trivial) countedTotal += 1;

    if (c && grams !== null) {
      kcal += (c.kcal * grams) / 100;
      protein += (c.protein * grams) / 100;
      resolved += 1;
      if (!trivial) countedHit += 1;
      if (c.role === 'bearing') bearingSeen = true;
      continue;
    }

    if (trivial) continue;
    unresolved.push(name);

    // Bommer vi på noe stort, er tallet meningsløst lavt. Vekten avgjør,
    // ikke ordene: en ukjent rad på 500 g er et hull, «1 neve reker» som
    // pynt er det ikke. Uten konsept regner gramsOf fortsatt ut g/kg.
    if (c?.role === 'bearing' || (gramsOf(ing, null) ?? 0) >= 200) bearingLost = true;
  }

  if (!resolved) return null;

  // Ett tapt garnityr skal ikke slette hele tallet — men mister vi den
  // eneste bærende varen, har vi ingenting å si.
  const bearingMissing = bearingLost && !bearingSeen;

  const p = Number(servings);
  const portions = Number.isFinite(p) && p > 0 ? p : 1;

  // Dekningen teller BARE de radene som betyr noe. Før ble hvert løste
  // krydder lagt til i telleren, så en wok med fire krydder og fire tapte
  // hovedvarer kunne stå med «beregnet fra 5 av 5 ingredienser» — samtidig
  // som forklaringen under listet opp de fire som manglet.
  const total = Math.max(1, countedTotal);
  const dekning = countedHit / total;

  return {
    kcal: Math.round(kcal),
    protein: Math.round(protein),
    perPortion: { kcal: Math.round(kcal / portions), protein: Math.round(protein / portions) },
    resolved: countedHit,
    total,
    unresolved,
    bearingMissing,
    reliable: !bearingMissing && dekning >= 0.6,
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
    sub: `per porsjon · ${n.perPortion.protein > 0 ? `${n.perPortion.protein} g protein · ` : ''}beregnet fra ${n.resolved} av ${n.total} ingredienser`,
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
