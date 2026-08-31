// Oppdager tilbud ved å sammenligne dagens Kassalapp-pris mot familiens
// egen prishistorikk fra kvitteringene.
//
// Hvorfor dette er bedre enn en kundeavis: en kundeavis sier hva butikken
// vil selge. Denne sier hva som er billig FOR DERE, målt mot det dere
// faktisk har betalt før. «Norvegia til 89» betyr lite uten å vite at dere
// vanligvis betaler 110.

import {
  conceptFor, dishConceptFor, isDerivedProduct, normalizeText, synonymsOf,
} from './foodConcepts.js';

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
/**
 * Retter som selges ferdige. Bare disse diskvalifiserer en råvare — en
 * «grillpølse» er fortsatt pølse, mens en «pizza med kjøttdeig» ikke er
 * kjøttdeig.
 */
const PREPARED_DISHES = new Set(['pizza', 'suppe', 'salat', 'pai', 'gryte', 'panne']);

/**
 * Etterledd som beskriver en FORM av samme råvare. «Laksefilet» er laks,
 * «kaffefilter» er ikke kaffe — forskjellen er at «filet» er en utskjæring
 * og «filter» er et helt annet produkt.
 */
const FORM_SUFFIXES = [
  'filet', 'fileter', 'biff', 'deig', 'kjøtt', 'skive', 'skiver', 'stykke',
  'stykker', 'strimler', 'terninger', 'koteletter', 'karbonader', 'ribbe',
  'lår', 'bryst', 'rygg', 'vinger', 'mix', 'blanding', 'hakk',
];

/** Bøyningsendelser: «brød» → «brødet», «pose» → «poser». */
const INFLECTIONS = new Set(['', 'en', 'et', 'er', 'ene', 'a', 'e', 's', 'ar', 'ene']);

/**
 * Beskriver produktordet samme vare som katalogordet?
 *
 * Norsk setter HODET sist i en sammensetning, og det avgjør alt:
 *   «kneippbrød» ender på brød  → det ER et brød
 *   «kaffefilter» starter med kaffe → hodet er «filter», altså noe annet
 *
 * Forledd godtas bare når etterleddet beskriver en utskjæring av samme
 * råvare («laksefilet»), ikke når det gjør varen til noe annet
 * («kjøttdeigsaus», «melkesjokolade»).
 */
export function wordMatch(catalogWord, productWord) {
  const cw = catalogWord;
  const pw = productWord;
  if (cw === pw) return true;

  if (pw.startsWith(cw)) {
    const raw = pw.slice(cw.length);
    if (INFLECTIONS.has(raw)) return true;
    // Både med og uten fuge-e/-s, ellers blir «-saus» til «-aus».
    // Fugeformer: laks·e·filet, kjøtt·s·deig, lam·me·lår.
    const tails = [raw, raw.replace(/^[es]/, ''), raw.replace(/^me/, '')];
    return tails.some((t) => FORM_SUFFIXES.includes(t));
  }

  // Katalogordet er hodet: «lettmelk» ⊂ melk, «jasminris» ⊂ ris. Krever at
  // forleddet er minst to tegn, ellers gjør «gris» seg til «ris».
  if (pw.endsWith(cw) && pw.length - cw.length >= 2) return true;

  return false;
}

/**
 * Er produktet faktisk den katalogvaren vi tror?
 *
 * Uten denne sjekken godtas det billigste søketreffet blindt, og resultatet
 * blir tilbud som «Battery 0,5 l — dere kjøper soyamelk ofte» og
 * «Grandiosa Pizza Kjøttdeig & Løk — dere kjøper kjøttdeig ofte».
 */
