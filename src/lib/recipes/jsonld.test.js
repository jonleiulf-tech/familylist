import { describe, it, expect } from 'vitest';
import {
  extractJsonLd, findRecipeNodes, durationToMinutes,
  parseInstructions, parseRecipeNode, parseRecipeFromHtml,
} from './jsonld.js';

const wrap = (json) => `<html><head>
  <script type="application/ld+json">${JSON.stringify(json)}</script>
</head><body></body></html>`;

const TINE_LIKE = {
  '@context': 'https://schema.org',
  '@type': 'Recipe',
  name: 'Pasta Bolognese',
  description: 'Klassisk kjøttsaus.',
  image: ['https://example.no/bolognese.jpg'],
  author: { '@type': 'Organization', name: 'TINE Kjøkken' },
  datePublished: '2024-03-01',
  totalTime: 'PT45M',
  recipeYield: '4 porsjoner',
  recipeIngredient: ['600 g kjøttdeig', '1 løk', '2 fedd hvitløk', '1 boks hakkede tomater'],
  recipeInstructions: [
    { '@type': 'HowToStep', text: 'Brun kjøttdeigen.' },
    { '@type': 'HowToStep', text: 'Tilsett løk og hvitløk.' },
  ],
  recipeCategory: 'Middag',
  recipeCuisine: 'Italiensk',
  keywords: 'pasta, kjøttdeig, familiemiddag',
  aggregateRating: { ratingValue: '4.5' },
  nutrition: { '@type': 'NutritionInformation', calories: '520 kcal' },
};

describe('extractJsonLd', () => {
  it('finner flere blokker', () => {
    const html = wrap({ a: 1 }) + wrap({ b: 2 });
    expect(extractJsonLd(html)).toHaveLength(2);
  });

  it('overlever etterlatt komma', () => {
    const html = '<script type="application/ld+json">{"@type":"Recipe","name":"X",}</script>';
    expect(extractJsonLd(html)).toEqual([{ '@type': 'Recipe', name: 'X' }]);
  });

  it('hopper stille over ugyldig JSON', () => {
    expect(extractJsonLd('<script type="application/ld+json">{{{</script>')).toEqual([]);
  });
});

describe('findRecipeNodes', () => {
  it('finner Recipe i @graph', () => {
    const doc = { '@graph': [{ '@type': 'WebPage' }, { '@type': 'Recipe', name: 'X' }] };
    expect(findRecipeNodes(doc)).toHaveLength(1);
  });

  it('takler @type som array', () => {
    expect(findRecipeNodes({ '@type': ['Recipe', 'NewsArticle'], name: 'X' })).toHaveLength(1);
  });

  it('finner Recipe i toppnivå-array', () => {
    expect(findRecipeNodes([[{ '@type': 'Recipe', name: 'X' }]])).toHaveLength(1);
  });
});

describe('durationToMinutes', () => {
  it.each([
    ['PT45M', 45],
    ['PT1H30M', 90],
    ['PT1H', 60],
    ['P1D', 1440],
    ['PT90S', 2],   // avrundet
    ['', null],
    ['ikke en varighet', null],
    [null, null],
  ])('%s → %s', (input, expected) => {
    expect(durationToMinutes(input)).toBe(expected);
  });
});

describe('parseInstructions', () => {
  it('HowToSection med steg får seksjonsnavn', () => {
    const steps = parseInstructions([
      {
        '@type': 'HowToSection',
        name: 'Sausen',
        itemListElement: [{ '@type': 'HowToStep', text: 'Kok opp.' }],
      },
    ]);
    expect(steps).toEqual([{ section: 'Sausen', text: 'Kok opp.' }]);
  });

  it('ren streng vaskes for HTML', () => {
    expect(parseInstructions('<p>Stek  fisken.</p>')).toEqual([{ text: 'Stek fisken.' }]);
  });
});

describe('parseRecipeNode / parseRecipeFromHtml', () => {
  it('parser et TINE-aktig dokument fullt ut', () => {
    const r = parseRecipeFromHtml(wrap(TINE_LIKE), { sourceUrl: 'https://example.no/r/1' });
    expect(r.name).toBe('Pasta Bolognese');
    expect(r.image_url).toBe('https://example.no/bolognese.jpg');
    expect(r.author).toBe('TINE Kjøkken');
    expect(r.total_time_minutes).toBe(45);
    expect(r.servings).toMatchObject({ base_servings: 4, servings_confidence: 'high' });
    expect(r.raw_ingredients).toHaveLength(4);
    expect(r.instructions).toHaveLength(2);
    expect(r.categories).toEqual(['Middag', 'Italiensk']);
    expect(r.keywords).toContain('kjøttdeig');
    expect(r.rating).toBe(4.5);
    expect(r.nutrition.calories).toBe('520 kcal');
    expect(r.completeness).toBe(100);
  });

  it('manglende porsjoner blir null — ALDRI antatt 4', () => {
    const { recipeYield, ...rest } = TINE_LIKE;
    const r = parseRecipeNode(rest);
    expect(r.servings.base_servings).toBeNull();
    expect(r.servings.servings_confidence).toBe('unknown');
    expect(r.completeness).toBeLessThan(100);
  });

  it('totaltid faller tilbake på prep + cook', () => {
    const r = parseRecipeNode({
      '@type': 'Recipe', name: 'X', recipeIngredient: ['a', 'b'],
      prepTime: 'PT15M', cookTime: 'PT30M',
    });
    expect(r.total_time_minutes).toBe(45);
  });

  it('node uten navn og ingredienser gir null', () => {
    expect(parseRecipeNode({ '@type': 'Recipe' })).toBeNull();
  });

  it('velger den mest komplette når siden har flere Recipe-noder', () => {
    const thin = { '@type': 'Recipe', name: 'Tynn' };
    const html = wrap(thin) + wrap(TINE_LIKE);
    expect(parseRecipeFromHtml(html).name).toBe('Pasta Bolognese');
  });

  it('side uten oppskrift gir null', () => {
    expect(parseRecipeFromHtml('<html><body>Ingen oppskrift</body></html>')).toBeNull();
  });
});
