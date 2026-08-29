import { describe, it, expect } from 'vitest';
import { sortShoppingItems, SORT_MODES } from './sortItems.js';

const ITEMS = [
  { name: 'Melk', category: 'Meieri', price: 25, qty: 2, store: 'Coop Extra', created_at: '2026-08-29T10:00:00Z' },
  { name: 'Ørret', category: 'Fisk', price: 129, qty: 1, store: 'Coop Extra', created_at: '2026-08-29T12:00:00Z' },
  { name: 'Agurk', category: 'Frukt og grønt', price: 22, qty: 1, store: 'Coop Extra', created_at: '2026-08-29T11:00:00Z' },
  { name: 'Brød', category: 'Brød og korn', price: null, qty: 1, store: 'Coop Extra', created_at: '2026-08-29T09:00:00Z' },
  { name: 'Ost', category: 'Meieri', price: 110, qty: 1, store: 'Coop Extra', created_at: '2026-08-29T13:00:00Z' },
];

// Lært mønster: frukt først, fisk sist.
const positionOf = (_store, cat) => ({
  'Frukt og grønt': 0.1, 'Brød og korn': 0.3, Meieri: 0.5, Fisk: 0.9,
}[cat] ?? 2);

describe('plukk (handlemønster)', () => {
  it('sorterer gruppene i lært rekkefølge', () => {
    const g = sortShoppingItems(ITEMS, 'plukk', { positionOf });
    expect(g.map((x) => x.label)).toEqual(['Frukt og grønt', 'Brød og korn', 'Meieri', 'Fisk']);
  });
  it('beholder varenes innleggingsrekkefølge i gruppen', () => {
    const g = sortShoppingItems(ITEMS, 'plukk', { positionOf });
    expect(g.find((x) => x.label === 'Meieri').rows.map((r) => r.name)).toEqual(['Melk', 'Ost']);
  });
});

describe('kategori', () => {
  it('sorterer gruppene alfabetisk', () => {
    const g = sortShoppingItems(ITEMS, 'kategori', {});
    expect(g.map((x) => x.label)).toEqual(['Brød og korn', 'Fisk', 'Frukt og grønt', 'Meieri']);
  });
  it('sorterer varene alfabetisk i gruppen', () => {
    const g = sortShoppingItems(ITEMS, 'kategori', {});
    expect(g.find((x) => x.label === 'Meieri').rows.map((r) => r.name)).toEqual(['Melk', 'Ost']);
  });
});

describe('alfabetisk', () => {
  it('gir én flat gruppe uten label', () => {
    const g = sortShoppingItems(ITEMS, 'alfabetisk', {});
    expect(g).toHaveLength(1);
    expect(g[0].label).toBeNull();
  });
  it('sorterer med norsk tegnrekkefølge — Ørret etter Ost', () => {
    const names = sortShoppingItems(ITEMS, 'alfabetisk', {})[0].rows.map((r) => r.name);
    expect(names).toEqual(['Agurk', 'Brød', 'Melk', 'Ost', 'Ørret']);
  });
});

describe('pris', () => {
  it('setter dyrest linjesum først (pris × antall)', () => {
    const rows = sortShoppingItems(ITEMS, 'pris', {})[0].rows;
    // Ørret 129, Ost 110, Melk 25×2=50 -> 129, 110, 50, 22
    expect(rows.map((r) => r.name)).toEqual(['Ørret', 'Ost', 'Melk', 'Agurk']);
  });
  it('samler varer uten pris i egen gruppe nederst', () => {
    const g = sortShoppingItems(ITEMS, 'pris', {});
    expect(g[1].label).toBe('Uten pris');
    expect(g[1].rows.map((r) => r.name)).toEqual(['Brød']);
  });
  it('lager ikke tom «Uten pris»-gruppe', () => {
    const priced = ITEMS.filter((i) => i.price);
    expect(sortShoppingItems(priced, 'pris', {})).toHaveLength(1);
  });
});

describe('nyeste', () => {
  it('setter sist lagt til øverst', () => {
    const rows = sortShoppingItems(ITEMS, 'nyeste', {})[0].rows;
    expect(rows[0].name).toBe('Ost');
    expect(rows.at(-1).name).toBe('Brød');
  });
});

describe('kanter', () => {
  it('tom liste gir tomt resultat i alle moduser', () => {
    for (const m of SORT_MODES) {
      expect(sortShoppingItems([], m.value, { positionOf })).toEqual([]);
    }
  });
  it('vare uten kategori havner i Annet', () => {
    const g = sortShoppingItems([{ name: 'X', qty: 1 }], 'kategori', {});
    expect(g[0].label).toBe('Annet');
  });
  it('mister aldri varer, uansett modus', () => {
    for (const m of SORT_MODES) {
      const total = sortShoppingItems(ITEMS, m.value, { positionOf })
        .reduce((s, g) => s + g.rows.length, 0);
      expect(total).toBe(ITEMS.length);
    }
  });
});

describe('plukk per butikk', () => {
  // Samme kategorier, motsatt rute i to kjeder — slik butikker faktisk er.
  const perStore = (store, cat) => ({
    'Coop Extra': { 'Frukt og grønt': 0.1, Meieri: 0.5, Fisk: 0.9 },
    'Rema 1000': { Fisk: 0.1, Meieri: 0.5, 'Frukt og grønt': 0.9 },
  }[store]?.[cat] ?? 2);

  it('rekkefølgen følger butikken man står i', () => {
    const coop = sortShoppingItems(ITEMS, 'plukk', { positionOf: perStore, currentStore: 'Coop Extra' });
    const rema = sortShoppingItems(ITEMS, 'plukk', { positionOf: perStore, currentStore: 'Rema 1000' });
    expect(coop[0].label).toBe('Frukt og grønt');
    expect(rema[0].label).toBe('Fisk');
  });

  it('varens egen butikk overstyrer ikke valgt butikk', () => {
    // Alle varene er «Coop Extra»-varer, men brukeren står på Rema.
    const rema = sortShoppingItems(ITEMS, 'plukk', { positionOf: perStore, currentStore: 'Rema 1000' });
    expect(rema[0].label).toBe('Fisk');
  });
});