export function sameProduct(catalogName, productName) {
  const cn = String(catalogName ?? '').trim();
  const pn = String(productName ?? '').trim();
  if (!cn || !pn) return false;

  // «Laksepostei» er ikke laks — men er katalogvaren SELV et avledet
  // produkt, er det jo nettopp det man leter etter. Uten dette kunne
  // «Tomatsuppe», «Potetsalat» og «Kyllingbuljong» aldri få et tilbud.
  if (isDerivedProduct(pn) && !isDerivedProduct(cn)) return false;

  // En FERDIGRETT er ikke råvaren den inneholder: en frossenpizza med
  // kjøttdeig er ikke et kjøttdeigtilbud.
  //
  // Men tilberedning er ikke det samme som en annen vare. «Grillpølse» og
  // «grillet kyllingfilet» er blant de vanligste norske tilbudene, og en
  // port som avviste alt med «grill» eller «wok» i navnet kastet dem ut.
  // Derfor bare rettene som selges ferdige.
  const productDish = dishConceptFor(pn);
  if (productDish && PREPARED_DISHES.has(productDish.id)
    && productDish.id !== dishConceptFor(cn)?.id) return false;

  // Samme konsept holder — men bare når konseptet ER varen. Ellers gjør et
  // bakgrunnsord som «sukker» soyamelk og energidrikk til samme vare.
  const a = conceptFor(cn);
  const b = conceptFor(pn);
  if (a && b && a.id === b.id && a.role !== 'background') return true;

  // Ellers avgjør det mest spesifikke ordet i katalognavnet. Å kreve ALLE
  // ordene var for strengt: «Soyamelk uten sukker» mistet da ethvert treff
  // fordi «uten» og «sukker» sjelden står i produktnavnet.
  const words = (t) => String(t).toLowerCase()
    .split(/[^a-zæøåé0-9]+/).filter((w) => w.length >= 4);
  const cw = words(cn).sort((x, y) => y.length - x.length);
  if (!cw.length) return false;
  const pw = words(pn);
  return pw.some((p) => wordMatch(cw[0], p));
}

/**
 * Kassalapp oppgir butikken som kode — «MENY_NO», «ODA_NO», «COOP_EXTRA».
 * Den skal ikke stå slik i appen.
 */
const STORE_LABELS = {
  MENY: 'MENY', ODA: 'Oda', KIWI: 'KIWI', SPAR: 'SPAR',
  JOKER: 'Joker', BUNNPRIS: 'Bunnpris', COOP_EXTRA: 'Coop Extra',
  COOP_MEGA: 'Coop Mega', COOP_PRIX: 'Coop Prix', COOP_OBS: 'Obs',
  COOP_MARKED: 'Coop Marked', REMA_1000: 'REMA 1000', EUROPRIS_NO: 'Europris',
};

export function storeLabel(code) {
  const raw = String(code ?? '').trim();
  if (!raw) return null;
  // Landkoden fjernes FØR oppslaget, ellers får samme kjede to navn
  // avhengig av om koden het «JOKER» eller «JOKER_NO» — og da dukker den
  // opp to ganger i butikkfilteret.
  const key = raw.toUpperCase().replace(/[\s-]+/g, '_').replace(/_NO$/, '');
  const hit = STORE_LABELS[key] ?? STORE_LABELS[`${key}_NO`];
  if (hit) return hit;
  // Ukjent kjede: stor forbokstav i stedet for roping.
  return key.split('_').filter(Boolean)
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
}

/**
 * Motsatt spørsmål av sameProduct: kan vi BEVISE at dette er feil vare?
 *
 * Skillet er viktig. Når vi søker opp en vare hos Kassalapp, vil vi ha
 * bekreftelse før vi lagrer noe — der er sameProduct riktig. Men når en
 * rad allerede ligger i basen med et match_name satt av en annen matcher,
 * er produktnavnet ofte et rent merkenavn: «Salma Ryggfilet» for laks,
 * «Evergood» for kaffe, «Grandiosa» for pizza. Å kreve bekreftelse der
 * kaster ut nesten alt som er riktig.
 *
 * Så her snus bevisbyrden: vi stoler på koblingen med mindre noe
 * motsier den.
 */
export function contradictsProduct(catalogName, productName) {
  const cn = String(catalogName ?? '').trim();
  const pn = String(productName ?? '').trim();
  if (!cn || !pn) return false;              // ingenting å motsi

  if (isDerivedProduct(pn) && !isDerivedProduct(cn)) return true;

  const productDish = dishConceptFor(pn);
  if (productDish && PREPARED_DISHES.has(productDish.id)
    && productDish.id !== dishConceptFor(cn)?.id) return true;

  const a = conceptFor(cn);
  const b = conceptFor(pn);

  // To KJENTE varer som ikke er den samme.
  if (a && b && a.id !== b.id
    && a.role !== 'background' && b.role !== 'background') return true;

  // Vet vi hva katalogvaren ER, må produktnavnet vise den. Dette er det
  // som fanger Battery: katalogvaren «soyamelk uten sukker» er plantedrikk,
  // og ingen av plantedrikkens navn står i «Battery 0,5 l». Kjenner vi
  // derimot ikke katalogvaren («Kaffe», «Pizza»), sier fraværet ingenting
  // — da er merkenavnet bare ukjent for oss, og vi stoler på koblingen.
  if (a && a.role !== 'background') {
    const words = normalizeText(pn).split(' ').filter(Boolean);
    const shown = synonymsOf(a).some((sy) => (sy.includes(' ')
      ? normalizeText(pn).includes(sy)
      : words.some((w) => wordMatch(sy, w))));
    if (!shown) return true;
  }

  return false;
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
