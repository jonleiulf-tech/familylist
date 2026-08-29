// Google Keep-import med vasking.
//
// Idéen: det som helt sikkert er riktig skal gå gjennom uten å spørre, og
// bare det usikre skal koste brukeren oppmerksomhet. Ellers blir importen
// av en lang liste et klikkemareritt.
//
// Tre utfall per linje:
//   exact    — eksakt treff etter normalisering. Går rett inn.
//   fuzzy    — sannsynlig treff. Havner i «Trenger avklaring» med forslag.
//   unknown  — ingen kobling. Ny vare / Senere / Dropp.

import { normalizeName, resolveCatalogItem, guessUnit } from './catalog.js';

/** «2 liter melk» / «melk x2» / «3x brød» -> {qty, unit, name}. */
export function parseImportLine(raw) {
  let line = String(raw || '')
    .replace(/^\s*[-*•·]\s*/, '')
    .replace(/^\s*\[[ xX]?\]\s*/, '')
    .replace(/^\s*\d+[.)]\s*/, '')
    .trim();
  if (!line) return null;

  let qty = 1;
  let unit = null;

  // «melk x2» eller «melk 2x» bakerst
  const trailing = line.match(/^(.*?)\s*[x×]\s*(\d+)\s*$/i) || line.match(/^(.*?)\s*(\d+)\s*[x×]\s*$/i);
  if (trailing) {
    line = trailing[1].trim();
    qty = Number(trailing[2]);
  } else {
    // «2 liter melk», «3 brød», «500 g kjøttdeig»
    const leading = line.match(/^(\d+(?:[.,]\d+)?)\s*(l|liter|kg|g|gram|ml|dl|stk|pk|pakke|pakker|boks|bokser)?\s+(.+)$/i);
    if (leading) {
      qty = Number(leading[1].replace(',', '.'));
      unit = leading[2] ? leading[2].toLowerCase() : null;
      line = leading[3].trim();
    }
  }

  if (!line) return null;
  // Normaliser enhetsforkortelser til det appen bruker ellers.
  const UNIT_MAP = { l: 'liter', gram: 'g', pk: 'pakke', pakker: 'pakke', bokser: 'boks' };
  return { qty: qty > 0 ? qty : 1, unit: unit ? (UNIT_MAP[unit] ?? unit) : null, name: line };
}

/**
 * Klassifiserer én linje mot varekatalogen.
 * Eksakt treff (etter normalisering) er trygt nok til å slippe gjennom stille.
 */
export function classifyLine(parsed, catalog, normRules) {
  const normalized = normalizeName(parsed.name, normRules);
  const exact = catalog.find((c) => c.name.toLowerCase() === normalized.toLowerCase());

  if (exact) {
    return { status: 'exact', name: exact.name, match: exact, raw: parsed.name };
  }

  const { name, item } = resolveCatalogItem(parsed.name, catalog, normRules);
  if (item) {
    return { status: 'fuzzy', name, match: item, raw: parsed.name };
  }
  return { status: 'unknown', name: normalized, match: null, raw: parsed.name };
}

/** Gjør et klassifisert treff om til en rad handlelisten forstår. */
export function toShoppingRow(entry, parsed, defaultStore) {
  const item = entry.match;
  const unit = parsed.unit ?? guessUnit(entry.name, item?.major_category);
  return {
    name: entry.name,
    qty: parsed.qty,
    unit,
    category: item?.major_category || 'Annet',
    store: item?.primary_store || defaultStore,
    price: item?.avg_price ?? null,
    price_source: item?.avg_price ? 'receipt' : null,
  };
}

/**
 * Hele importen i ett kall.
 * @returns {{auto: object[], review: object[], skipped: number}}
 *   auto   — går rett på listen
 *   review — «Trenger avklaring»
 */
export function processImport(text, catalog, normRules, defaultStore = 'Coop Extra') {
  const source = String(text || '');
  // Uten denne ville tom input gitt «hoppet over 1 tom linje», siden
  // ''.split('\n') returnerer én tom streng.
  if (!source.trim()) return { auto: [], review: [], skipped: 0 };
  const lines = source.split('\n');
  const auto = [];
  const review = [];
  let skipped = 0;
  const seen = new Set();

  for (const line of lines) {
    const parsed = parseImportLine(line);
    if (!parsed) { skipped += 1; continue; }

    const entry = classifyLine(parsed, catalog, normRules);

    // Samme vare to ganger i samme lim-inn: slå sammen i stedet for å
    // spørre om det samme to ganger.
    const key = entry.name.toLowerCase();
    if (seen.has(key)) {
      const target = [...auto, ...review].find((r) => (r.row?.name ?? r.name).toLowerCase() === key);
      if (target) {
        if (target.row) target.row.qty += parsed.qty;
        else target.qty += parsed.qty;
      }
      continue;
    }
    seen.add(key);

    if (entry.status === 'exact') {
      auto.push(toShoppingRow(entry, parsed, defaultStore));
    } else {
      review.push({
        raw: entry.raw,
        suggestion: entry.status === 'fuzzy' ? entry.name : null,
        status: entry.status,
        row: toShoppingRow(entry, parsed, defaultStore),
      });
    }
  }

  return { auto, review, skipped };
}
