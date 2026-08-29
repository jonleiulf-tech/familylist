// Normalisering av eTilbudsavis-data (Tjek/ShopGun).
//
// Ligger i src/lib framfor i Edge Functionen fordi logikken er ren og
// testbar her. Edge Functionen importerer den samme koden.
//
// Kildeformatet: et «hotspot» er ett tilbud plassert på en side i
// kundeavisen — varenavn, pris, og som regel en førpris.

/** Butikk-ID-er hos Tjek. Joker er oppgitt i handoff-en. */
export const DEALERS = {
  JOKER: 'b3e8Fm',
};

/** Tjek-dealer -> butikkode i vår database. */
export const DEALER_TO_STORE = {
  b3e8Fm: { code: 'JOKER', name: 'Joker' },
};

/** «Norvegia 1 kg» -> «norvegia 1 kg». Fjerner støy for matching. */
export function normalizeProductName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[«»"'()]/g, ' ')
    .replace(/\b(pr\.?|per)\s*(stk|kg|l|pk)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** «4 x 1,5 l» / «500 g» / «1 kg» -> {value, unit} eller null. */
export function parseSize(text) {
  const s = String(text || '').toLowerCase().replace(',', '.');

  const multi = s.match(/(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|l|dl|ml|cl)\b/);
  if (multi) {
    return { value: Number(multi[1]) * Number(multi[2]), unit: multi[3] };
  }
  const single = s.match(/(\d+(?:\.\d+)?)\s*(kg|g|l|dl|ml|cl)\b/);
  if (single) return { value: Number(single[1]), unit: single[2] };
  return null;
}

/** Enhetspris i kr/kg eller kr/l. Returnerer null når størrelsen er ukjent. */
export function unitPriceFor(price, size) {
  if (!size || !Number.isFinite(price) || size.value <= 0) return null;
  const toKilo = { kg: 1, g: 0.001 };
  const toLitre = { l: 1, dl: 0.1, cl: 0.01, ml: 0.001 };

  if (toKilo[size.unit]) {
    return { value: Number((price / (size.value * toKilo[size.unit])).toFixed(2)), unit: 'kg' };
  }
  if (toLitre[size.unit]) {
    return { value: Number((price / (size.value * toLitre[size.unit])).toFixed(2)), unit: 'l' };
  }
  return null;
}

/**
 * Kobler et tilbud mot varekatalogen.
 * Prioritet fra handoff-en: eksakt normalisert navn -> merke+type -> fuzzy.
 * Returnerer katalognavnet eller null.
 */
export function matchToCatalog(productName, catalogNames) {
  const q = normalizeProductName(productName);
  if (!q) return null;

  // Eksakt
  const exact = catalogNames.find((n) => normalizeProductName(n) === q);
  if (exact) return exact;

  // Katalognavnet forekommer som eget ord i tilbudsnavnet:
  // «Norvegia Original 1kg» -> «Norvegia»
  const words = q.split(' ');
  const contained = catalogNames
    .filter((n) => {
      const nn = normalizeProductName(n);
      return nn.length >= 4 && words.includes(nn);
    })
    .sort((a, b) => b.length - a.length)[0];
  if (contained) return contained;

  // Delstreng, lengste treff vinner — «gulost» i «revet gulost 200g»
  const partial = catalogNames
    .filter((n) => {
      const nn = normalizeProductName(n);
      return nn.length >= 5 && q.includes(nn);
    })
    .sort((a, b) => b.length - a.length)[0];
  return partial ?? null;
}

/**
 * Gjør ett Tjek-hotspot om til en rad i offers-tabellen.
 * Returnerer null for hotspots uten brukbar pris — de skal ikke lagres.
 */
export function hotspotToOffer(hotspot, { dealerId, catalogNames = [], validFrom, validTo }) {
  const offer = hotspot?.offer ?? hotspot;
  const name = offer?.heading ?? offer?.name;
  const price = Number(offer?.pricing?.price ?? offer?.price);
  if (!name || !Number.isFinite(price) || price <= 0) return null;

  const original = Number(offer?.pricing?.pre_price ?? offer?.pre_price);
  const store = DEALER_TO_STORE[dealerId] ?? { code: null, name: null };

  const sizeText = [offer?.quantity?.size?.to, offer?.description, name]
    .filter(Boolean).join(' ');
  const size = parseSize(sizeText);
  const unitPrice = unitPriceFor(price, size);

  return {
    store_code: store.code,
    store_name: store.name,
    product_name: String(name).trim(),
    normalized_name: normalizeProductName(name),
    match_name: matchToCatalog(name, catalogNames),
    price: Number(price.toFixed(2)),
    original_price: Number.isFinite(original) && original > price
      ? Number(original.toFixed(2))
      : null,
    unit: unitPrice?.unit ?? null,
    unit_price: unitPrice?.value ?? null,
    valid_from: validFrom ?? null,
    valid_to: validTo ?? null,
    source: `${store.name ?? 'eTilbudsavis'} kundeavis`,
    source_type: 'api',
    source_url: offer?.webshop_link ?? null,
    is_sample: false,
  };
}

/** Fjerner duplikater — samme vare kan stå flere steder i samme avis. */
export function dedupeOffers(offers) {
  const seen = new Map();
  for (const o of offers) {
    const key = `${o.store_code}|${o.normalized_name}`;
    const existing = seen.get(key);
    // Behold den billigste når samme vare finnes flere ganger.
    if (!existing || o.price < existing.price) seen.set(key, o);
  }
  return [...seen.values()];
}
