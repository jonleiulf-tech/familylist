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
export function guessUnit(name, category, qty = 1) {
  const n = (name || '').toLowerCase();

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
    return Number(qty) >= 100 ? 'g' : 'pakke';
  }

  // «-ost» som etterledd, men ikke «most», «kost» eller «post».
  if (/(^|\s)ost(\s|$)|\wost(\s|$)/.test(n) && !/most|kost|post/.test(n)) {
    return Number(qty) >= 100 ? 'g' : 'stk';
  }

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
      s += Math.min(10, (d.score || 0) / 3);          // hyppig kjøpt vinner
      if (d.avg_price) s += 5;                         // har pris -> bedre kobling
      s -= Math.abs(dn.length - q.length) / 10;        // straff store lengdeavvik
      if (s > bestScore) { bestScore = s; best = d; }
    }
  }

  if (best && bestScore >= 40) return { name: best.name, item: best };
  return { name: normalizeName(candidates[0] || raw, normRules), item: null };
}

/**
 * Autofullfør: prefiks-treff først, deretter delstrengtreff,
 * begge rangert på kjøpsfrekvens-score.
 */
export function searchCatalog(query, catalog, limit = 8) {
  const q = (query || '').trim().toLowerCase();
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
