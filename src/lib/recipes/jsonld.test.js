import { describe, it, expect } from 'vitest';
import {
  extractJsonLd, findRecipeNodes, durationToMinutes,
  parseInstructions, parseRecipeNode, parseRecipeFromHtml, findEmbeddedRecipeNodes,
  findMicrodataRecipeNodes,
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

describe('findEmbeddedRecipeNodes — JS-tunge sider (Next.js)', () => {
  const NEXT_DATA = {
    props: {
      pageProps: {
        recipe: {
          title: 'Lasagne med kjøttdeig',
          recipeIngredient: ['500 g kjøttdeig', '1 løk', '12 lasagneplater'],
          recipeYield: '4 porsjoner',
          totalTime: 'PT60M',
          image: 'https://www.tine.no/lasagne.jpg',
        },
      },
    },
  };
  const html = `<html><body>
    <script id="__NEXT_DATA__" type="application/json">${JSON.stringify(NEXT_DATA)}</script>
  </body></html>`;

  it('finner oppskrift i __NEXT_DATA__ når JSON-LD mangler', () => {
    const r = parseRecipeFromHtml(html, { sourceUrl: 'https://www.tine.no/x' });
    expect(r).not.toBeNull();
    expect(r.name).toBe('Lasagne med kjøttdeig');
    expect(r.raw_ingredients).toHaveLength(3);
    expect(r.servings.base_servings).toBe(4);
    expect(r.total_time_minutes).toBe(60);
  });

  it('JSON-LD vinner fortsatt når begge finnes', () => {
    const both = wrap(TINE_LIKE) + html;
    expect(parseRecipeFromHtml(both).name).toBe('Pasta Bolognese');
  });

  it('vanlige JSON-blober uten oppskrift gir ingenting', () => {
    const noise = '<script type="application/json">{"a":{"b":[1,2,3]},"name":"x"}</script>';
    expect(parseRecipeFromHtml(`<html>${noise}</html>`)).toBeNull();
  });
});

describe('findMicrodataRecipeNodes — mikrodata rett i HTML-en (REMA)', () => {
  const REMA_HTML = `
    <html><head>
      <title>Tortilla-kebabspyd | REMA 1000</title>
      <meta property="og:title" content="Tortilla-kebabspyd" />
      <meta property="og:image" content="https://www.rema.no/bilder/kebabspyd.jpg" />
    </head><body>
      <article itemscope itemtype="https://schema.org/Recipe">
        <h1 itemprop="name">Tortilla-kebabspyd</h1>
        <div role="text" aria-label="Oppskriften inneholder 15 ingredienser">
          <strong aria-hidden="true">15</strong> <span aria-hidden="true">ingredienser</span>
        </div>
        <ul>
          <li itemprop="recipeIngredient"><span>400</span> g <a href="/x">kebabkjøtt</a></li>
          <li itemprop="recipeIngredient">4 store tortillalefser</li>
          <li itemprop="recipeIngredient">2 dl rømme</li>
        </ul>
        <meta itemprop="totalTime" content="PT25M" />
      </article>
    </body></html>`;

  it('finner ingredienser, navn og tid fra itemprop-attributter', () => {
    const parsed = parseRecipeFromHtml(REMA_HTML, { sourceUrl: 'https://www.rema.no/oppskrifter/x/' });
    expect(parsed).not.toBeNull();
    expect(parsed.name).toBe('Tortilla-kebabspyd');
    expect(parsed.raw_ingredients).toEqual(['400 g kebabkjøtt', '4 store tortillalefser', '2 dl rømme']);
    expect(parsed.total_time_minutes).toBe(25);
    expect(parsed.image_url).toBe('https://www.rema.no/bilder/kebabspyd.jpg');
    // Porsjoner oppgis ikke → aldri antatt
    expect(parsed.servings?.base_servings ?? null).toBeNull();
  });

  it('krever minst to ingredienser — ellers ingen node', () => {
    expect(findMicrodataRecipeNodes('<li itemprop="recipeIngredient">1 egg</li>')).toEqual([]);
    expect(findMicrodataRecipeNodes('')).toEqual([]);
  });

  it('navn faller tilbake på og:title uten Recipe-scope, uten kjedehale', () => {
    const html = `
      <meta property="og:title" content="Kyllingwok | REMA 1000" />
      <li itemprop="recipeIngredient">400 g kylling</li>
      <li itemprop="recipeIngredient">1 paprika</li>`;
    const [node] = findMicrodataRecipeNodes(html);
    expect(node.name).toBe('Kyllingwok');
  });
});
