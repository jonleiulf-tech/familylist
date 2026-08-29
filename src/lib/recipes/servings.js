// Porsjonsnormalisering.
//
// Ufravikelig regel fra spesifikasjonen: ANTA ALDRI 4 i stillhet. Sier
// kilden ingenting, er base_servings null og confidence 'unknown' — så
// setter brukeren antallet selv.

const NUMBER_WORDS = {
  en: 1, ei: 1, ett: 1, én: 1, to: 2, tre: 3, fire: 4, fem: 5,
  seks: 6, sju: 7, syv: 7, åtte: 8, ni: 9, ti: 10, tolv: 12,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, eight: 8, ten: 10,
};

const UNKNOWN = {
  base_servings: null,
  base_servings_min: null,
  base_servings_max: null,
  servings_raw: null,
  servings_source: null,
  servings_confidence: 'unknown',
};

/**
 * «4 porsjoner» / «4 personer» / «4 servings» / «serverer 4» → 4 (high)
 * «4-6 personer» → min 4, maks 6, base 5 (medium — midtpunkt, ikke fakta)
 * ingenting → null (unknown)
 */
export function normalizeServings(raw, { source = 'source' } = {}) {
  if (raw == null || raw === '') return { ...UNKNOWN };

  // Tall direkte (Recipe API yield_count, JSON-LD numerisk recipeYield)
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return {
      base_servings: raw,
      base_servings_min: null,
      base_servings_max: null,
      servings_raw: String(raw),
      servings_source: source,
      servings_confidence: 'high',
    };
  }

  // recipeYield kan være array — «["4", "4 porsjoner"]». Ta beste treff.
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const r = normalizeServings(entry, { source });
      if (r.servings_confidence !== 'unknown') return r;
    }
    return { ...UNKNOWN };
  }

  const text = String(raw).trim();
  if (!text) return { ...UNKNOWN };
  const lower = text.toLowerCase();

  // Intervall: «4-6 personer», «4–6», «4 til 6»
  const range = lower.match(/(\d+)\s*(?:-|–|—|til|to)\s*(\d+)/);
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    if (min > 0 && max >= min && max <= 100) {
      return {
        base_servings: Math.round((min + max) / 2),
        base_servings_min: min,
        base_servings_max: max,
        servings_raw: text,
        servings_source: source,
        // Midtpunktet er et forslag, ikke det kilden sa.
        servings_confidence: 'medium',
      };
    }
  }

  // Enkelt tall: «4 porsjoner», «Serverer 4», «Serves 4», «6 personer», «4»
  const single = lower.match(/(\d+)/);
  if (single) {
    const n = Number(single[1]);
    // Urimelige tall («oppskrift #2483») skal ikke bli porsjoner.
    if (n > 0 && n <= 100) {
      return {
        base_servings: n,
        base_servings_min: null,
        base_servings_max: null,
        servings_raw: text,
        servings_source: source,
        servings_confidence: 'high',
      };
    }
    return { ...UNKNOWN, servings_raw: text };
  }

  // Tallord: «fire porsjoner»
  for (const [word, n] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(lower)) {
      return {
        base_servings: n,
        base_servings_min: null,
        base_servings_max: null,
        servings_raw: text,
        servings_source: source,
        servings_confidence: 'medium',
      };
    }
  }

  return { ...UNKNOWN, servings_raw: text };
}

/** Skaleringsfaktor: mål / basis. Null når basis er ukjent — aldri gjett. */
export function scaleFactor(baseServings, targetServings) {
  const base = Number(baseServings);
  const target = Number(targetServings);
  if (!Number.isFinite(base) || base <= 0) return null;
  if (!Number.isFinite(target) || target <= 0) return null;
  return target / base;
}
