import { describe, it, expect } from 'vitest';
import {
  parseIngredientLine, translateName,
  normalizeExternalIngredient, normalizeExternalIngredients,
} from './ingredients.js';

// Liten varedatabase i stil med item_catalog-seeden.
const CATALOG = [
  { name: 'Kjøttdeig', major_category: 'Kjøtt', avg_price: 62, score: 30, frequency_sig: 'Ofte' },
  { name: 'Løk', major_category: 'Grønnsaker', avg_price: 5, score: 25 },
  { name: 'Hvitløk', major_category: 'Grønnsaker', avg_price: 12, score: 12 },
  { name: 'Hakkede tomater', major_category: 'Hermetikk', avg_price: 14, score: 18 },
  { name: 'Fullkornsspagetti', major_category: 'Tørrvarer', avg_price: 24, score: 8 },
  { name: 'Melk', major_category: 'Meieri', avg_price: 25, score: 40 },
];
const NORM_RULES = new Map();   // normalizeName forventer et Map, som i appen

describe('parseIngredientLine', () => {
  it('norsk: mengde + enhet + navn', () => {
    expect(parseIngredientLine('600 g kjøttdeig')).toMatchObject({ qty: 600, unit: 'g', name: 'kjøttdeig' });
  });

  it('kun antall uten enhet', () => {
    expect(parseIngredientLine('1 løk')).toMatchObject({ qty: 1, unit: null, name: 'løk' });
  });

  it('engelsk enhet oversettes: cloves → fedd', () => {
    expect(parseIngredientLine('2 cloves garlic, minced')).toMatchObject({ qty: 2, unit: 'fedd', name: 'garlic' });
  });

  it('brøker: «1/2», «1 1/2» og «½»', () => {
    expect(parseIngredientLine('1/2 dl fløte').qty).toBe(0.5);
    expect(parseIngredientLine('1 1/2 ts salt').qty).toBe(1.5);
    expect(parseIngredientLine('½ løk').qty).toBe(0.5);
  });

  it('desimal med komma', () => {
    expect(parseIngredientLine('1,5 l melk')).toMatchObject({ qty: 1.5, unit: 'l', name: 'melk' });
  });

  it('uten mengde: qty og unit blir null — aldri gjettet', () => {
    expect(parseIngredientLine('salt og pepper')).toMatchObject({ qty: null, unit: null, name: 'salt og pepper' });
  });

  it('tilberedning strykes fra slutten', () => {
    expect(parseIngredientLine('1 onion, finely chopped').name).toBe('onion');
    expect(parseIngredientLine('2 gulrøtter, revet').name).toBe('2 gulrøtter, revet'.includes('x') ? 'x' : 'gulrøtter');
  });

  it('«of» etter enhet strykes', () => {
    expect(parseIngredientLine('1 can of chopped tomatoes')).toMatchObject({ unit: 'boks', name: 'chopped tomatoes' });
  });

  it('tom streng gir null', () => {
    expect(parseIngredientLine('')).toBeNull();
    expect(parseIngredientLine('   ')).toBeNull();
  });
});

describe('translateName', () => {
  it.each([
    ['ground beef', 'kjøttdeig'],
    ['onion', 'løk'],
    ['garlic', 'hvitløk'],
    ['passata', 'passata'],
    ['whole wheat spaghetti', 'fullkornsspagetti'],
    ['fresh basil', 'basil'],          // prefiks strippes selv uten treff
  ])('%s → %s', (en, no) => {
    const out = translateName(en);
    expect(out.toLowerCase()).toBe(no);
  });

  it('norske navn passerer urørt', () => {
    expect(translateName('kjøttdeig')).toBe('kjøttdeig');
  });
});

describe('normalizeExternalIngredient — spec-eksemplet', () => {
  it('«600 g ground beef» kobles til Kjøttdeig i VÅR database', () => {
    const r = normalizeExternalIngredient('600 g ground beef', CATALOG, NORM_RULES);
    expect(r).toMatchObject({ qty: 600, unit: 'g', name: 'Kjøttdeig', matched: true });
    expect(r.catalog_item.name).toBe('Kjøttdeig');
  });

  it('hele bolognese-lista fra spec-en', () => {
    const rows = normalizeExternalIngredients([
      '600 g ground beef',
      '1 onion',
      '2 cloves garlic',
      '1 can chopped tomatoes',
      '400 g whole wheat spaghetti',
    ], CATALOG, NORM_RULES);
    expect(rows.map((r) => r.name)).toEqual([
      'Kjøttdeig', 'Løk', 'Hvitløk', 'Hakkede tomater', 'Fullkornsspagetti',
    ]);
    expect(rows.every((r) => r.matched)).toBe(true);
  });

  it('ukjent vare får matched=false — ingen nye varer oppfinnes', () => {
    const r = normalizeExternalIngredient('1 ts sumak', CATALOG, NORM_RULES);
    expect(r.matched).toBe(false);
    expect(r.catalog_item).toBeNull();
  });
});
