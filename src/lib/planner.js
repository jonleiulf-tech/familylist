// «Generer plan» — fyller tomme middagsdager fra regler og historikk.
//
// Prioritetsrekkefølge, og grunnen til at den er slik:
//   1. Ukedagsregler er harde («taco fredag»). Bryter vi dem, føles planen feil.
//   2. Minimumsregler er kvoter («fisk 2× i uka»). De må oppfylles, men når
//      på uka spiller ingen rolle — derfor kommer de etter ukedagene.
//   3. Resten fylles med variasjon, vektet mot middager familien faktisk spiser.
//
// Låste og allerede spiste dager røres aldri.

import { scoreMeal, coverageLabel } from './offerMeals.js';
import { mealNutrition } from './nutrition.js';
import { lower, sameName } from './text.js';

/**
 * Hvordan de LEDIGE dagene fylles. Reglene er harde uansett modus — en
 * modus bytter bare rekkefølgen middagene vurderes i, den overstyrer
 * aldri «taco fredag» eller «fisk 2× i uka».
 *
 * Ingen av modusene er en dom over de andre. «Lettere» er målt mot
 * husholdningens egne middager, ikke mot en kostholdsnorm — vi har ikke
 * grunnlag for å kalle noe sunt eller usunt, og prøver ikke.
 */
export const PLAN_MODES = [
  { id: 'variert', label: 'Mer variert', hint: 'Lengst siden sist — bryter opp vanene' },
  { id: 'billigst', label: 'Billigste uke', hint: 'Middager der flere av ingrediensene er på tilbud nå' },
  { id: 'lettere', label: 'Lettere uke', hint: 'Deres egne middager med lavest kalorianslag per porsjon først' },
];

const WEEKDAY = { SØNDAG: 0, MANDAG: 1, TIRSDAG: 2, ONSDAG: 3, TORSDAG: 4, FREDAG: 5, LØRDAG: 6 };

/** Passer middagen til det regelen gjelder? Matcher kategori, navn og ingredienser. */
export function mealMatchesScope(meal, scope) {
  // lower() overalt, ikke (x || '').toLowerCase().
  //
  // `|| ''` fanger null og tom streng — men ikke en verdi som ikke er
  // tekst, og da kaster .toLowerCase() likevel. Middagene kommer fra
  // meals.ingredients, som er jsonb, og fra det mellomlagrede
  // øyeblikksbildet i localStorage. Ingen av dem lover at feltene er
  // tekst. lower() tåler alt.
  const s = lower(scope).trim();
  if (!s) return false;
  if (lower(meal?.category) === s) return true;
  if (lower(meal?.name).includes(s)) return true;
  const ing = Array.isArray(meal?.ingredients) ? meal.ingredients : [];
  return ing.some((i) => lower(i?.n).includes(s));
}

const dayOfWeek = (isoDate) => new Date(`${isoDate}T00:00:00`).getDay();

/** En dag er ledig hvis den ikke er låst, ikke spist og ikke hoppet over. */
const isOpen = (day) => !day.locked && !day.done && !day.skipped && !day.meal_name;

const DAY = 86400000;

/**
 * Historikken kan være rene navn (eldst API) eller {name, date}.
 * Normaliseres til {name, days} — dager siden servert. Uten dato brukes
 * plassen i lista som tilnærming (nyest først).
 */
function normalizeHistory(history, today) {
  const now = new Date(today).getTime();
  return (history ?? []).map((entry, idx) => {
    if (typeof entry === 'string') return { name: entry, days: idx };
    const when = entry.date ? new Date(`${entry.date}T12:00:00`).getTime() : null;
    return { name: entry.name, days: when === null ? idx : Math.max(0, Math.round((now - when) / DAY)) };
  });
}

/** Dager siden middagen sist var spist. Ukjent = aldri = maksimal avstand. */
function daysSinceLastServed(name, history) {
  const hit = history.find((h) => sameName(h.name, name));
  return hit ? hit.days : Infinity;
}

/**
 * Genererer forslag til de tomme dagene.
 *
 * @param {object[]} plan     dagene i planen, {plan_date, meal_name, locked, done, skipped}
 * @param {object[]} meals    tilgjengelige middager, {name, category, ingredients}
 * @param {object[]} rules    {scope, rule_type: 'min'|'max'|'weekday', amount, weekdays[], enabled}
 * @param {string[]} history  tidligere spiste middager, nyeste først
 * @param {function} random   0..1, injiserbar for forutsigbare tester
 * @returns {{plan_date, meal_name, reason}[]} kun dagene som ble fylt
 */
