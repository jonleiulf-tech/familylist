// Kobler ukens middagsplan mot aktive tilbud: «kjøttdeigen til torsdagens
// taco er på tilbud hos REMA». Selve forretningsideen, vist på Hjem.

// Ingredienser som matcher «alt» og bare gir støy.
export const NOISE = new Set([
  'salt', 'pepper', 'vann', 'olje', 'sukker', 'smør', 'margarin',
  'hvetemel', 'krydder', 'persille', 'gressløk', 'hvitløk',
]);

export const words = (s) => String(s ?? '')
  .toLowerCase()
  .split(/[^a-zæøåé]+/)
  // 3 bokstaver med: ellers matcher aldri løk, egg, ost, ris — blant de
  // vanligste norske varene. stemEq krever uansett god overlapp.
  .filter((w) => w.length >= 3);

/**
 * To ord regnes like når det ene er en forstavelse av det andre —
 * «laks» treffer «laksefilet», «kylling» treffer «kyllingfilet» — men
 * ikke når resten er et helt annet ord («melk» skal ikke treffe
 * «melkesjokolade», derfor taket på lengdeforskjellen).
 */
export const stemEq = (a, b) => {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return long.startsWith(short) && long.length - short.length <= 6;
};

export const nameHit = (ingredientName, offerName) => {
  const iw = words(ingredientName).filter((w) => !NOISE.has(w));
  if (!iw.length) return false;
  const ow = words(offerName);
  return iw.some((w) => ow.some((o) => stemEq(w, o)));
};

export const discountPct = (o) => {
  const price = Number(o.price);
  const orig = Number(o.original_price);
  if (!(price > 0) || !(orig > price)) return 0;
  return Math.round(((orig - price) / orig) * 100);
};

/**
 * Finner tilbud som treffer ingredienser i planlagte middager.
 *
 * @returns [{offer, mealName, planDate, ingredientName, pct}] — ett innslag
 *   per tilbud (beste treff), størst rabatt først.
 */
export function matchOffersToPlan(plan, meals, offers) {
  if (!plan?.length || !offers?.length) return [];
  const byName = new Map((meals ?? []).map((m) => [m.name, m]));
  const seen = new Map(); // offer.id → treff

  for (const day of plan) {
    if (!day.meal_name || day.skipped) continue;
    const meal = byName.get(day.meal_name);
    const ingredients = Array.isArray(meal?.ingredients) ? meal.ingredients : [];
    for (const ing of ingredients) {
      // Ingredienser lagres som {n, qty}; noen kilder bruker {name}.
      const ingName = typeof ing === 'string' ? ing : (ing?.n ?? ing?.name);
      if (!ingName) continue;
      for (const offer of offers) {
        if (seen.has(offer.id)) continue;
        // Tilbudsrader heter product_name/match_name, ikke name.
        const offerName = offer.match_name || offer.product_name || offer.name;
        if (nameHit(ingName, offerName)) {
          seen.set(offer.id, {
            offer,
            mealName: day.meal_name,
            planDate: day.plan_date,
            ingredientName: ingName,
            pct: discountPct(offer),
          });
        }
      }
    }
  }

  return [...seen.values()].sort((a, b) =>
    b.pct - a.pct || (Number(a.offer.price) || 1e9) - (Number(b.offer.price) || 1e9));
}
