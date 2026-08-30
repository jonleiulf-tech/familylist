// «Hent inspirasjon»-kokeboka: samler oppskriftskandidater fra
//  1) external_recipe_candidates i Supabase — norske kilder (TINE, REMA …)
//     som fylles av høstingen ETTER at kilderevisjonen er godkjent, og
//  2) TheMealDB (åpent API, aktivert i kilderegisteret) — hentes direkte
//     fra brukerens nettleser og oversettes til norsk via ingrediens-ordboka.
//
// Fremgangsmåter lagres aldri — vi lenker ut («Se fremgangsmåte hos …»),
// akkurat som for de norske kildene. Porsjoner antas ALDRI: TheMealDB
// oppgir ikke porsjoner, så de vises som ukjent.

import { getSource } from './sources.js';
import { normalizeExternalIngredients } from './ingredients.js';
import { scaleQty } from '../portions.js';

export const MEALDB_BASE = 'https://www.themealdb.com/api/json/v1/1';

// Kategorichips: norsk etikett → TheMealDB-kategori. Norske kandidater
// filtreres på de samme etikettene via payload.categories.
export const INSPIRATION_CATEGORIES = [
  { label: 'Kylling', mealdb: 'Chicken' },
  { label: 'Kjøtt', mealdb: 'Beef' },
  { label: 'Fisk og sjømat', mealdb: 'Seafood' },
  { label: 'Pasta', mealdb: 'Pasta' },
  { label: 'Vegetar', mealdb: 'Vegetarian' },
  { label: 'Dessert', mealdb: 'Dessert' },
];

const MEALDB_CATEGORY_NO = {
  Chicken: 'Kylling', Beef: 'Kjøtt', Pork: 'Kjøtt', Lamb: 'Kjøtt', Goat: 'Kjøtt',
  Seafood: 'Fisk', Pasta: 'Pasta', Vegetarian: 'Vegetar', Vegan: 'Vegetar',
  Dessert: 'Dessert', Breakfast: 'Frokost', Side: 'Tilbehør', Starter: 'Forrett',
  Miscellaneous: 'Middag',
};

/** Én MealDB-rad → vårt kandidatformat (uten instruksjoner). */
export function mapMealDbMeal(meal) {
  if (!meal?.idMeal || !meal.strMeal) return null;
  const raw = [];
  for (let i = 1; i <= 20; i += 1) {
    const ing = String(meal[`strIngredient${i}`] ?? '').trim();
    if (!ing) continue;
    const measure = String(meal[`strMeasure${i}`] ?? '').trim();
    raw.push(measure ? `${measure} ${ing}` : ing);
  }
  return {
    id: `mealdb-${meal.idMeal}`,
    source_id: 'themealdb',
    source_label: 'TheMealDB',
    name: meal.strMeal,
    category: MEALDB_CATEGORY_NO[meal.strCategory] ?? meal.strCategory ?? 'Middag',
    area: meal.strArea ?? null,
    image_url: meal.strMealThumb ?? null,
    // Porsjoner oppgis ikke av TheMealDB — ukjent, aldri antatt.
    servings: null,
    total_time_minutes: null,
    raw_ingredients: raw,
    instructions_url: meal.strSource || `https://www.themealdb.com/meal/${meal.idMeal}`,
    instructions_link_text: 'Se fremgangsmåte hos TheMealDB',
  };
}

/** Søk i TheMealDB (fetch skjer i nettleseren; feil gir tom liste + melding). */
export async function searchMealDb(query, { fetchImpl = fetch } = {}) {
  const source = getSource('themealdb');
  if (!source?.enabled) return { results: [], error: null };
  try {
    const res = await fetchImpl(`${MEALDB_BASE}/search.php?s=${encodeURIComponent(query)}`);
    if (!res.ok) return { results: [], error: `Kokeboka svarte ${res.status}` };
    const data = await res.json();
    return { results: (data.meals ?? []).map(mapMealDbMeal).filter(Boolean), error: null };
  } catch {
    return { results: [], error: 'Fikk ikke kontakt med kokeboka (nettverk).' };
  }
}

/** Kategorioppslag i TheMealDB (filter gir bare navn/bilde — detaljer per valg). */
export async function browseMealDbCategory(category, { fetchImpl = fetch } = {}) {
  try {
    const res = await fetchImpl(`${MEALDB_BASE}/filter.php?c=${encodeURIComponent(category)}`);
    if (!res.ok) return { results: [], error: `Kokeboka svarte ${res.status}` };
    const data = await res.json();
    const meals = (data.meals ?? []).slice(0, 60);
    return {
      results: meals.map((m) => ({
        id: `mealdb-${m.idMeal}`,
        mealdb_id: m.idMeal,
        source_id: 'themealdb',
        source_label: 'TheMealDB',
        name: m.strMeal,
        image_url: m.strMealThumb ?? null,
        needs_lookup: true,           // full oppskrift hentes ved valg
      })),
      error: null,
    };
  } catch {
    return { results: [], error: 'Fikk ikke kontakt med kokeboka (nettverk).' };
  }
}

