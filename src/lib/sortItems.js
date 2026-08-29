// Sortering av handlelisten.
//
// Standard er lært handlemønster — rekkefølgen kategoriene faktisk plukkes
// i butikken. Men den som vil se dyrest først, eller bare finne igjen en
// vare alfabetisk, skal få velge det selv.

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

const byName = (a, b) => a.name.localeCompare(b.name, 'nb');
const lineTotal = (i) => (Number(i.price) || 0) * (Number(i.qty) || 1);

/**
 * Sorterer og grupperer åpne varer.
 *
 * @returns {{key, label, rows}[]} — grupperte moduser gir én gruppe per
 *   kategori med label; flate moduser gir én gruppe med label null.
 */
export function sortShoppingItems(items, mode, { positionOf, defaultStore = 'Coop Extra' } = {}) {
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
    return groups.sort((a, b) => a.label.localeCompare(b.label, 'nb'));
  }

  // 'plukk': lært rekkefølge per butikk, som før.
  return groups
    .map((g) => ({
      ...g,
      pos: positionOf ? positionOf(g.rows[0].store || defaultStore, g.label) : 0,
    }))
    .sort((a, b) => a.pos - b.pos || a.label.localeCompare(b.label, 'nb'));
}
