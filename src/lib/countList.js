// Tellelister — samme liste som pakkelistene, men laget for å TELLE:
// hovedvare med varianter under (Sko → str. 39, 40, 41), antall som økes
// i valgfrie steg, og eksport til Excel/CSV eller utskrift/PDF.
//
// Hver linje har en stabil id, slik at databasen kan øke ÉN linje atomisk
// (count_bump) mens flere teller samtidig.

export const newId = () => Math.random().toString(36).slice(2, 10);

/** Én tellelinje: {id, g: hovedvare|null, n: variant/navn, qty, chk}. */
export const countItem = (group, name, qty = 0) => ({
  id: newId(),
  g: group ? String(group).trim() : null,
  n: String(name ?? '').trim(),
  qty: Math.max(0, Math.round(Number(qty) || 0)),
  chk: false,
});

/**
 * Gir linjer uten id en stabil id. Gamle lister (laget som pakkeliste)
 * kan mangle den, og uten id kan ikke telling skje atomisk.
 */
export function ensureIds(items) {
  return (items ?? []).map((i) => (i.id ? i : { ...i, id: newId() }));
}

export const needsIds = (items) => (items ?? []).some((i) => !i.id);

/**
 * Tolker én innskrevet linje:
 *   «Sko / 39»      → hovedvare Sko, variant 39
 *   «Sko: 39 x10»   → hovedvare Sko, variant 39, antall 10
 *   «Kjegler x24»   → uten hovedvare, antall 24
 */
export function parseCountLine(text) {
  let s = String(text ?? '').trim();
  let qty = 0;
  const m = s.match(/[x×]\s*(\d+)\s*$/i);
  if (m) {
    qty = Number(m[1]);
    s = s.slice(0, m.index).trim();
  }
  const parts = s.split(/\s*[/:]\s*/).filter(Boolean);
  if (parts.length >= 2) {
    return { group: parts[0], name: parts.slice(1).join(' / '), qty };
  }
  return { group: null, name: s, qty };
}

/** Grupperer i hovedvarer med delsum, i den rekkefølgen de ble lagt inn. */
export function groupItems(items) {
  const order = [];
  const map = new Map();
  for (const it of items ?? []) {
    const key = it.g || '';
    if (!map.has(key)) { map.set(key, []); order.push(key); }
    map.get(key).push(it);
  }
  return order.map((key) => {
    const rows = map.get(key);
    return {
      group: key || null,
      rows,
      sum: rows.reduce((s, r) => s + (Number(r.qty) || 0), 0),
    };
  });
}

/** Antall linjer og totalt antall enheter. */
export function countTotals(items) {
  const list = items ?? [];
  return {
    lines: list.length,
    units: list.reduce((s, i) => s + (Number(i.qty) || 0), 0),
  };
}

/** Lokal (optimistisk) økning — databasen gjør den ekte, atomisk. */
export function bumpLocal(items, id, delta) {
  return (items ?? []).map((i) => (i.id === id
    ? { ...i, qty: Math.max(0, (Number(i.qty) || 0) + delta) }
    : i));
}

export const removeById = (items, id) => (items ?? []).filter((i) => i.id !== id);

/** Setter antallet direkte (når noen skriver inn tallet selv). */
export function setQty(items, id, qty) {
  const n = Math.max(0, Math.round(Number(qty) || 0));
  return (items ?? []).map((i) => (i.id === id ? { ...i, qty: n } : i));
}

const csvEscape = (v) => {
  const s = String(v ?? '');
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * CSV med semikolon og BOM — åpner rett i norsk Excel ved dobbeltklikk,
 * uten importveiviser.
 */
/**
 * Excel tolker en celle som starter med = + - eller @ som en FORMEL.
 * «-39» er et helt naturlig variantnavn i en telleliste, og «=HYPERLINK(…)»
 * i et navn ville kjørt hos den som åpner fila. En apostrof foran gjør
 * cellen til tekst; Excel viser den ikke.
 */
const csvCell = (v) => {
  const t = String(v ?? '');
  return /^[=+\-@\t\r]/.test(t) ? `'${t}` : t;
};

export function toCsv(list) {
  const items = list?.items ?? [];
  const rows = [['Hovedvare', 'Variant', 'Antall']];
  for (const g of groupItems(items)) {
    for (const r of g.rows) rows.push([g.group ?? '', r.n, Number(r.qty) || 0]);
  }
  const { units } = countTotals(items);
  rows.push(['', '', '']);
  rows.push(['', 'Totalt', units]);
  return `﻿${rows.map((r) => r.map((c) => csvEscape(csvCell(c))).join(';')).join('\r\n')}`;
}

/** Filnavn: telling-utstyr-2026-08-31.csv */
export function csvName(list, today = new Date()) {
  const slug = String(list?.name ?? 'telling')
    .toLowerCase()
    .replace(/[æ]/g, 'ae').replace(/[ø]/g, 'oe').replace(/[å]/g, 'aa')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'telling';
  return `telling-${slug}-${today.toISOString().slice(0, 10)}.csv`;
}

/**
 * Nytt navn på én variantlinje — «41» → «42».
 * Tomt navn ignoreres; en linje uten navn kan ingen telle.
 */
export function renameItem(items, id, name) {
  const n = String(name ?? '').trim();
  if (!n) return items ?? [];
  return (items ?? []).map((i) => (i.id === id ? { ...i, n } : i));
}

/**
 * Nytt navn på en hovedvare — «Sko» → «Lue». Alle variantene under følger
 * med, siden gruppen bare er et felt på hver linje.
 *
 * Finnes navnet fra før, slås gruppene sammen. Det er som regel det man
 * vil (man rettet en skrivefeil), og alternativet — to grupper med samme
 * navn — er uansett ikke noe listen kan vise fornuftig.
 */
export function renameGroup(items, from, to) {
  const t = String(to ?? '').trim();
  if (!t) return items ?? [];
  return (items ?? []).map((i) => ((i.g ?? '') === (from ?? '') ? { ...i, g: t } : i));
}
