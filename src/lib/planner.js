// «Generer plan» — fyller tomme middagsdager fra regler og historikk.
//
// Prioritetsrekkefølge, og grunnen til at den er slik:
//   1. Ukedagsregler er harde («taco fredag»). Bryter vi dem, føles planen feil.
//   2. Minimumsregler er kvoter («fisk 2× i uka»). De må oppfylles, men når
//      på uka spiller ingen rolle — derfor kommer de etter ukedagene.
//   3. Resten fylles med variasjon, vektet mot middager familien faktisk spiser.
//
// Låste og allerede spiste dager røres aldri.

const WEEKDAY = { SØNDAG: 0, MANDAG: 1, TIRSDAG: 2, ONSDAG: 3, TORSDAG: 4, FREDAG: 5, LØRDAG: 6 };

/** Passer middagen til det regelen gjelder? Matcher kategori, navn og ingredienser. */
export function mealMatchesScope(meal, scope) {
  const s = String(scope || '').trim().toLowerCase();
  if (!s) return false;
  if ((meal.category || '').toLowerCase() === s) return true;
  if ((meal.name || '').toLowerCase().includes(s)) return true;
  return (meal.ingredients || []).some((ing) =>
    String(ing.n || '').toLowerCase().includes(s));
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
  const hit = history.find((h) => h.name.toLowerCase() === String(name).toLowerCase());
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
      take(date, pick, `Regel: minst ${target} ${rule.scope.toLowerCase()} i uka`);
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

  for (const date of stillOpen()) {
    const pool = meals
      .filter((m) => !used.includes(m.name))
      .filter((m) => !overMax(m));

    // Har vi gått tom for ubrukte middager, tillat gjentak — men ta den
    // som er lengst siden sist, så planen ikke blir to like dager på rad.
    const source = pool.length ? pool : meals.filter((m) => !overMax(m));
    if (!source.length) break;

    const ranked = [...source].sort(
      (a, b) => daysSinceLastServed(b.name, history) - daysSinceLastServed(a.name, history),
    );
    // Litt tilfeldighet blant de beste, ellers blir hver uke identisk.
    const topN = ranked.slice(0, Math.min(4, ranked.length));
    const pick = topN[Math.floor(random() * topN.length)] ?? ranked[0];

    take(date, pick, pool.length ? 'Variasjon fra middagene deres' : 'Gjentak — få middager å velge blant');
  }

  return openDays.filter((d) => assigned.has(d)).map((d) => assigned.get(d));
}

export { WEEKDAY };
