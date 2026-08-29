// AUTOGENERERT — ikke rediger.
// Kilde: src/lib/kassalRank.js. Kjør `npm run sync:shared` etter endringer der.
// Testene ligger sammen med kilden.

// Rangering av Kassalapp-treff.
//
// Problemet: et søk på «melk» gir kondensmelk, mandelmelk og kokosmelk før
// vanlig melk. Alle er sammensetninger som slutter på «melk», men bare noen
// av dem ER melk.
//
// Nøkkelen er hva som står FORAN. «Lett-», «hel-», «skummet-» er
// fettbeskrivelser som beholder produktet. «Kondens-», «mandel-», «kokos-»
// er egne råvarer som gjør det til noe annet. Kvalifikator-listen er kort
// og lukket; lista over «alt annet» ville vært uendelig.

/** Forstavelser som beskriver varianten, men beholder produktet. */
const QUALIFIERS = new Set([
  'lett', 'ekstra', 'ekstralett', 'hel', 'skummet', 'sur', 'søt',
  'øko', 'økologisk', 'fersk', 'lang', 'langtidsholdbar', 'mager',
  'full', 'halv', 'grov', 'fin', 'kald', 'varm', 'stor', 'liten',
  'mini', 'maxi', 'super', 'ny', 'gammel', 'norsk', 'lokal',
]);

/**
 * Poengsetter ett produktnavn mot søkeordet.
 *
 * @param {string} q     søkeordet, lowercase
 * @param {string} name  produktnavnet
 * @param {object} opts  {price, expectedPrice} for prisnærhet
 */
export function rank(q, name, opts = {}) {
  const n = String(name || '').toLowerCase();
  const words = n.split(/[\s,()\-/]+/).filter(Boolean);
  if (!words.length || !q) return 0;

  let s = 0;

  if (n === q) {
    s = 100;
  } else if (words[0] === q) {
    s = 95;                                     // «Melk 1l»
  } else if (words.includes(q)) {
    // Søkeordet står som eget ord: «Tine Melk 1l». Dette er et sterkere
    // signal enn en sammensetning, og lå tidligere for lavt.
    s = 88;
  } else if (words[0].endsWith(q) && words[0].length > q.length) {
    const prefix = words[0].slice(0, -q.length);
    // «Lettmelk» beholder produktet. «Kondensmelk» gjør det ikke.
    s = QUALIFIERS.has(prefix) ? 85 : 42;
  } else if (words.some((w) => w.endsWith(q) && w.length > q.length)) {
    const w = words.find((x) => x.endsWith(q) && x.length > q.length);
    const prefix = w.slice(0, -q.length);
    s = QUALIFIERS.has(prefix) ? 70 : 34;
  } else if (words[0].startsWith(q)) {
    s = 30;                                     // «Melkesjokolade» — ned
  } else if (n.includes(q)) {
    s = 12;
  }

  if (!s) return 0;

  // Korte, rene produktnavn foran lange beskrivelser.
  s -= Math.min(15, Math.max(0, words.length - 3) * 3);

  // Prisnærhet: familiens egen snittpris er et sterkt signal om hvilket
  // produkt de faktisk mener. Kondensmelk til 44,90 er ikke melken de
  // pleier å kjøpe til 25.
  const price = Number(opts.price);
  const expected = Number(opts.expectedPrice);
  if (Number.isFinite(price) && price > 0 && Number.isFinite(expected) && expected > 0) {
    const ratio = price / expected;
    if (ratio >= 0.6 && ratio <= 1.6) s += 14;
    else if (ratio > 2.5 || ratio < 0.25) s -= 18;
  }

  return s;
}

/** Sorterer og kutter treffene. */
export function rankProducts(query, products, { expectedPrice, size = 10 } = {}) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  return products
    .filter((p) => p.name)
    .map((p) => [rank(q, p.name, { price: p.current_price, expectedPrice }), p])
    .sort((a, b) => b[0] - a[0])
    .slice(0, size)
    .map(([, p]) => p);
}
