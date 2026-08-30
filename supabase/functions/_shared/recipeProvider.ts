// AUTOGENERERT — ikke rediger.
// Kilde: src/lib/recipes/provider.js. Kjør `npm run sync:shared` etter endringer der.
// Testene ligger sammen med kilden.

// Provider-grensesnittet mellom kilderegisteret og resten av appen.
// En provider gjør tre ting: håndhever kildens tillatelser, parser en
// hentet side til kandidatformat, og vasker resultatet ned til det vi
// faktisk har lov til å lagre. Selve HTTP-hentingen skjer alltid utenfor
// (revisjonsskriptet lokalt, senere en Edge Function) — modulene her er
// rene og testbare.

import { getSource } from './recipeSources.ts';
import { parseRecipeFromHtml } from './recipeJsonld.ts';

/** Kast hvis kilden ikke får hentes fra i det hele tatt. */
export function assertFetchAllowed(source) {
  if (!source) throw new Error('Ukjent kilde');
  if (!source.enabled || source.can_fetch_recipe === false
      || source.integration_modes.includes('DISABLED_PENDING_PERMISSION')) {
    throw new Error(
      `Kilden «${source.name}» er ikke aktivert for henting `
      + '(DISABLED_PENDING_PERMISSION / enabled=false). Kun lenke-deling er lov.',
    );
  }
}

/**
 * Vask en parset oppskrift ned til det kilden tillater lagret.
 * - instructions fjernes alltid uten eksplisitt tillatelse; erstattes med
 *   lenke-ut-teksten («Se fremgangsmåte hos TINE»).
 * - image_url beholdes bare som EKSTERN URL når bilder ikke kan kopieres;
 *   image_copyable sier om vi får lagre selve bildet.
 */
export function sanitizeForStorage(recipe, source) {
  if (!recipe) return null;
  const out = { ...recipe };
  if (!source?.can_store_instructions) {
    out.instructions = null;
    out.instructions_link_text = `Se fremgangsmåte hos ${source?.name ?? 'kilden'}`;
    out.instructions_url = recipe.url ?? null;
  }
  out.image_copyable = Boolean(source?.can_store_images);
  if (!source?.can_store_metadata) {
    out.description = null;
    out.keywords = [];
  }
  return out;
}

/**
 * Bygg en rad for external_recipe_candidates fra en (vasket) oppskrift.
 * payload er et LETT sammendrag — aldri fulltekst.
 */
export function buildCandidateRow(recipe, source) {
  const clean = sanitizeForStorage(recipe, source);
  if (!clean?.url || !source?.id) return null;
  return {
    source_id: source.id,
    source_url: clean.url,
    title: clean.name,
    image_url: clean.image_url ?? null,
    payload: {
      servings: clean.servings ?? null,
      total_time_minutes: clean.total_time_minutes ?? null,
      categories: clean.categories ?? [],
      keywords: (clean.keywords ?? []).slice(0, 12),
      ingredient_count: clean.raw_ingredients?.length ?? 0,
      raw_ingredients: clean.raw_ingredients ?? [],   // handleliste-grunnlag
      completeness: clean.completeness ?? null,
      rating: clean.rating ?? null,
      instructions_link_text: clean.instructions_link_text ?? null,
    },
  };
}

/**
 * Generisk JSON-LD-provider: parser en allerede hentet HTML-side for en
 * kilde, med tillatelsessjekk. Dette dekker alle kilder med
 * STRUCTURED_DATA i integration_modes.
 */
export function createJsonLdProvider(sourceId) {
  const source = getSource(sourceId);
  return {
    source,
    /** html → vasket kandidat, eller null når siden ikke har oppskrift. */
    parse(html, url) {
      assertFetchAllowed(source);
      const recipe = parseRecipeFromHtml(html, { sourceUrl: url });
      return recipe ? sanitizeForStorage(recipe, source) : null;
    },
    /** html → rad for external_recipe_candidates, eller null. */
    toCandidate(html, url) {
      const clean = this.parse(html, url);
      return clean ? buildCandidateRow(clean, source) : null;
    },
  };
}
