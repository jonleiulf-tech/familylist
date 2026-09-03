// Sortering av handlelisten.
//
// Standard er lært handlemønster — rekkefølgen kategoriene faktisk plukkes
// i butikken. Men den som vil se dyrest først, eller bare finne igjen en
// vare alfabetisk, skal få velge det selv.

import { estimateCost } from './format.js';
import { trimmed } from './text.js';

export const SORT_MODES = [
  { value: 'plukk', label: 'Handlemønster', hint: 'Rekkefølgen dere pleier å plukke i' },
  { value: 'kategori', label: 'Kategori', hint: 'Gruppert, alfabetisk' },
  { value: 'alfabetisk', label: 'Alfabetisk', hint: 'A til Å' },
  { value: 'pris', label: 'Pris', hint: 'Dyrest først' },
  { value: 'nyeste', label: 'Nyest først', hint: 'Sist lagt til øverst' },
];

const SORT_KEY = 'fl-shop-sort-v1';

export function loadSortMode() {
  try {
    const v = localStorage.getItem(SORT_KEY);
    return SORT_MODES.some((m) => m.value === v) ? v : 'plukk';
  } catch { return 'plukk'; }
}

export function saveSortMode(mode) {
  try { localStorage.setItem(SORT_KEY, mode); } catch { /* ignorer */ }
}

// trimmed(), ikke a.name direkte.
//
// `shopping_items.name` er `not null` i basen, så fra serveren er navnet
// alltid tekst. Men Handel tegner OPTIMISTISK — raden legges inn lokalt
// før serveren har sagt ja — og faller uten nett tilbake på
// øyeblikksbildet i localStorage, som kan være skrevet av en eldre utgave
// av appen med andre felt. `a.name.localeCompare(...)` kastet da, midt i
// sorteringen, og hele Handel-fanen ble «Noe gikk galt» — selve
// hovedskjermen.
const byName = (a, b) => trimmed(a?.name).localeCompare(trimmed(b?.name), 'nb');
// Radsum = pakkepris × antall INNKJØP (ikke × mengde) — «530 g kjøttdeig» er
// 2 pakker, ikke 530 × pakkeprisen. Samme regnestykke som handlelistens total.
const lineTotal = (i) => estimateCost(i);

/**
 * Sorterer og grupperer åpne varer.
 *
 * @returns {{key, label, rows}[]} — grupperte moduser gir én gruppe per
 *   kategori med label; flate moduser gir én gruppe med label null.
 */
export function sortShoppingItems(items, mode, { positionOf, defaultStore = 'Coop Extra', currentStore } = {}) {
  if (!items.length) return [];

  if (mode === 'alfabetisk') {
    return [{ key: 'alle', label: null, rows: [...items].sort(byName) }];
  }

  if (mode === 'pris') {
    // Dyrest først — det er totalbeløpet man vil ha øye på. Varer uten
    // pris kan ikke rangeres, så de samles nederst i stedet for å late
    // som de koster null.
    const priced = items.filter((i) => lineTotal(i) > 0)
      .sort((a, b) => lineTotal(b) - lineTotal(a) || byName(a, b));
    const unpriced = items.filter((i) => lineTotal(i) <= 0).sort(byName);
    const groups = [{ key: 'pris', label: null, rows: priced }];
    if (unpriced.length) groups.push({ key: 'uten-pris', label: 'Uten pris', rows: unpriced });
    return groups;
  }

  if (mode === 'nyeste') {
    const rows = [...items].sort((a, b) =>
      String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')) || byName(a, b));
    return [{ key: 'nyeste', label: null, rows }];
  }

  // Grupperte moduser: 'plukk' og 'kategori'.
  const byCategory = new Map();
  for (const item of items) {
    const cat = item.category || 'Annet';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat).push(item);
  }

  const groups = [...byCategory.entries()].map(([category, rows]) => ({
    key: category,
    label: category,
    rows: mode === 'kategori' ? [...rows].sort(byName) : rows,
  }));

  if (mode === 'kategori') {
    return groups.sort((a, b) => trimmed(a.label).localeCompare(trimmed(b.label), 'nb'));
  }

  // 'plukk': gruppert per BUTIKK, som i prototypen — butikkoverskrift med
  // antall og ca.-sum, og varene innenfor sortert i den butikkens lærte
  // rute. Butikken man står i (currentStore) kommer først.
  const byStore = new Map();
  for (const item of items) {
    const st = item.store || defaultStore;
    if (!byStore.has(st)) byStore.set(st, []);
    byStore.get(st).push(item);
  }

  const active = currentStore ?? defaultStore;
  return [...byStore.entries()]
    .map(([store, rows]) => ({
      key: `store:${store}`,
      label: store,
      kind: 'store',
      sum: rows.reduce((s, i) => s + lineTotal(i), 0),
      rows: [...rows].sort((a, b) => {
        const pa = positionOf ? positionOf(store, a.category || 'Annet') : 0;
        const pb = positionOf ? positionOf(store, b.category || 'Annet') : 0;
        return pa - pb;
      }),
    }))
    .sort((a, b) => {
      if (a.label === active && b.label !== active) return -1;
      if (b.label === active && a.label !== active) return 1;
      return a.label.localeCompare(b.label, 'nb');
    });
}
