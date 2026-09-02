// AUTOGENERERT — ikke rediger.
// Kilde: src/lib/pdfLines.js. Kjør `npm run sync:shared` etter endringer der.
// Testene ligger sammen med kilden.

// Bygger LINJER av tekstbitene i en PDF.
//
// Kvitteringsparseren vår står og faller på linjeskift: et varenavn og
// beløpet under det, eller «navn  beløp» på samme linje. PDF-er har ingen
// linjer — de har tekstbiter med koordinater. Biblioteket vi brukte slo
// alle bitene sammen med mellomrom, så en hel kvittering kom ut som ÉN
// linje. Da fant parseren ingen varelinjer, og opplastingen ble avvist med
// «Fant færre enn to varelinjer» — på en kvittering som var helt i orden.
//
// Her grupperes bitene etter y-koordinat (samme høyde = samme linje) og
// sorteres etter x innenfor linja. To biter med et tydelig mellomrom
// mellom seg får to mellomrom, slik at «AGURK STK   33.48» kan leses som
// navn + beløp av samme regel som håndterer papirkvitteringer.

/** Hvor mange punkter to biter kan avvike i høyde og likevel være samme linje. */
const Y_TOLERANCE = 2.5;

/** Hull i punkter som regnes som kolonneskift, ikke et vanlig ordmellomrom. */
const COLUMN_GAP = 8;

/**
 * @param {Array<{str: string, transform?: number[], x?: number, y?: number, width?: number}>} items
 *   Tekstbiter slik pdf.js gir dem (transform[4] = x, transform[5] = y).
 * @returns {string[]} linjer ovenfra og ned.
 */
export function linesFromTextItems(items) {
  const points = [];
  for (const it of items ?? []) {
    const str = typeof it?.str === 'string' ? it.str : '';
    if (!str.trim()) continue;
    const x = Number(it.x ?? it.transform?.[4] ?? 0);
    const y = Number(it.y ?? it.transform?.[5] ?? 0);
    const width = Number(it.width ?? 0);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    points.push({ str, x, y, width: Number.isFinite(width) ? width : 0 });
  }
  if (!points.length) return [];

  // Y synker nedover siden i PDF-koordinater: høyest y er øverst.
  const rows = [];
  for (const p of [...points].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = rows.find((r) => Math.abs(r.y - p.y) <= Y_TOLERANCE);
    if (row) {
      row.items.push(p);
      // Snittet gjør raden robust mot biter som ligger en halv piksel av.
      row.y = (row.y * (row.items.length - 1) + p.y) / row.items.length;
    } else {
      rows.push({ y: p.y, items: [p] });
    }
  }

  return rows.map(({ items: cells }) => {
    const sorted = [...cells].sort((a, b) => a.x - b.x);
    let line = '';
    let cursorEnd = null;
    for (const cell of sorted) {
      if (line) {
        const gap = cell.x - (cursorEnd ?? cell.x);
        // Kolonneskift beholdes som doble mellomrom: det er skillet
        // mellom varenavn og beløp på en papirkvittering.
        line += gap >= COLUMN_GAP ? '  ' : (/\s$/.test(line) ? '' : ' ');
      }
      line += cell.str.trim();
      cursorEnd = cell.x + cell.width;
    }
    return line.replace(/\s{3,}/g, '  ').trim();
  }).filter(Boolean);
}
