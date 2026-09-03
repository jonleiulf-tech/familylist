// AUTOGENERERT — ikke rediger.
// Kilde: src/lib/catalog.js. Kjør `npm run sync:shared` etter endringer der.
// Testene ligger sammen med kilden.

import { lower } from './text.ts';
// Oppslag mot varekatalogen: normalisering, søk og kobling av fritekst
// («2 liter melk», middagsingredienser, importlinjer) mot en katalogvare.
// Portert fra prototypens normName() / resolveDb() / mkItem().

/** Enheter som steppes i PAKKER, ikke i enkeltenheter. */
const PACK_UNITS = new Set(['g', 'kg', 'ml', 'liter', 'l', 'dl']);
export const isPackUnit = (unit) => PACK_UNITS.has(String(unit || '').toLowerCase());

/** Gjett enhet ut fra varenavn og kategori. */
/**
 * Standardenhet for en vare, slik man sier det på norsk: man kjøper
 * «1 pakke revet ost» og «1 liter melk», aldri «1 g ost». Gram velges
 * KUN når mengden tydelig er en vekt (qty >= 20 — oppskrifter sender
 * f.eks. 600 for kjøttdeig); enheten kan alltid endres i redigeringen.
 */
// Varer som telles i oppskriften, ikke veies eller kjøpes i «pakker».
const COUNTABLE_PIECES = /pølse|kotelett|karbonade|kjøttkake|medisterkake|filet|biff|lår|vinge|burger/;

/**
 * Antatt antall biter i én pakke. Brukes til prisanslaget: prisen i
 * varedatabasen gjelder ÉN pakke, så «8 pølser» må bli én pakke og ikke
 * åtte, ellers får pølser med lompe en prislapp på kr 577.
 *
 * Tallene er antakelser, på samme måte som «à ca. 400 g» — de vises alltid
 * i teksten under mengden, og kan overstyres ved å bytte enhet eller
 * mengde selv.
 */
const PIECES_PER_PACK = [
  [/lompe|lefse|tortilla|wrap/, 10],
  [/pølsebrød|hamburgerbrød|burgerbrød/, 6],
  [/pølse/, 8],
  [/kjøttkake|medisterkake/, 12],
  [/karbonade|kotelett/, 4],
  [/(^|\s)egg(\s|er\b|$)/, 6],
  [/rundstykke|bolle|horn/, 6],
  [/filet|biff|lår|vinge|burger/, 2],
];

/** @returns {number|null} antatt antall biter per pakke, eller null. */
export function piecesPerPack(name) {
  const n = String(name || '').toLowerCase();
  if (!n) return null;
  return PIECES_PER_PACK.find(([re]) => re.test(n))?.[1] ?? null;
}

/**
 * Pakningsstørrelsen for en vare, ett sted.
 *
 * PRISEN I KATALOGEN GJELDER ÉN PAKKE, ikke én bit. Uten pack_size ganget
 * estimatet pakkeprisen med antall biter, og fire egg ble kr 233 — 58
 * kroner per egg. Åtte pølser ble kr 360. Feilen lå i at hver
 * innleggingsvei regnet ut pakningen på sitt vis, og de fleste hoppet
 * over den: søkefeltet, talelegging, tilbudskortet og listeskanneren satte
 * den aldri.
 *
 * @param {string} name  varenavnet
 * @param {string} unit  enheten raden får
 * @param {object|null} item  katalograden, hvis vi har en
 * @returns {number|null}
 */
export function packSizeFor(name, unit, item = null) {
  const known = Number(item?.pack_size);
  if (Number.isFinite(known) && known > 0) return known;
  const u = String(unit || '').toLowerCase();
  // For stk er pack_size antall BITER i pakken: egg 6, pølser 8.
  if (u === 'stk') return piecesPerPack(name);
  // Den som skriver «2 kg poteter» kjøper kilo, ikke 400-grams pakker:
  // med 400 ble det fem innkjøp og kr 240 for to kilo poteter.
  if (u === 'kg') return 1000;
  if (u === 'g' || u === 'hg') return 400;
  if (u === 'liter') return 1;
  return null;
}

