// Familieporsjoner og skalering av oppskriftsmengder.
//
// Modellen er bevisst enkel nok til å forklares i én setning i appen:
//   – alle som spiser som en voksen teller 1 porsjon
//   – barn som spiser mindre teller en halv porsjon
// Husholdningens profil bor på households (adults / children),
// og hver enkelt middag kan få gjester i tillegg (meal_plan.guest_portions).
//
// Skalering skjer KUN når oppskriften selv oppgir hvor mange porsjoner
// mengdene er til (meals.base_servings). Ukjent basis = faktor 1 — vi
// gjetter aldri.
//
// Profilen bruker households.adults/children som allerede finnes
// (familiestørrelsen fra listeinnstillingene) — én sannhet, to innganger.

/** Husholdningens faste porsjonstall: voksne + barn/2, aldri under 1. */
export function householdPortions(household) {
  const adults = Number(household?.adults ?? 2);
  const kids = Number(household?.children ?? 0);
  const p = (Number.isFinite(adults) ? adults : 2) + (Number.isFinite(kids) ? kids : 0) * 0.5;
  return Math.max(1, p);
}

/** «2 voksne + 2 barn · 3 porsjoner» — til visning i appen. */
export function portionLabel(household) {
  const adults = Number(household?.adults ?? 2);
  const kids = Number(household?.children ?? 0);
  const parts = [`${adults} ${adults === 1 ? 'voksen' : 'voksne'}`];
  if (kids > 0) parts.push(`${kids} barn`);
  const p = householdPortions(household);
  return `${parts.join(' + ')} · ${formatPortions(p)} ${p === 1 ? 'porsjon' : 'porsjoner'}`;
}

/** 3.5 → «3,5», 4 → «4» (norsk desimalkomma, aldri unødige desimaler). */
export function formatPortions(p) {
  const n = Number(p) || 0;
  return (Math.round(n * 10) / 10).toLocaleString('nb-NO');
}

/**
 * Skaleringsfaktor for én middag: (familie + gjester) / oppskriftens basis.
 * Uten kjent basis (base_servings null/0) skaleres det ikke — faktor 1.
 */
export function mealScaleFactor(baseServings, household, guestPortions = 0) {
  const base = Number(baseServings);
  if (!Number.isFinite(base) || base <= 0) return 1;
  const target = householdPortions(household) + (Number(guestPortions) || 0);
  if (target <= 0) return 1;
  return target / base;
}

/**
 * Skaler en mengde og rund pent av: store tall til nærmeste 10 (450 g,
 * ikke 437,5 g), mellomstore til hele, små til kvarte (0,75 dl).
 * null/ukjent mengde forblir null — aldri gjettet.
 */
const COUNT_UNITS = new Set(['stk', 'pakke', 'pk', 'boks', 'pose', 'glass']);

export function scaleQty(qty, factor, unit = null) {
  if (qty == null) return null;
  const q = Number(qty);
  if (!Number.isFinite(q)) return qty;
  const f = Number(factor);
  if (!Number.isFinite(f) || f === 1) return q;
  const scaled = q * f;
  // Telle-enheter (stk, pakke …) må være hele — man kjøper ikke 2,75 pakke.
  if (unit && COUNT_UNITS.has(String(unit).toLowerCase())) {
    return Math.max(1, Math.round(scaled));
  }
  if (scaled >= 100) return Math.round(scaled / 10) * 10;
  if (scaled >= 10) return Math.round(scaled);
  // Små mål (dl, ss, ts): rund til kvart, men aldri helt ned til 0.
  return Math.max(0.25, Math.round(scaled * 4) / 4);
}