/** Hent full MealDB-oppskrift for en filter-rad. */
export async function lookupMealDb(mealdbId, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(`${MEALDB_BASE}/lookup.php?i=${encodeURIComponent(mealdbId)}`);
  if (!res.ok) return null;
  const data = await res.json();
  return mapMealDbMeal(data.meals?.[0]);
}

/** Norske kandidater fra databasen (fylles av høstingen etter revisjonen). */
export async function searchCandidates(supabase, query, { limit = 30 } = {}) {
  let q = supabase
    .from('external_recipe_candidates')
    .select('id, source_id, source_url, title, image_url, payload')
    .order('id', { ascending: false })
    .limit(limit);
  if (query?.trim()) q = q.ilike('title', `%${query.trim()}%`);
  const { data, error } = await q;
  if (error) return { results: [], error: error.message };
  return {
    results: (data ?? []).map((row) => ({
      id: `cand-${row.id}`,
      source_id: row.source_id,
      source_label: getSource(row.source_id)?.name ?? row.source_id,
      name: row.title,
      category: row.payload?.categories?.[0] ?? 'Middag',
      image_url: row.image_url,
      servings: row.payload?.servings ?? null,
      total_time_minutes: row.payload?.total_time_minutes ?? null,
      raw_ingredients: row.payload?.raw_ingredients ?? [],
      instructions_url: row.source_url,
      instructions_link_text: row.payload?.instructions_link_text
        ?? `Se fremgangsmåte hos ${getSource(row.source_id)?.name ?? row.source_id}`,
    })),
    error: null,
  };
}

/**
 * Gjør en valgt kandidat om til (a) en middag for biblioteket og (b) rader
 * til ingrediens-gjennomgangen. Umatchede ingredienser beholdes med navn,
 * men uten kobling — de går til vanlig avklaring, aldri nye katalogvarer.
 *
 * targetPortions (valgfritt): familiens porsjonstall. Når oppskriften selv
 * oppgir porsjoner (TINE/Gilde: «4 personer»), skaleres mengdene dit én
 * gang her, og middagen lagres med base_servings = targetPortions — da er
 * familieoppskriften alltid kalibrert for familien. Uten kjent basis
 * skaleres ingenting (vi gjetter aldri).
 */
export function candidateToMeal(candidate, catalog, normRules, { targetPortions = null } = {}) {
  const normalized = normalizeExternalIngredients(candidate.raw_ingredients, catalog, normRules);

  const recipeBase = candidate.servings?.base_servings ?? null;
  const factor = (recipeBase > 0 && targetPortions > 0) ? targetPortions / recipeBase : 1;

  // Slå sammen rader som løses til SAMME vare («kylling» + «kyllingfilet»
  // → én Kylling-rad): lik enhet summeres, ulik enhet beholder den første
  // mengden — man skal aldri få to like varer i gjennomgangen.
  const merged = [];
  const byName = new Map();
  for (const r of normalized) {
    const key = r.name.toLowerCase();
    const prev = byName.get(key);
    if (!prev) {
      byName.set(key, { ...r });
      merged.push(byName.get(key));
    } else if (prev.unit === r.unit && prev.qty != null && r.qty != null) {
      prev.qty += r.qty;
    }
  }

  // Skaler til familiens porsjoner ETTER sammenslåing, med pen avrunding.
  if (factor !== 1) {
    for (const r of merged) r.qty = scaleQty(r.qty, factor);
  }

  return {
    meal: {
      name: candidate.name,
      category: candidate.category ?? 'Middag',
      ingredients: merged.map((r) => ({ n: r.name, qty: r.qty ?? 1 })),
      // Fremgangsmåten leses hos kilden — vi lagrer lenken, aldri teksten.
      instructions_url: candidate.instructions_url ?? null,
      source_label: candidate.source_label ?? null,
      base_servings: factor !== 1 ? targetPortions : recipeBase,
    },
    rows: merged,
    unmatched: merged.filter((r) => !r.matched).map((r) => r.name),
    servingsKnown: recipeBase != null,
    scaledFrom: factor !== 1 ? recipeBase : null,
  };
}
