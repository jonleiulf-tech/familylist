/**
 * Luking av radene bildetolkningen leser ut av en kundeavis.
 *
 * Problemet: en avisside er full av store bokstaver som IKKE er varer.
 * «TAKKNEMLIG TORSDAG» står over en pris på 39 kroner, og tolkningen
 * leverer det pliktskyldig som en vare til 39 kroner. Slipper det inn i
 * fellesdatabasen, står det der for alle.
 *
 * Regelen er den samme som ellers i matchingen: vi krever ikke bevis for
 * at noe ER en vare — merkevarer heter ofte bare «Evergood», og et krav om
 * bekreftelse ville kastet dem. Vi krever bevis for at noe IKKE er det.
 * Kampanjetekst har kjennetegn; varenavn har det ikke.
 */

import { conceptFor, normalizeText } from './foodConcepts.js';

/** Over dette er det en overskrift, ikke et varenavn. */
// Samme grense som tolkningen selv bruker (90). Sto den på 48, kastet
// klienten akkurat det prompten ba om: «merke og størrelse».
const MAX_NAME_LEN = 90;

/** Under og over dette er tallet noe annet enn en kilopris på mat. */
const MIN_PRICE = 1;
const MAX_PRICE = 1500;

/**
 * Ord som hører kampanjen til, ikke varen.
 *
 * Delt i to fordi de oppfører seg ulikt. «Tilbud» og «medlemspris» står
 * aldri inne i et varenavn, uansett hvor i teksten. Ukedager og «helg»
 * gjør det derimot ofte — «Coop Kaffe Mørkbrent 250 g Helg» er en ekte
 * vare. De feller derfor bare når de står FØRST, slik overskrifter gjør.
 *
 * Noen ord er bevisst utelatt: «mars» er også en sjokolade, «sider» er
 * eplesider, «nyhet» settes på selve varelinjen, og «bonus» er kaffe.
 */
const CAMPAIGN_ANYWHERE = [
  'tilbud', 'tilbudet', 'tilbudene', 'kupp', 'knallkjøp', 'storkjøp',
  'prisfest', 'pristilbud', 'supertilbud', 'superpris', 'lavpris',
  'medlemspris', 'medlemmer', 'kundeavis', 'kundeklubb', 'kampanje',
  'gjelder', 'maksimalt', 'begrenset', 'kvantum',
  'åpningstid', 'åpningstider', 'velkommen',
  'forbehold', 'trykkfeil', 'reklame', 'annonse', 'utvalgte',
  'last ned', 'les mer',
];

const CAMPAIGN_LEADING = [
  'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag', 'søndag',
  'helg', 'helga', 'ukens', 'uke', 'uka', 'dagens', 'idag',
  'spar', 'sparer', 'rabatt', 'avslag', 'billigst', 'billigere',
  'gratis', 'medlem', 'aksjon', 'maks', 'antall', 'utvalget',
];

const anyOf = (list) => `(${list.join('|')})`;

// Sterke ord matches som delstreng, ikke som helt ord: norsk setter
// sammen ord, og «Helgetilbud» og «Torsdagskupp» er like mye overskrift
// som «Tilbud» og «Kupp».
const CAMPAIGN = new RegExp(anyOf(CAMPAIGN_ANYWHERE), 'i');

// Svake ord feller bare når de innleder navnet OG står som et helt ord.
// «Dagens kupp» ja, «Fredagstaco» nei.
const CAMPAIGN_START = new RegExp(`^${anyOf(CAMPAIGN_LEADING)}([^a-zæøå]|$)`, 'i');

/** Roper teksten? En varelinje gjør ikke det; en overskrift gjør det. */
function isShouting(text) {
  const letters = String(text).replace(/[^a-zæøåA-ZÆØÅ]/g, '');
  if (letters.length < 5) return false;
  const upper = letters.replace(/[^A-ZÆØÅ]/g, '').length;
  return upper / letters.length >= 0.7;
}

/** «2 pk», «kr/kg», «500 g» — mål og mengder alene, ikke et varenavn. */
const UNIT_ONLY = /^(\d+([.,]\d+)?\s*)?(x|stk|pk|pakke|kg|g|l|dl|cl|ml|kr|kr\/kg|kr\/l|per|for|%)?\s*$/i;