/**
 * Hovedkategori gjettet fra navnet, for varer varedatabasen ikke kjenner.
 *
 * Kategorien er ikke pynt: den styrer hyllerekkefølgen i butikkmodus. Alt
 * ukjent havnet i «Annet», så «Macaroni» og «Tørre stellekluter» sto i
 * samme bunke midt i butikken.
 *
 * REKKEFØLGEN ER REGELEN. Sammensatte ord lurer: «melkesjokolade» er
 * snacks, «tomatpuré» er tørrvare og «makrell i tomat» er pålegg — derfor
 * står de spesifikke mønstrene FØR de generelle.
 */
const CATEGORY_RULES = [
  // Ikke-mat først: ingenting av dette kan forveksles med mat.
  [/bleie|stelleklut|våtserviett|dopapir|toalettpapir|tørkerull|husholdningspapir|vaskemiddel|skyllemiddel|oppvask|såpe|shampo|balsam|tannkrem|tannbørste|deodorant|bind\b|tampong|søppelsekk|søppelpose|plastpose|bærepose|aluminiumsfolie|bakepapir|matpapir|lyspære|batteri/, 'Hus og hjem'],

  // Snacks før meieri og frukt: «melkesjokolade», «bananchips».
  [/sjokolade|potetgull|chips\b|snacks|godteri|smågodt|tyggis|pastill|saltstenger|popcorn|kjeks|nøtter|peanøtter|lakris|marsipan/, 'Snacks'],

  // Hermetikk og tørt før frukt og grønt: «hakkede tomater», «tomatpuré».
  [/hermetisk|på boks|boks med|tomatpuré|passata|hakkede tomater|kokosmelk|bønner i|kikert|linser|erter\b|mais\b/, 'Tørrvarer'],

  // Pålegg før fisk og kjøtt: «makrell i tomat», «kyllingpålegg».
  [/pålegg|leverpostei|servelat|salami|kaviar|makrell i tomat|syltetøy|nugatti|peanøttsmør|prim\b|brunost|hvitost|jarlsberg|norvegia/, 'Ost og pålegg'],

  [/melk|fløte|rømme|yoghurt|kesam|kvarg|skyr|cottage|creme fraiche|smør\b|margarin|egg\b|egge/, 'Meieri'],
  [/(^|\s)ost(\s|$)|revet ost|ostesk/, 'Ost og pålegg'],

  [/kjøttdeig|karbonadedeig|kylling|kalkun|svin|storfe|lam\b|pølse|bacon|skinkestek|karbonade|kotelett|kjøttkake|medisterkake|farse|biff|entrecote|ribbe|nakkekoteletter/, 'Kjøtt'],
  [/laks|torsk|sei\b|hyse|ørret|makrell|sild|reker|scampi|fiskepudding|fiskekake|fiskepinner|fiskegrateng|(^|\s)fisk(\s|$)/, 'Fisk'],

  [/brød|rundstykke|baguette|lompe|lefse|tortilla|wrap\b|pitabrød|knekkebrød|bolle|horn\b|frokostblanding|müsli|musli|cornflakes|havregryn|havregrøt/, 'Brød og korn'],

  [/pasta|makaroni|macaroni|spagetti|spaghetti|penne|fusilli|lasagneplater|nudler|(^|\s)ris(\s|$)|basmati|jasminris|couscous|bulgur|quinoa|(^|\s)mel(\s|$)|hvetemel|sukker|gjær|bakepulver|kakao|buljong|suppe|kaffefilter/, 'Tørrvarer'],

  [/ketchup|sennep|majones|remulade|dressing|saus|krydder|pepper\b|(^|\s)salt(\s|$)|olje\b|olivenolje|eddik|soya|sriracha|tabasco|karri|paprikapulver|kanel|vaniljesukker/, 'Krydder og saus'],

  [/frossen|frosne|iskrem|(^|\s)is(\s|$)|pommes frites|frossenpizza|isbergmix/, 'Frysevarer'],

  [/brus|cola|mineralvann|juice|saft\b|(^|\s)vann(\s|$)|kaffe|(^|\s)te(\s|$)|energidrikk|øl\b|vin\b|sider|smoothie/, 'Drikke'],

  [/banan|eple|pære|appelsin|klementin|sitron|lime\b|melon|drue|bær|jordbær|blåbær|bringebær|avokado|tomat|agurk|salat|isberg|løk\b|hvitløk|potet|gulrot|paprika|brokkoli|blomkål|kål\b|squash|aubergine|spinat|sopp|champignon|persille|dill\b|koriander|gressløk|basilikum|asparges|erter i|ingefær|chili/, 'Frukt og grønt'],
];

