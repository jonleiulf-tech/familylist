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
});

describe('guessUnit', () => {
  it('kjøpe-enheter som standard, gram kun ved reell vekt', () => {
    expect(guessUnit('Revet ost', 'Ost og pålegg', 1)).toBe('pakke');
    expect(guessUnit('Kjøttdeig', 'Kjøtt', 600)).toBe('g');
    expect(guessUnit('Melk', 'Meieri', 1)).toBe('liter');
  });
});
