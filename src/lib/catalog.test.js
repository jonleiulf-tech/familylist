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

describe('løsvekt og enhetsord skal aldri bli en vare', () => {
  const catalog = [
    { name: 'Smaégodt Pr Kg', score: 9, avg_price: 50 },
    { name: 'Mel', score: 23, avg_price: 20 },
    { name: 'Vannmelon', score: 5, avg_price: 40 },
    { name: 'Salat', score: 51, avg_price: 25 },
  ];
  const nr = new Map();

  it('«1,240 kg x 24,90 kr/kg» kobles ikke til smågodt', () => {
    // Løsvektlinjer på norske kvitteringer. Splitten på «/» gjorde «kr/kg»
    // til kandidaten «kg», som ordgrense-traff «Smaégodt Pr Kg» — og
    // bananer, kjøttdeig og biff havnet alle på samme katalograd.
    expect(resolveCatalogItem('1,240 kg x 24,90 kr/kg', catalog, nr).item).toBeNull();
  });

  it('et kort katalogord sluker ikke et langt kvitteringsord', () => {
    expect(resolveCatalogItem('PANT', catalog, nr).item).toBeNull();
    expect(resolveCatalogItem('melon vann delt kg', catalog, nr).item?.name).not.toBe('Mel');
  });
});

describe('guessUnit — beholderen er ikke innholdet', () => {
  it('flasker, begre og kartonger er stykker', () => {
    expect(guessUnit('Tritan Drikkeflaske', 'Annet', 1)).toBe('stk');
    expect(guessUnit('Yoghurtbeger vanilje', 'Meieri', 1)).toBe('stk');
  });

  it('retter er ikke råvaren de er laget av', () => {
    expect(guessUnit('Fløtegratinerte poteter', 'Middag', 1)).toBe('stk');
    expect(guessUnit('Tomatsuppe', 'Tørrvarer', 1)).toBe('stk');
  });

  it('drikke er fortsatt liter, også som sammensatt ord', () => {
    expect(guessUnit('Lettmelk', 'Meieri', 2)).toBe('liter');
    expect(guessUnit('Appelsinjuice', 'Drikke', 1)).toBe('liter');
  });

  it('24 pølser er 24 pakker, ikke 24 gram', () => {
    expect(guessUnit('Pølser', 'Kjøtt', 24)).toBe('pakke');
    expect(guessUnit('Kyllingfilet', 'Kjøtt', 600)).toBe('g');
  });

  it('kyllingbuljong er ikke kylling', () => {
    expect(guessUnit('Kyllingbuljong', 'Tørrvarer', 2)).toBe('stk');
  });
});
