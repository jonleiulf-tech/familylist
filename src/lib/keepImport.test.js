import { describe, it, expect } from 'vitest';
import { parseImportLine, classifyLine, processImport } from './keepImport.js';

const CATALOG = [
  { name: 'Melk', major_category: 'Meieri', avg_price: 25, primary_store: 'Coop Extra', score: 90 },
  { name: 'Brød', major_category: 'Brød og korn', avg_price: 38, primary_store: 'Coop Extra', score: 93 },
  { name: 'Norvegia', major_category: 'Ost og pålegg', avg_price: 110, primary_store: 'Meny', score: 40 },
  { name: 'Kjøttdeig', major_category: 'Kjøtt', avg_price: 72, primary_store: 'Coop Extra', score: 60 },
  { name: 'Avokado', major_category: 'Frukt og grønt', avg_price: 15, primary_store: 'Meny', score: 30 },
];
// Et utdrag av de 134 NORM-reglene.
const NORM = new Map([
  ['norwegia', 'Norvegia'],
  ['advokado', 'Avokado'],
  ['melk', 'Melk'],
]);

describe('parseImportLine', () => {
  it('leser rent navn', () => {
    expect(parseImportLine('Melk')).toEqual({ qty: 1, unit: null, name: 'Melk' });
  });
  it('leser antall foran', () => {
    expect(parseImportLine('3 brød')).toEqual({ qty: 3, unit: null, name: 'brød' });
  });
  it('leser antall med enhet', () => {
    expect(parseImportLine('2 liter melk')).toEqual({ qty: 2, unit: 'liter', name: 'melk' });
  });
  it('oversetter enhetsforkortelser', () => {
    expect(parseImportLine('2 l melk').unit).toBe('liter');
    expect(parseImportLine('500 gram kjøttdeig').unit).toBe('g');
    expect(parseImportLine('2 pk kaffe').unit).toBe('pakke');
  });
  it('leser antall bakerst', () => {
    expect(parseImportLine('Melk x2')).toEqual({ qty: 2, unit: null, name: 'Melk' });
  });
  it('fjerner punkttegn og avkryssingsbokser', () => {
    expect(parseImportLine('- Melk').name).toBe('Melk');
    expect(parseImportLine('[x] Brød').name).toBe('Brød');
    expect(parseImportLine('1. Melk').name).toBe('Melk');
  });
  it('ignorerer tomme linjer', () => {
    expect(parseImportLine('')).toBeNull();
    expect(parseImportLine('   ')).toBeNull();
  });
  it('takler desimaler', () => {
    expect(parseImportLine('1,5 liter melk').qty).toBe(1.5);
  });
});

describe('classifyLine', () => {
  it('gir eksakt treff på katalognavn', () => {
    const r = classifyLine({ qty: 1, name: 'Melk' }, CATALOG, NORM);
    expect(r.status).toBe('exact');
    expect(r.name).toBe('Melk');
  });
  it('gir eksakt treff etter normalisering', () => {
    const r = classifyLine({ qty: 1, name: 'Norwegia' }, CATALOG, NORM);
    expect(r.status).toBe('exact');
    expect(r.name).toBe('Norvegia');
  });
  it('retter skrivefeil via normaliseringsregel', () => {
    const r = classifyLine({ qty: 1, name: 'advokado' }, CATALOG, NORM);
    expect(r.status).toBe('exact');
    expect(r.name).toBe('Avokado');
  });
  it('gir ukjent for noe som ikke finnes', () => {
    const r = classifyLine({ qty: 1, name: 'Sykkelpumpe' }, CATALOG, NORM);
    expect(r.status).toBe('unknown');
  });
});

describe('processImport', () => {
  it('slipper sikre treff rett gjennom', () => {
    const { auto, review } = processImport('Melk\nBrød', CATALOG, NORM);
    expect(auto.map((r) => r.name)).toEqual(['Melk', 'Brød']);
    expect(review).toHaveLength(0);
  });

  it('sender usikre til avklaring', () => {
    const { auto, review } = processImport('Melk\nSykkelpumpe', CATALOG, NORM);
    expect(auto.map((r) => r.name)).toEqual(['Melk']);
    expect(review).toHaveLength(1);
    expect(review[0].raw).toBe('Sykkelpumpe');
  });

  it('bærer med seg antall og enhet', () => {
    const { auto } = processImport('2 liter melk', CATALOG, NORM);
    expect(auto[0]).toMatchObject({ name: 'Melk', qty: 2, unit: 'liter' });
  });

  it('henter pris og butikk fra katalogen', () => {
    const { auto } = processImport('Norwegia', CATALOG, NORM);
    expect(auto[0]).toMatchObject({
      name: 'Norvegia', price: 110, store: 'Meny', price_source: 'receipt',
    });
  });

  it('slår sammen samme vare oppgitt to ganger', () => {
    const { auto } = processImport('2 melk\n3 melk', CATALOG, NORM);
    expect(auto).toHaveLength(1);
    expect(auto[0].qty).toBe(5);
  });

  it('teller hoppede tomme linjer', () => {
    const { skipped } = processImport('Melk\n\n\n  \nBrød', CATALOG, NORM);
    expect(skipped).toBe(3);
  });

  it('takler en hel Keep-liste', () => {
    const keep = [
      '- Melk',
      '[ ] 2 brød',
      'Norwegia',
      '3. Kjøttdeig 500g',
      'Sykkelpumpe',
      '',
      'advokado x2',
    ].join('\n');
    const { auto, review } = processImport(keep, CATALOG, NORM);
    expect(auto.map((r) => r.name)).toContain('Melk');
    expect(auto.map((r) => r.name)).toContain('Norvegia');
    expect(auto.map((r) => r.name)).toContain('Avokado');
    expect(auto.find((r) => r.name === 'Avokado').qty).toBe(2);
    expect(review.map((r) => r.raw)).toContain('Sykkelpumpe');
  });

  it('gir tomt resultat for tom input', () => {
    expect(processImport('', CATALOG, NORM)).toEqual({ auto: [], review: [], skipped: 0 });
  });
});
