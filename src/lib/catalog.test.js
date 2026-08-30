import { describe, it, expect } from 'vitest';
import { resolveCatalogItem, guessUnit } from './catalog.js';

const CATALOG = [
  { name: 'Melk', major_category: 'Meieri', avg_price: 25, score: 60 },
  { name: 'Lettmelk', major_category: 'Meieri', avg_price: 24, score: 30 },
  { name: 'Kjøttdeig', major_category: 'Kjøtt', avg_price: 62, score: 30 },
  { name: 'Hakkede tomater', major_category: 'Tørrvarer', avg_price: 14, score: 18 },
  { name: 'Revet ost', major_category: 'Ost og pålegg', avg_price: 45, score: 20 },
];
const RULES = new Map();

describe('resolveCatalogItem — ordgrenser i norske sammensatte ord', () => {
  it('«sjokolademelk» blir ALDRI «Melk» — sammensatt ord er en annen vare', () => {
    const { name, item } = resolveCatalogItem('sjokolademelk', CATALOG, RULES);
    expect(item).toBeNull();
    expect(name).toBe('Sjokolademelk');
  });

  it('«lett melk» (eget ord) matcher fortsatt Melk', () => {
    expect(resolveCatalogItem('lett melk', CATALOG, RULES).item?.name).toBe('Melk');
  });

  it('eksakte treff er urørt', () => {
    expect(resolveCatalogItem('melk', CATALOG, RULES).item?.name).toBe('Melk');
    expect(resolveCatalogItem('Kjøttdeig', CATALOG, RULES).item?.name).toBe('Kjøttdeig');
  });

  it('«hakkede tomater med urter» matcher Hakkede tomater (ordgrense-prefiks)', () => {
    expect(resolveCatalogItem('hakkede tomater med urter', CATALOG, RULES).item?.name).toBe('Hakkede tomater');
  });

  it('ukjent vare beholder navnet sitt med stor forbokstav', () => {
    const { name, item } = resolveCatalogItem('proteinbar', CATALOG, RULES);
    expect(item).toBeNull();
    expect(name).toBe('Proteinbar');
  });

  // «1 liter kylling»-feilen: buljong/kraft er IKKE kjøttvaren.
  it('«kyllingbuljong» blir ALDRI «Kylling» — langt suffiks er sammensatt ord', () => {
    const withKylling = [...CATALOG, { name: 'Kylling', major_category: 'Kjøtt', avg_price: 89, score: 35 }];
    const { name, item } = resolveCatalogItem('kyllingbuljong', withKylling, RULES);
    expect(item).toBeNull();
    expect(name).toBe('Kyllingbuljong');
    expect(resolveCatalogItem('kyllingkraft', withKylling, RULES).item).toBeNull();
  });

  it('bøyning med kort suffiks matcher fortsatt: «hakkede tomater» ↔ tomat-varianter', () => {
    const withTomat = [...CATALOG, { name: 'Tomater', major_category: 'Grønnsaker', avg_price: 30, score: 28 }];
    expect(resolveCatalogItem('tomat', withTomat, RULES).item?.name).toBe('Tomater');
  });
});

describe('guessUnit', () => {
  it('kjøpe-enheter som standard, gram kun ved reell vekt', () => {
    expect(guessUnit('Revet ost', 'Ost og pålegg', 1)).toBe('pakke');
    expect(guessUnit('Kjøttdeig', 'Kjøtt', 600)).toBe('g');
    expect(guessUnit('Melk', 'Meieri', 1)).toBe('liter');
  });
  it('kylling er en vekt/pakke-vare, ikke stk', () => {
    expect(guessUnit('Kylling', 'Kjøtt', 600)).toBe('g');     // ikke «600 stk»
    expect(guessUnit('Kyllingfilet', 'Kjøtt', 3)).toBe('pakke');
  });
  it('sammensatte ord lures ikke til drikke', () => {
    expect(guessUnit('Vannmelon', 'Frukt og grønt', 1)).toBe('stk');   // ikke liter
    expect(guessUnit('Melkesjokolade', 'Snacks', 1)).not.toBe('liter');
  });
});
