// Relevans-scoring for tilbud.
//
// Portert fra prototypens offerCards-beregning. Poenget er å vise FÅ tilbud
// som faktisk angår denne familien, ikke alt som er på salg: terskelen på 45
// gjør at et tilfeldig tilbud på en vare dere aldri kjøper faller ut.

import { contradictsProduct } from './priceDrop.js';
// kr() ble brukt i begrunnelsen «under deres vanlige pris» uten å være
// importert. Det ga «kr is not defined» — og siden både Tilbud og Forslag
// rangerer tilbud, ble begge fanene blanke i det ett tilbud var billigere
// enn snittprisen i varedatabasen.
import { kr } from './format.js';

export const RELEVANCE_THRESHOLD = 45;

/** Merkelapp-oppslag som tåler både Set og liste. */
function hasKey(bag, key) {
  if (!bag || !key) return false;
  if (typeof bag.has === 'function') return bag.has(key);
  return Array.isArray(bag) && bag.includes(key);
}

const PREFS_KEY = 'fl-offer-prefs-v1';

/** Per-bruker preferanser: skjult denne uken, eller aldri vis igjen. */
export function loadOfferPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; }
  catch { return {}; }
}

export function saveOfferPrefs(prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignorer */ }
}

export const discountPercent = (offer) =>
  offer.original_price > 0
    ? Math.round((1 - Number(offer.price) / Number(offer.original_price)) * 100)
    : 0;

/**
 * Regner ut relevans for ett tilbud og forklarer hvorfor.
 *
 * @returns {{score:number, reasons:string[], onList:object|null, discount:number}}
 */
export function scoreOffer(offer, ctx) {
  const {
    catalog = [],
    shopItems = [],
    plannedIngredients = new Set(),
    staples = new Set(),
    dairyFree = new Set(),
    defaultStoreCode = 'COOP_EXTRA',
  } = ctx;

  // match_name er hvilken katalogvare tilbudet SKAL være. Feltet skrives av
  // importer og scan, og et feiltreff der forplanter seg til påstanden
  // «dere kjøper soyamelk ofte» over en energidrikk. Derfor stoles det bare
  // på når produktnavnet faktisk bekrefter det.
  const productName = String(offer.product_name ?? '');
  const claimed = String(offer.match_name ?? '');
  // Mild port ved LESING: vi kaster bare koblingen når noe motsier den.
  // Å kreve bekreftelse her tok livet av «Brød → Kneippbrød» og
  // «Laks → Salma Ryggfilet» sammen med Battery-feilen.
  const trusted = claimed && !contradictsProduct(claimed, productName.trim());
  const matchName = String((trusted ? claimed : productName) || claimed || '');
  const key = matchName.toLowerCase();
  // Én rad uten navn (eller med et tall som navn) skal ikke velte fanen.
  const lower = (v) => String(v ?? '').toLowerCase();

  const catalogHit = key ? catalog.find((c) => lower(c.name) === key) : null;
  const onList = key ? shopItems.find((s) => lower(s.name) === key && !s.checked) : null;
  const discount = discountPercent(offer);

  let score = 0;
  const reasons = [];

  // Kjøpsfrekvens fra kvitteringene veier tyngst.
  if (catalogHit && /Ofte|Svært ofte/i.test(catalogHit.frequency_sig || '')) {
    score += 40;
    reasons.push(`dere kjøper ${matchName.toLowerCase()} ofte`);
  } else if (catalogHit) {
    score += 15;
    reasons.push('ligger i varedatabasen deres');
  }

  if (key && plannedIngredients.has(key)) {
    score += 25;
    reasons.push('brukes i middagsplanen denne uken');
  }

  if (hasKey(staples, key)) {
    score += 20;
    reasons.push('fast husholdningsvare');
  }

  if (hasKey(dairyFree, key)) {
    score += 15;
    reasons.push('melkefritt alternativ');
  }

  if (discount >= 25) {
    score += 20;
    reasons.push(`${discount} % rabatt`);
  }

  // Terskler regnet av egne observasjoner slår «under snittprisen». En
  // påstått rabatt er ikke nødvendigvis et godt kjøp; dette er (§8, §16).
  const verdict = priceVerdict(offer, catalogHit);
  if (verdict) {
    score += verdict.level === 'excellent' ? 25 : 15;
    reasons.push(verdict.text);
  } else if (catalogHit?.avg_price && Number(offer.price) < Number(catalogHit.avg_price)) {
    score += 15;
    reasons.push(`under deres vanlige pris (ca. ${kr(catalogHit.avg_price)})`);
  }

  // Liten vekt mot butikken dere handler mest i.
  score += offer.store_code === defaultStoreCode ? 10 : 5;

  // Ligger den alt på listen, er tilbudet mindre interessant å foreslå.
  if (onList) score -= 30;

  return { score, reasons, onList, discount };
}

/**
 * Rangerer tilbud etter relevans. Utløpte vises aldri, og det samme gjelder
 * dem brukeren har skjult.
 */
export function rankOffers(offers, ctx, prefs = {}) {
  const today = new Date().toISOString().slice(0, 10);

  return offers
    .filter((o) => !o.valid_to || o.valid_to >= today)
    .filter((o) => prefs[o.id] !== 'not_relevant' && prefs[o.id] !== 'later')
    .map((o) => ({ offer: o, ...scoreOffer(o, ctx) }))
    .filter((r) => r.score >= RELEVANCE_THRESHOLD)
    .sort((a, b) => b.score - a.score);
}

/** «Dere kjøper melk ofte, 30 % rabatt.» */
export function reasonText(reasons) {
  if (!reasons.length) return '';
  const joined = reasons.join(', ');
  return joined.charAt(0).toUpperCase() + joined.slice(1) + '.';
}

/** Butikknavn -> kode, for å sammenligne mot husholdningens standardbutikk. */
export const STORE_CODES = {
  'Coop Extra': 'COOP_EXTRA',
  KIWI: 'KIWI',
  'Rema 1000': 'REMA_1000',
  Meny: 'MENY_NO',
  'Coop Obs': 'COOP_OBS',
  Spar: 'SPAR_NO',
  Joker: 'JOKER',
};


/**
 * «God pris» eller «Svært god pris» — målt mot HVA DERE PLEIER Å BETALE,
 * ikke mot butikkens førpris (§8, §16).
 *
 * Trenger tersklene learn-prices regner på item_catalog. Uten dem: null,
 * og tilbudet vurderes som før.
 *
 * @returns {{level:'good'|'excellent', label:string, text:string, usual:number, saving:number}|null}
 */
export function priceVerdict(offer, catalogHit) {
  const price = Number(offer?.unit_price ?? offer?.price);
  const good = Number(catalogHit?.good_price_threshold);
  const excellent = Number(catalogHit?.excellent_price_threshold);
  const usual = Number(catalogHit?.recent_avg_price ?? catalogHit?.avg_price);
  if (!(price > 0) || !(good > 0) || !(usual > 0)) return null;
  if (price >= good) return null;
  const level = excellent > 0 && price < excellent ? 'excellent' : 'good';
  const saving = Number((usual - price).toFixed(2));
  const label = level === 'excellent' ? 'Svært god pris' : 'God pris';
  return {
    level, label, usual, saving,
    text: saving > 0
      ? `${label.toLowerCase()} — dere betaler vanligvis ca. ${kr(usual)}, ${kr(saving)} lavere enn normalt`
      : label.toLowerCase(),
  };
}