/**
 * @returns {string} hovedkategori, «Annet» når navnet ikke sier noe.
 */
export function guessCategory(name) {
  const n = String(name || '').toLowerCase();
  if (!n) return 'Annet';
  return CATEGORY_RULES.find(([re]) => re.test(n))?.[1] ?? 'Annet';
}

export function guessUnit(name, category, qty = 1) {
  const n = lower(name);

  // Retter først: «Fløtegratinerte poteter» er en middag, ikke fløte, og
  // «tomatsuppe» er ikke tomat.
  if (/gratinert|gryte|suppe|salat|kaker|panert|grateng|form/.test(n)) return 'stk';

  // Beholderen er ikke innholdet. «Drikkeflaske», «yoghurtbeger»,
  // «melkekartong» og «saftpresse» ble alle til liter.
  if (/flaske|beger|kartong|presse|kanne/.test(n)) return 'stk';

  // «melon», «sjokolade», «pålegg» inneholder vann/melk/saft men er ikke drikke.
  if (!/melon|sjokolade|pålegg|is\b/.test(n)
    && /melk|juice|brus|saft|vann|fløte|drikke|yoghurt|leskedrikk/.test(n)) return 'liter';

  // Kjøtt og fisk kjøpes i pakker. Unntatt det som bare HETER noe med kjøtt:
  // pølsebrød, kyllingbuljong, kjøttdeigsaus.
  if (/kjøttdeig|laks|torsk|filet|kylling|kjøtt|deig|farse|revet|skivet|bacon|pølse|skinke|ribbe|kotelett|karbonade/.test(n)
    && !/brød|buljong|saus|krydder|pinne|mix/.test(n)) {
    // Terskelen er en MENGDE, ikke en vekt: «24 pølser» skal ikke bli
    // «24 gram pølser». Gram gir bare mening ved klart større tall.
    if (Number(qty) >= 100) return 'g';
    // Det som TELLES i oppskriften, telles også i butikken: «8 pølser» er
    // åtte pølser, ikke åtte pakker (som ga «ca. 3 200 g» og kr 577 for
    // pølser med lompe). Deig, farse og pålegg telles ikke — der er
    // pakken den naturlige enheten.
    if (COUNTABLE_PIECES.test(n) && Number(qty) >= 2) return 'stk';
    return 'pakke';
  }

  // «-ost» som etterledd, men ikke «most», «kost» eller «post».
  if (/(^|\s)ost(\s|$)|\wost(\s|$)/.test(n) && !/most|kost|post/.test(n)) {
    return Number(qty) >= 100 ? 'g' : 'stk';
  }

  // Ferske urter og asparges selges i bunt, og oppskriftene sier «1 bunt
  // persille» — ikke «1 stk persille». Oppgir oppskriften selv en enhet,
  // brukes den; dette gjelder bare når enheten mangler.
  if (/persille|dill|koriander|gressløk|basilikum|mynte|timian|asparges/.test(n)
    && Number(qty) <= 3) return 'bunt';

  if (category === 'Frukt og grønt') return 'stk';
  return 'stk';
}

export function normalizeName(raw, normRules) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const hit = normRules.get(s.toLowerCase());
  if (hit) return hit;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Koble et fritekstnavn mot varekatalogen.
 * Håndterer alternativer («kokosmelk/gryr fløte» -> den som finnes)
 * og fuzzy-treff («curry paste» -> «Rød currypaste»).
 * Returnerer { name, item } der item er null hvis ingen god nok match.
 */
