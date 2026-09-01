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
const MAX_NAME_LEN = 48;

/** Under og over dette er tallet noe annet enn en kilopris på mat. */
const MIN_PRICE = 1;
const MAX_PRICE = 1500;

/**
 * Ord som hører kampanjen til, ikke varen.
 *
 * Et treff her er ikke nok alene: «fredagstaco» inneholder «fredag», men
 * løser til taco og er en ekte rett. Ordet feller bare en rad som ellers
 * ikke gir mening som mat.
 */
const CAMPAIGN_WORDS = [
  // ukedager og tid
  'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag', 'søndag',
  'helg', 'helga', 'ukens', 'uke', 'uka', 'dagens', 'idag', 'nå',
  'januar', 'februar', 'mars', 'april', 'juni', 'juli', 'august',
  'september', 'oktober', 'november', 'desember',
  // pris- og kampanjespråk
  'tilbud', 'tilbudet', 'tilbudene', 'kupp', 'knallkjøp', 'storkjøp',
  'prisfest', 'pristilbud', 'supertilbud', 'superpris', 'lavpris',
  'spar', 'sparer', 'rabatt', 'avslag', 'billigst', 'billigere',
  'halv', 'halve', 'gratis', 'medlemspris', 'medlem', 'medlemmer',
  'bonus', 'kundeavis', 'kundeklubb', 'kampanje', 'aksjon', 'nyhet', 'nyheter',
  // avistekst og forbehold
  'gjelder', 'maks', 'maksimalt', 'begrenset', 'kvantum', 'antall',
  'åpningstid', 'åpningstider', 'velkommen', 'åpent', 'stengt',
  'butikk', 'butikken', 'butikker', 'app', 'appen', 'last', 'ned',
  'les', 'mer', 'sider', 'side', 'utvalgte', 'utvalget', 'varer',
  'forbehold', 'trykkfeil', 'reklame', 'annonse',
];

const CAMPAIGN = new RegExp(
  `(^|[^a-zæøå])(${CAMPAIGN_WORDS.join('|')})([^a-zæøå]|$)`, 'i',
);

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
  if (!known && CAMPAIGN.test(normalizeText(name))) {
    return { keep: false, reason: 'kampanjetekst' };
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
    const key = `${normalizeText(row.name)}|${toNumber(row.price)}`;
    if (seen.has(key)) {
      dropped.push({ name: String(row.name).trim(), reason: 'samme vare to ganger' });
      continue;
    }
    seen.add(key);
    kept.push(row);
  }
  return { rows: kept, dropped };
}