/**
 * «3 for 2», «Ta 2 betal for 1» — mengderabatten er en mekanisme, ikke en
 * vare. Den står gjerne som egen tekst i annonsen, med prisen ved siden av.
 */
const MULTIBUY = /^(ta\s*)?\d+\s*(stk|pk|pakker?)?\s*,?\s*(betal\s*)?for\s*\d+([.,]\d+)?\s*(stk|pk)?$/i;

/** Ren tegnsuppe: ingenting som ligner et ord på tre bokstaver eller mer. */
const HAS_WORD = /[a-zæøå]{3,}/i;

const toNumber = (v) => {
  const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

/**
 * Er dette en rad vi tør slippe videre?
 * Returnerer alltid en grunn når svaret er nei — brukeren skal kunne se
 * hva som ble luket bort, og hente det tilbake om vi tok feil.
 */
export function classifyFlyerRow(row) {
  const name = String(row?.name ?? '').trim();
  const price = toNumber(row?.price);

  if (!name) return { keep: false, reason: 'uten navn' };
  if (!Number.isFinite(price) || price <= 0) return { keep: false, reason: 'uten pris' };
  if (!HAS_WORD.test(name)) return { keep: false, reason: 'ikke et navn' };
  if (UNIT_ONLY.test(name)) return { keep: false, reason: 'bare et mål' };
  if (MULTIBUY.test(name)) return { keep: false, reason: 'bare et mål' };

  if (price < MIN_PRICE) return { keep: false, reason: 'prisen er for lav' };
  if (price > MAX_PRICE) return { keep: false, reason: 'prisen er for høy' };

  // Løser navnet til noe spiselig, er saken avgjort — da får det bli med
  // selv om det står «fredag» i det.
  const known = Boolean(conceptFor(name));

  if (!known && name.length > MAX_NAME_LEN) {
    return { keep: false, reason: 'for lang for et varenavn' };
  }
  // Et varenavn er ikke en setning. «Freia Melkesjokolade Stor Plate 200 g
  // Flere Varianter» er åtte ord — over det er vi i overskriftsland.
  if (!known && name.trim().split(/\s+/).length > 8) {
    return { keep: false, reason: 'en hel setning, ikke et navn' };
  }
  // Tre signaler, i stigende varsomhet. Å luke bort en ekte vare er verre
  // enn å slippe gjennom en overskrift: overskriften ser brukeren i
  // gjennomgangen og fjerner selv, varen forsvinner uten spor.
  const flat = normalizeText(name);
  if (!known) {
    const shouted = isShouting(name)
      && (CAMPAIGN.test(flat) || new RegExp(anyOf(CAMPAIGN_LEADING), 'i').test(flat));
    if (shouted || CAMPAIGN.test(flat) || CAMPAIGN_START.test(flat)) {
      return { keep: false, reason: 'kampanjetekst' };
    }
  }

  return { keep: true, reason: null };
}

/**
 * Luk en hel avis.
 *
 * Dupletter faller også bort: samme vare til samme pris er gjerne den
 * samme annonsen lest to ganger, og to like rader i fellesdatabasen er
 * bare støy.
 */
export function filterFlyerRows(rows = []) {
  const kept = [];
  const dropped = [];
  const seen = new Set();

  for (const row of rows) {
    const { keep, reason } = classifyFlyerRow(row);
    if (!keep) {
      dropped.push({ name: String(row?.name ?? '').trim() || '(uten navn)', reason });
      continue;
    }
    // IKKE normalizeText her: den stripper sifre, så «Cola 0,5 l» og
    // «Cola 1,5 l» til samme pris ble regnet som samme vare, og den ene falt.
    const key = `${String(row.name).toLowerCase().replace(/\s+/g, ' ').trim()}|${toNumber(row.price)}`;
    if (seen.has(key)) {
      dropped.push({ name: String(row.name).trim(), reason: 'samme vare to ganger' });
      continue;
    }
    seen.add(key);
    kept.push(row);
  }
  return { rows: kept, dropped };
}
