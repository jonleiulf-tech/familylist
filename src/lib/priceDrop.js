// Oppdager tilbud ved å sammenligne dagens Kassalapp-pris mot familiens
// egen prishistorikk fra kvitteringene.
//
// Hvorfor dette er bedre enn en kundeavis: en kundeavis sier hva butikken
// vil selge. Denne sier hva som er billig FOR DERE, målt mot det dere
// faktisk har betalt før. «Norvegia til 89» betyr lite uten å vite at dere
// vanligvis betaler 110.

/** Under så mye av snittprisen regnes det som et tilbud. */
export const DROP_THRESHOLD = 0.12;      // 12 % under snitt
/** Sterkt tilbud: også under den laveste prisen dere har registrert. */
export const STRONG_DROP = 0.20;

/**
 * Vurderer om dagens pris er et tilbud for denne husholdningen.
 *
 * @param {number} currentPrice  dagens pris fra Kassalapp
 * @param {object} stats         {avg_price, price_low, price_high} fra item_catalog
 * @returns {{isOffer, drop, strength, reason}|null}
 */
export function detectPriceDrop(currentPrice, stats) {
  const price = Number(currentPrice);
  const avg = Number(stats?.avg_price);

  // Uten et snitt å måle mot kan vi ikke si om noe er billig.
  if (!Number.isFinite(price) || price <= 0) return null;
  if (!Number.isFinite(avg) || avg <= 0) return null;

  const drop = (avg - price) / avg;
  if (drop < DROP_THRESHOLD) return null;

  const low = Number(stats?.price_low);
  const belowLowest = Number.isFinite(low) && low > 0 && price < low;

  const strength = belowLowest || drop >= STRONG_DROP ? 'strong' : 'normal';

  const reason = belowLowest
    ? `Billigere enn dere noen gang har betalt (laveste før: kr ${low})`
    : `${Math.round(drop * 100)} % under deres snittpris på kr ${avg}`;

  return {
    isOffer: true,
    drop: Number(drop.toFixed(3)),
    strength,
    reason,
    belowLowest,
  };
}

/**
 * Gjør et Kassalapp-produkt om til en rad i offers-tabellen.
 * Returnerer null når prisen ikke er et tilbud for denne husholdningen.
 */
export function productToOffer(product, catalogItem, { validDays = 7 } = {}) {
  const detection = detectPriceDrop(product?.current_price, catalogItem);
  if (!detection) return null;

  const today = new Date();
  const validTo = new Date(today);
  validTo.setDate(validTo.getDate() + validDays);
  const iso = (d) => d.toISOString().slice(0, 10);

  return {
    store_code: product.store ?? null,
    store_name: product.store ?? null,
    product_name: product.name,
    normalized_name: String(product.name || '').toLowerCase().trim(),
    brand: product.brand || null,
    match_name: catalogItem.name,
    price: Number(Number(product.current_price).toFixed(2)),
    // «Førpris» er her familiens egen snittpris, ikke butikkens listepris.
    // Det er en ærligere referanse for dem, men merk kilden så det ikke
    // forveksles med en offisiell førpris fra butikken.
    original_price: Number(Number(catalogItem.avg_price).toFixed(2)),
    unit: product.weight_unit || null,
    unit_price: Number.isFinite(product.current_unit_price) && product.current_unit_price > 0
      ? Number(Number(product.current_unit_price).toFixed(2))
      : null,
    valid_from: iso(today),
    valid_to: iso(validTo),
    source: 'Kassalapp – under deres snittpris',
    source_type: 'api',
    source_url: product.url || null,
    is_sample: false,
  };
}

/** Sorterer tilbud slik de sterkeste kommer først. */
export function rankDrops(detections) {
  return [...detections].sort((a, b) => {
    if (a.strength !== b.strength) return a.strength === 'strong' ? -1 : 1;
    return b.drop - a.drop;
  });
}
