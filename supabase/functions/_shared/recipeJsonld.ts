// AUTOGENERERT — ikke rediger.
// Kilde: src/lib/recipes/jsonld.js. Kjør `npm run sync:shared` etter endringer der.
// Testene ligger sammen med kilden.

// Generisk Schema.org/Recipe-parser for JSON-LD.
// Alle norske oppskriftssider vi har kartlagt (TINE, Meny, Coop, Rema,
// Godt.no …) legger oppskriften i <script type="application/ld+json">.
// Parseren er bevisst tolerant: @graph, @type som array, bilder som
// streng/objekt/array, instruksjoner som HowToStep/HowToSection.
//
// VIKTIG: hva vi LAGRER av det parseren finner styres av kildens
// can_store_*-flagg i sources.js — parseren i seg selv tar ikke stilling.

import { normalizeServings } from './recipeServings.ts';

/** Trekk ut alle JSON-LD-blokker fra en HTML-side. */
export function extractJsonLd(html) {
  const out = [];
  if (!html) return out;
  const re = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1].trim();
    if (!raw) continue;
    try {
      out.push(JSON.parse(raw));
    } catch {
      // Noen sider har flere JSON-objekter uten array, eller etterlatte
      // kommaer. Prøv en mild reparasjon; gi opp stille om det ikke går.
      try {
        out.push(JSON.parse(raw.replace(/,\s*([}\]])/g, '$1')));
      } catch { /* ugyldig blokk — hopp over */ }
    }
  }
  return out;
}