export function resolveCatalogItem(raw, catalog, normRules) {
  // Rene enhets- og mengdeord er aldri en vare. Løsvektlinjer på norske
  // kvitteringer ser ut som «1,240 kg x 24,90 kr/kg», og splitten på «/»
  // gjorde «kr/kg» til kandidaten «kg» — som ordgrense-traff katalograden
  // «Smaégodt Pr Kg». Da havnet bananer, kjøttdeig og biff på samme rad.
  const UNIT_ONLY = /^(kg|g|gr|l|dl|cl|ml|stk|pk|pakke|pr|per|x|kr|nok|\d+\s*(pk|stk|kg|g|l|dl|ml))$/i;
  const candidates = String(raw || '')
    .split('/')
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !UNIT_ONLY.test(t));
  let best = null;
  let bestScore = -1;
  let bestMethod = 'none';

  for (const c of candidates) {
    const q = normalizeName(c, normRules).toLowerCase();
    if (!q) continue;
    for (const d of catalog) {
      // Én katalograd uten navn (importerte prisfiler har hatt slike) skal
      // ikke velte hele oppslaget — den hoppes over.
      const dn = String(d.name ?? '').toLowerCase();
      if (!dn) continue;
      let s = 0;
      // Delstreng-treff krever ORDGRENSE: norsk skriver sammensatte ord i
      // ett, så «melk» inni «sjokolademelk» er en ANNEN vare — aldri et
      // treff. «Lett melk» → «Melk» er derimot greit (eget ord).
      const wordHit = (hay, needle) =>
        new RegExp(`(^|[\\s\\-/])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([\\s\\-/]|$)`).test(hay);
      const boundaryPrefix = (long, short) =>
        long.startsWith(short) && /[\s\-/]/.test(long.charAt(short.length));
      if (dn === q) s = 100;
      else if (boundaryPrefix(dn, q) || boundaryPrefix(q, dn)) s = 70;
      else if (wordHit(dn, q) || wordHit(q, dn)) s = 50;
      else {
        const qw = q.split(/\s+/);
        const dw = dn.split(/\s+/);
        // Stamme-treff per ord: «tomater»↔«tomat» (bøyning, kort suffiks) er
        // greit, men «kyllingbuljong»↛«kylling» — et langt suffiks betyr et
        // SAMMENSATT ord, altså en annen vare (samme regel som ordgrensen).
        // Vakten må gjelde BEGGE ordene. Før holdt det at søkeordet var
        // langt nok, så et kort katalogord kunne sluke et langt
        // kvitteringsord: «PANT» ble «Pan Dei Mas», «vannmelon» ble «Mel»
        // og «salatost» ble «Salat». Nå må begge være minst fire tegn.
        const stemHit = (a, b) => a.length > 3 && b.length > 3
          && ((a.startsWith(b) && a.length - b.length <= 3)
            || (b.startsWith(a) && b.length - a.length <= 3));
        const hitW = qw.filter((w) => w.length > 3 && dw.some((x) => stemHit(x, w))).length;
        if (hitW && hitW >= Math.min(qw.length, dw.length)) s = 45;
        else if (hitW) s = 25;
      }
      if (!s) continue;
      // Hvordan treffet ble funnet, før bonusene. Lagres på kjøpslinjen,
      // slik at et fuzzy-gjett kan skilles fra et eksakt alias i ettertid
      // — før ble begge stille permanente.
      const m = s >= 100 ? 'exact' : s >= 70 ? 'prefix' : s >= 50 ? 'word' : 'stem';
      s += Math.min(10, (d.score || 0) / 3);          // hyppig kjøpt vinner
      if (d.avg_price) s += 5;                         // har pris -> bedre kobling
      s -= Math.abs(dn.length - q.length) / 10;        // straff store lengdeavvik
      if (s > bestScore) { bestScore = s; best = d; bestMethod = m; }
    }
  }

  // confidence 0–1 og method følger med. Kallere som bare leser {name, item}
  // merker ingenting.
  if (best && bestScore >= 40) {
    return { name: best.name, item: best, confidence: Math.min(1, Math.round(bestScore) / 100), method: bestMethod };
  }
  return { name: normalizeName(candidates[0] || raw, normRules), item: null, confidence: 0, method: 'none' };
}

/**
 * Autofullfør: prefiks-treff først, deretter delstrengtreff,
 * begge rangert på kjøpsfrekvens-score.
 */