export function generatePlan({
  plan, meals, rules = [], history: rawHistory = [], random = Math.random, today,
  mode = 'variert', offers = [], servings = 4,
}) {
  if (!meals.length) return [];

  // Datoanker for «dager siden»: planens første dag, eller nå.
  const anchor = today ?? plan[0]?.plan_date ?? new Date();
  const history = normalizeHistory(rawHistory, anchor);

  const active = rules.filter((r) => r.enabled !== false);
  const openDays = plan.filter(isOpen).map((d) => d.plan_date).sort();
  if (!openDays.length) return [];

  const assigned = new Map();          // plan_date -> {meal_name, reason}
  // Middager som allerede står i planen teller mot kvotene og mot gjentakelse.
  const alreadyPlanned = plan.filter((d) => d.meal_name && !d.skipped).map((d) => d.meal_name);
  const used = [...alreadyPlanned];

  const take = (date, meal, reason) => {
    assigned.set(date, { plan_date: date, meal_name: meal.name, reason });
    used.push(meal.name);
  };

  const stillOpen = () => openDays.filter((d) => !assigned.has(d));

  // --- 1. Ukedagsregler ------------------------------------------------------
  for (const rule of active.filter((r) => r.rule_type === 'weekday')) {
    const wanted = (rule.weekdays || []).map(Number);
    const candidates = meals.filter((m) => mealMatchesScope(m, rule.scope));
    if (!candidates.length) continue;

    for (const date of stillOpen()) {
      if (!wanted.includes(dayOfWeek(date))) continue;
      // Foretrekk den kandidaten som er lengst siden sist.
      const pick = [...candidates].sort(
        (a, b) => daysSinceLastServed(b.name, history) - daysSinceLastServed(a.name, history),
      )[0];
      take(date, pick, `Regel: ${rule.scope} på denne ukedagen`);
    }
  }

  // --- 2. Minimumsregler -----------------------------------------------------
  for (const rule of active.filter((r) => r.rule_type === 'min')) {
    const target = Number(rule.amount) || 1;
    const have = used.filter((name) => {
      const m = meals.find((x) => x.name === name);
      return m && mealMatchesScope(m, rule.scope);
    }).length;

    let missing = target - have;
    if (missing <= 0) continue;

    const candidates = meals
      .filter((m) => mealMatchesScope(m, rule.scope))
      .filter((m) => !used.includes(m.name))
      .sort((a, b) => daysSinceLastServed(b.name, history) - daysSinceLastServed(a.name, history));

    for (const date of stillOpen()) {
      if (missing <= 0) break;
      const pick = candidates.shift();
      if (!pick) break;
      take(date, pick, `Regel: minst ${target} ${lower(rule.scope)} i uka`);
      missing -= 1;
    }
  }

  // --- 2b. Intervallregler -----------------------------------------------------
  // «Pannekaker ca. hver 2. uke»: skal inn i planen bare når det er lenge
  // nok siden sist, og aldri dobbelt i samme plan.
  for (const rule of active.filter((r) => r.rule_type === 'interval')) {
    const staleAfter = (Number(rule.amount) || 2) * 7;
    const candidates = meals.filter((m) => mealMatchesScope(m, rule.scope));
    if (!candidates.length) continue;

    const alreadyInPlan = used.some((name) => {
      const m = meals.find((x) => x.name === name);
      return m && mealMatchesScope(m, rule.scope);
    });
    if (alreadyInPlan) continue;

    const freshest = Math.min(...candidates.map((m) => daysSinceLastServed(m.name, history)));
    if (freshest < staleAfter) continue;   // nylig servert — vent

    const date = stillOpen()[0];
    if (!date) break;
    const pick = [...candidates].sort(
      (a, b) => daysSinceLastServed(b.name, history) - daysSinceLastServed(a.name, history),
    )[0];
    take(date, pick, freshest === Infinity
      ? `Regel: ${rule.scope} ca. hver ${rule.amount}. uke — ikke servert på lenge`
      : `Regel: ${rule.scope} ca. hver ${rule.amount}. uke — sist for ${freshest} dager siden`);
  }

  // --- 3. Resten: variasjon --------------------------------------------------
  // Maksregler filtrerer bort kategorier som alt har nådd taket sitt.
  const maxRules = active.filter((r) => r.rule_type === 'max');
  const overMax = (meal) => maxRules.some((rule) => {
    if (!mealMatchesScope(meal, rule.scope)) return false;
    const count = used.filter((name) => {
      const m = meals.find((x) => x.name === name);
      return m && mealMatchesScope(m, rule.scope);
    }).length;
    return count >= (Number(rule.amount) || 0);
  });

  // Forhåndsregnede tall for de modusene som trenger dem. Gjøres én gang,
  // ikke per dag — scoreMeal går gjennom alle tilbudene.
  const savings = new Map();
  const kcals = new Map();
  if (mode === 'billigst' && offers.length) {
    for (const m of meals) {
      const sc = scoreMeal(m, offers);
      if (sc && (sc.bearingHits > 0 || sc.coverage >= 0.25)) savings.set(m.name, sc);
    }
  }
  if (mode === 'lettere') {
    for (const m of meals) {
      // Hver oppskrift deles på SIN egen basis. Brukte vi samme nevner for
      // alle, ville sorteringen vært identisk med å sortere på oppskriftens
      // totale kalorier — og en rett skrevet for 8 ville alltid tapt mot en
      // skrevet for 2, uansett hvor lett den er per porsjon.
      const n = mealNutrition(m, m.base_servings || servings);
      if (n && !n.bearingMissing) kcals.set(m.name, n.perPortion.kcal);
    }
  }

  for (const date of stillOpen()) {
    const pool = meals
      .filter((m) => !used.includes(m.name))
      .filter((m) => !overMax(m));

    // Har vi gått tom for ubrukte middager, tillat gjentak — men ta den
    // som er lengst siden sist, så planen ikke blir to like dager på rad.
    const source = pool.length ? pool : meals.filter((m) => !overMax(m));
    if (!source.length) break;

    const freshness = (a, b) => daysSinceLastServed(b.name, history) - daysSinceLastServed(a.name, history);

    let ranked;
    let reason;
    if (mode === 'billigst' && savings.size) {
      // Middager med tilbud først, resten etter hvor lenge siden sist.
      ranked = [...source].sort((a, b) => {
        const sa = savings.get(a.name);
        const sb = savings.get(b.name);
        if (!sa && !sb) return freshness(a, b);
        if (!sa) return 1;
        if (!sb) return -1;
        return sb.bearingHits - sa.bearingHits || sb.saved - sa.saved || freshness(a, b);
      });
      reason = (m) => {
        const sc = savings.get(m.name);
        if (!sc) return 'Ingen tilbud traff — valgt for variasjon';
        return sc.saved > 0 && sc.savedKnown
          ? `Tilbud nå — sparer ca. kr ${sc.saved.toLocaleString('nb-NO')}`
          : `Tilbud nå — ${coverageLabel(sc)}`;
      };
    } else if (mode === 'lettere' && kcals.size) {
      ranked = [...source].sort((a, b) => {
        const ka = kcals.get(a.name);
        const kb = kcals.get(b.name);
        if (ka === undefined && kb === undefined) return freshness(a, b);
        if (ka === undefined) return 1;
        if (kb === undefined) return -1;
        return ka - kb || freshness(a, b);
      });
      reason = (m) => (kcals.has(m.name)
        ? `Ca. ${kcals.get(m.name).toLocaleString('nb-NO')} kcal per porsjon`
        : 'Kalorier ukjent — valgt for variasjon');
    } else {
      ranked = [...source].sort(freshness);
      reason = () => (pool.length ? 'Variasjon fra middagene deres' : 'Gjentak — få middager å velge blant');
    }

    // Litt tilfeldighet blant de beste, ellers blir hver uke identisk.
    // Smalere vindu i de styrte modusene: der er poenget nettopp å treffe
    // toppen, ikke å variere.
    const width = mode === 'variert' ? 4 : 2;
    const topN = ranked.slice(0, Math.min(width, ranked.length));
    const pick = topN[Math.floor(random() * topN.length)] ?? ranked[0];

    take(date, pick, pool.length ? reason(pick) : 'Gjentak — få middager å velge blant');
  }

  return openDays.filter((d) => assigned.has(d)).map((d) => assigned.get(d));
}

export { WEEKDAY };