const isRecipeType = (t) => {
  if (!t) return false;
  const list = Array.isArray(t) ? t : [t];
  return list.some((x) => String(x).toLowerCase().replace(/^https?:\/\/schema\.org\//, '') === 'recipe');
};

/** Finn alle Recipe-noder i én eller flere JSON-LD-dokumenter. */
export function findRecipeNodes(docs) {
  const found = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (isRecipeType(node['@type'])) found.push(node);
    if (node['@graph']) visit(node['@graph']);
    // mainEntity o.l. — men ikke dypere generell rekursjon enn nødvendige felt
    if (node.mainEntity) visit(node.mainEntity);
    if (node.mainEntityOfPage && typeof node.mainEntityOfPage === 'object') visit(node.mainEntityOfPage);
  };
  (Array.isArray(docs) ? docs : [docs]).forEach(visit);
  return found;
}

/** ISO 8601-varighet (PT1H30M) → minutter, ellers null. */
export function durationToMinutes(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value > 0 ? Math.round(value) : null;
  const m = String(value).trim().match(/^-?P(?:(\d+(?:[.,]\d+)?)D)?(?:T(?:(\d+(?:[.,]\d+)?)H)?(?:(\d+(?:[.,]\d+)?)M)?(?:(\d+(?:[.,]\d+)?)S)?)?$/i);
  if (!m) return null;
  const num = (s) => (s ? parseFloat(s.replace(',', '.')) : 0);
  const mins = num(m[1]) * 24 * 60 + num(m[2]) * 60 + num(m[3]) + num(m[4]) / 60;
  return mins > 0 ? Math.round(mins) : null;
}

const firstString = (v) => {
  if (v == null) return null;
  if (typeof v === 'string') return v.trim() || null;
  if (Array.isArray(v)) { for (const x of v) { const s = firstString(x); if (s) return s; } return null; }
  if (typeof v === 'object') return firstString(v.url ?? v['@id'] ?? v.name ?? v.text);
  return null;
};

const asStringList = (v) => {
  if (v == null) return [];
  if (typeof v === 'string') {
    // Keywords kommer ofte som kommaseparert streng
    return v.split(',').map((s) => s.trim()).filter(Boolean);
  }
  if (Array.isArray(v)) return v.flatMap(asStringList);
  if (typeof v === 'object') { const s = firstString(v); return s ? [s] : []; }
  return [];
};

/** Instruksjoner: streng, [streng], [HowToStep], [HowToSection] → [{section?, text}] */
export function parseInstructions(value) {
  const steps = [];
  const visit = (node, section) => {
    if (node == null) return;
    if (typeof node === 'string') {
      const text = node.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (text) steps.push(section ? { section, text } : { text });
      return;
    }
    if (Array.isArray(node)) { node.forEach((n) => visit(n, section)); return; }
    if (typeof node === 'object') {
      const type = String(node['@type'] ?? '').toLowerCase();
      if (type === 'howtosection') {
        visit(node.itemListElement ?? node.steps, firstString(node.name) ?? section);
        return;
      }
      visit(node.text ?? node.name ?? node.itemListElement, section);
    }
  };
  visit(value, null);
  return steps;
}

/**
 * Parse én Recipe-node til vårt kandidatformat.
 * Returnerer null hvis noden mangler både navn og ingredienser.
 */
export function parseRecipeNode(node, { sourceUrl = null } = {}) {
  if (!node || typeof node !== 'object') return null;

  const name = firstString(node.name ?? node.headline);
  const rawIngredients = asRawIngredients(node.recipeIngredient ?? node.ingredients);
  if (!name && rawIngredients.length === 0) return null;

  const servings = normalizeServings(node.recipeYield ?? node.yield ?? null);
  const instructions = parseInstructions(node.recipeInstructions);
  const nutrition = node.nutrition && typeof node.nutrition === 'object'
    ? { calories: firstString(node.nutrition.calories) }
    : null;

  const recipe = {
    name: name ?? null,
    description: firstString(node.description),
    url: firstString(node.url ?? node['@id'] ?? node.mainEntityOfPage) ?? sourceUrl,
    image_url: firstString(node.image),
    author: firstString(node.author),
    date_published: firstString(node.datePublished),
    total_time_minutes: durationToMinutes(node.totalTime)
      ?? sumTimes(node.prepTime, node.cookTime),
    prep_time_minutes: durationToMinutes(node.prepTime),
    cook_time_minutes: durationToMinutes(node.cookTime),
    servings,                              // se normalizeServings — base_servings kan være null
    raw_ingredients: rawIngredients,       // ubehandlede strenger fra kilden
    instructions,                          // [{section?, text}] — lagres KUN med tillatelse
    categories: [...new Set([...asStringList(node.recipeCategory), ...asStringList(node.recipeCuisine)])],
    keywords: asStringList(node.keywords),
    rating: node.aggregateRating?.ratingValue != null
      ? Number(node.aggregateRating.ratingValue) || null
      : null,
    nutrition,
  };
  recipe.completeness = completenessScore(recipe);
  return recipe;
}

function asRawIngredients(v) {
  if (v == null) return [];
  const list = Array.isArray(v) ? v : [v];
  return list
    .map((x) => (typeof x === 'string' ? x : firstString(x)))
    .map((s) => (s ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function sumTimes(prep, cook) {
  const p = durationToMinutes(prep);
  const c = durationToMinutes(cook);
  if (p == null && c == null) return null;
  return (p ?? 0) + (c ?? 0);
}

/** 0–100: hvor komplett er oppskriften for VÅRT bruk (handleliste + plan). */
export function completenessScore(r) {
  let score = 0;
  if (r.name) score += 15;
  if (r.raw_ingredients.length >= 2) score += 30;
  if (r.servings?.base_servings != null) score += 20;    // aldri antatt — må finnes
  if (r.total_time_minutes != null) score += 10;
  if (r.image_url) score += 10;
  if (r.categories.length || r.keywords.length) score += 5;
  if (r.instructions.length > 0) score += 10;             // finnes ≠ lagres
  return score;
}

/**
 * Hovedinngang: HTML-side → beste Recipe-kandidat (eller null).
 * Velger noden med høyest completeness når siden har flere.
 */
export function parseRecipeFromHtml(html, { sourceUrl = null } = {}) {
  const nodes = findRecipeNodes(extractJsonLd(html));
  const parsed = nodes
    .map((n) => parseRecipeNode(n, { sourceUrl }))
    .filter(Boolean)
    .sort((a, b) => b.completeness - a.completeness);
  return parsed[0] ?? null;
}