export function searchCatalog(query, catalog, limit = 8) {
  const q = lower(query).trim();
  if (q.length < 1) return [];
  const prefix = [];
  const contains = [];
  for (const d of catalog) {
    const dn = String(d.name ?? '').toLowerCase();
    if (dn.startsWith(q)) prefix.push(d);
    else if (dn.includes(q)) contains.push(d);
  }
  const byScore = (a, b) => (b.score || 0) - (a.score || 0)
  || String(a.name ?? '').localeCompare(String(b.name ?? ''), 'nb');
  return [...prefix.sort(byScore), ...contains.sort(byScore)].slice(0, limit);
}

/** «to melk og brød og en agurk» -> [{qty, name}] — Web Speech API (no-NO). */
const SPOKEN_NUMBERS = {
  en: 1, ei: 1, ett: 1, én: 1, to: 2, tre: 3, fire: 4, fem: 5,
  seks: 6, sju: 7, syv: 7, åtte: 8, ni: 9, ti: 10,
};

export function parseSpeech(text) {
  const parts = String(text || '')
    .toLowerCase()
    .replace(/[.,!?]/g, '')
    .split(/\s+og\s+|\s*,\s*/)
    .map((p) => p.trim())
    .filter(Boolean);

  return parts.map((part) => {
    const words = part.split(/\s+/);
    let qty = 1;
    let rest = words;
    const first = words[0];
    if (SPOKEN_NUMBERS[first]) { qty = SPOKEN_NUMBERS[first]; rest = words.slice(1); }
    else if (/^\d+$/.test(first)) { qty = Number(first); rest = words.slice(1); }
    // «2 liter melk» — hopp over enheten hvis den kom rett etter tallet
    if (rest.length > 1 && /^(liter|kg|gram|g|stk|pakke|pakker|boks|bokser)$/.test(rest[0])) {
      rest = rest.slice(1);
    }
    return { qty, name: rest.join(' ').trim() };
  }).filter((r) => r.name);
}

/**
 * Varer med frekvenssignal fra kvitteringene som mangler på listen —
 * grunnlaget for «Ukentlige varer» på Hjem og gjentaksvarene under Forslag.
 *
 * Katalognavn kan liste varianter («Brød/bakervarer», «Tomater/passata/
 * tomatboks») mens handlelisten har kortformen («Brød») — derfor sjekkes
 * hver variant, ellers foreslås varer som alt ligger på listen.
 */
const FREQ_RANK = { 'Svært ofte': 0, Ofte: 1, 'Av og til': 2 };

/**
 * Navn som aldri skal foreslås: emballasje og pant, og rå
 * kvitteringsforkortelser der butikken har klemt sammen navn og vekt
 * («Coop Ha.Tom.Urt.390G», «Tine Lettrom.17%300G»). De er ubrukelige som
 * forslag fordi ingen kjenner igjen sin egen vare i dem.
 */
const NOT_A_SUGGESTION = /pose|pant|handlenett|emballasje|\.\w+\.|\d%\d|\w\.\d/i;

export function frequentMissing(catalog, existingNames, limit = 50) {
  const onList = (name) => String(name).toLowerCase().split('/')
    .some((v) => existingNames.has(v.trim()));
  return catalog
    // Object.hasOwn, ikke «in» — «in» treffer arvede navn, så en vare som
    // het «constructor» eller «toString» slapp gjennom filteret.
    .filter((c) => Object.hasOwn(FREQ_RANK, c.frequency_sig ?? ''))
    // Poser, pant og rå kvitteringsforkortelser er ikke handleforslag.
    // Kvitteringsinntaket filtrerer dem nå, men katalogen har arvet dem
    // fra tidligere importer.
    .filter((c) => String(c.name ?? '').trim())
    .filter((c) => !NOT_A_SUGGESTION.test(c.name))
    // Ett enkelt kjøp gjør ingen vare til en ukentlig vare. «Ofte» alene
    // var terskelen, uten å se på hvor mange kvitteringer den hviler på.
    .filter((c) => (Number(c.receipt_count) || 0) >= 3 || !c.receipt_count)
    .filter((c) => !onList(c.name))
    .sort((a, b) => FREQ_RANK[a.frequency_sig] - FREQ_RANK[b.frequency_sig]
      || String(a.name ?? '').localeCompare(String(b.name ?? ''), 'nb'))
    .slice(0, limit);
}
