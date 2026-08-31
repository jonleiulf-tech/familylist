// Oppdager tilbud ved å sammenligne dagens Kassalapp-pris mot familiens
// egen prishistorikk fra kvitteringene.
//
// Hvorfor dette er bedre enn en kundeavis: en kundeavis sier hva butikken
// vil selge. Denne sier hva som er billig FOR DERE, målt mot det dere
// faktisk har betalt før. «Norvegia til 89» betyr lite uten å vite at dere
// vanligvis betaler 110.

import { conceptFor, dishConceptFor, isDerivedProduct } from './foodConcepts.js';

/**
 * Over dette er «rabatten» nesten alltid en datafeil, ikke et kupp.
 *
 * Snittprisen vår gjelder varen slik familien pleier å kjøpe den. Treffer
 * søket en porsjonspose ketchup på 11 g, blir den målt mot prisen på en
 * full flaske og kommer ut som «−97 %». Det er ikke et tilbud, det er to
 * forskjellige varer.
 */
export const MAX_PLAUSIBLE_DROP = 0.85;

/**
 * Er produktet Kassalapp returnerte faktisk den varen vi søkte etter?
 *
 * Uten denne sjekken ble det billigste treffet godtatt blindt, og
 * resultatet var tilbud som «Battery 0,5 l — dere kjøper soyamelk ofte»
 * og «My Pizza Slice — dere kjøper mozzarella ofte».
 */
export function sameProduct(catalogName, productName) {
  const cn = String(catalogName ?? '').trim();
  const pn = String(productName ?? '').trim();
  if (!cn || !pn) return false;

  // «Laksepostei» er ikke laks.
  if (isDerivedProduct(pn)) return false;

  // En ferdigrett er ikke råvaren den inneholder: en pizzaskive med
  // mozzarella er ikke et mozzarella-tilbud.
  const productDish = dishConceptFor(pn);
  if (productDish && productDish.id !== dishConceptFor(cn)?.id) return false;

  // Samme konsept holder — men BARE når konseptet er selve varen. Ellers
  // gjør et bakgrunnsord som «sukker» at «soyamelk uten sukker» og
  // «Battery med/uten sukker» regnes som samme vare.
  const a = conceptFor(cn);
  const b = conceptFor(pn);
  if (a && b && a.id === b.id && a.role !== 'background') return true;

  // Ellers må hvert meningsbærende ord i katalognavnet finnes igjen i
  // produktnavnet. Sammensetninger godtas begge veier, slik at «ketchup»
  // treffer «Tomatketchup» — men «soyamelk» finner ingenting i «Battery».
  const words = (t) => String(t).toLowerCase()
    .split(/[^a-zæøåé0-9]+/).filter((w) => w.length >= 4);
  const cw = words(cn);
  if (!cw.length) return false;
  const pw = words(pn);
  const hit = (w, p) => p === w
    || (w.length >= 5 && p.includes(w))
    || (p.length >= 5 && w.includes(p));
  return cw.every((w) => pw.some((p) => hit(w, p)));
}

/**
 * Kassalapp oppgir butikken som kode — «MENY_NO», «ODA_NO», «COOP_EXTRA».
 * Den skal ikke stå slik i appen.
 */
const STORE_LABELS = {
  MENY_NO: 'MENY', ODA_NO: 'Oda', KIWI_NO: 'KIWI', SPAR_NO: 'SPAR',
  JOKER_NO: 'Joker', BUNNPRIS: 'Bunnpris', COOP_EXTRA: 'Coop Extra',
  COOP_MEGA: 'Coop Mega', COOP_PRIX: 'Coop Prix', COOP_OBS: 'Obs',
  COOP_MARKED: 'Coop Marked', REMA_1000: 'REMA 1000', EUROPRIS_NO: 'Europris',
};

export function storeLabel(code) {
  const raw = String(code ?? '').trim();
  if (!raw) return null;
  const key = raw.toUpperCase().replace(/[\s-]+/g, '_');
  if (STORE_LABELS[key]) return STORE_LABELS[key];
  // Ukjent kjede: fjern landkoden og gjør understrek til mellomrom.
  return key.replace(/_NO$/, '').replace(/_/g, ' ');
}

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
  // For godt til å være sant er det som regel også.
  if (drop > MAX_PLAUSIBLE_DROP) return null;

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
  // Feil vare gir feil tilbud, uansett hvor god prisen ser ut.
  if (!sameProduct(catalogItem?.name, product?.name)) return null;
  const detection = detectPriceDrop(product?.current_price, catalogItem);
  if (!detection) return null;

  const today = new Date();
  const validTo = new Date(today);
  validTo.setDate(validTo.getDate() + validDays);
  const iso = (d) => d.toISOString().slice(0, 10);

  return {
    store_code: product.store ?? null,
    store_name: storeLabel(product.store),
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
