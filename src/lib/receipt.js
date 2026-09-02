// Kvitteringsparsing og -validering.
//
// Kritisk regel fra handoff-en: VALIDER FØR NOE SKRIVES. En feiltolket
// kvittering forurenser både frekvenstallene og prishistorikken, og det er
// vanskelig å oppdage i ettertid. Derfor er det bedre å avvise en gyldig
// kvittering enn å slippe gjennom en feiltolket.

export const KNOWN_STORES = [
  { code: 'COOP_EXTRA', name: 'Coop Extra', patterns: [/coop\s*extra/i, /\bextra\b/i] },
  { code: 'COOP_OBS', name: 'Coop Obs', patterns: [/coop\s*obs/i] },
  { code: 'MENY_NO', name: 'Meny', patterns: [/\bmeny\b/i] },
  { code: 'REMA_1000', name: 'Rema 1000', patterns: [/rema\s*1000/i, /\brema\b/i] },
  { code: 'KIWI', name: 'KIWI', patterns: [/\bkiwi\b/i] },
  { code: 'SPAR_NO', name: 'Spar', patterns: [/\bspar\b/i] },
  { code: 'JOKER', name: 'Joker', patterns: [/\bjoker\b/i] },
  { code: 'BUNNPRIS', name: 'Bunnpris', patterns: [/bunnpris/i] },
  // Til slutt, som reserve: en elektronisk Coop-kvittering navngir
  // samvirkelaget («COOP SØRØST SA»), ikke butikkformatet. Da er «Coop»
  // det ærligste vi kan si — bedre enn å avvise kvitteringen, og bedre
  // enn å gjette Extra når det kan ha vært Prix.
  { code: 'COOP', name: 'Coop', patterns: [/\bcoop\b/i] },
];

/** Linjer som aldri er varer, uansett hvordan de ser ut. */
const NOISE = /^(sum\w*|total\w*|kjøpesum|kjopesum|å betale|a betale|betalt|kontant|bank\w*|visa|mastercard|mva|moms|herav|rabatt\w*|spart|utbytte|kjøpeutbytte|kjopeutbytte|antall|kundenr\w*|medlem\w*|org\.?nr|kvittering|takk|velkommen|åpningstid|tlf|telefon|dato|kasse\w*|ekspeditør|bong|referanse|ref\.?\s*nr|terminal|avrunding|bonus\w*|elektronisk|salgskvittering|butikk|beløp|belop|byttelapp|kortnr|servering|tips|dagligvarer|øvrige|ovrige|clerk|kort\w*|aid|authorization|contactless|kl\b)\b/i;

/**
 * Linjer som ser ut som varer, men ikke er det. Matcher hvor som helst i
 * navnet, ikke bare i starten — «MEDLEMSRABATT» og «MILJOAVGIFT POSE»
 * slapp unna en prefikssjekk.
 */
const NON_ITEM = /(pant|rabatt|kupong|kundekort|bonus|miljøavgift|miljoavgift|posegebyr|\bpose\b|\bposer\b|bærepose|baerepose|plastpose|handlenett|emballasje|avrunding|gebyr|frakt|hjemlevering|utkjøring|pose\s*\d*\s*stk|utbytte|medlemsfordel|miljømerket|miljomerket|totalbeløp|totalbelop|kjøpesum|kjopesum|spart)/i;

/** Finner butikken i kvitteringsteksten. Ukjent butikk => avvist. */
export function detectStore(text) {
  const head = String(text || '').split('\n').slice(0, 12).join('\n');
  for (const store of KNOWN_STORES) {
    if (store.patterns.some((p) => p.test(head))) return store;
  }
  return null;
}

/** Norsk dato i flere skrivemåter -> ISO, eller null. */
export function detectDate(text) {
  const s = String(text || '');
  // Rekkefølgen er ikke tilfeldig. ISO må prøves først: mønsteret for
  // dd.mm.yy treffer inne i «2026-08-27» og ville lest det som 26.08.27.
  const patterns = [
    { re: /(\d{4})-(\d{2})-(\d{2})/, order: 'ymd' },              // 2026-08-27
    { re: /(\d{2})[.\-/](\d{2})[.\-/](\d{4})/, order: 'dmy' },    // 27.08.2026
    { re: /(?<!\d)(\d{2})[.\-/](\d{2})[.\-/](\d{2})(?!\d)/, order: 'dmy' }, // 27.08.26
  ];

  for (const { re, order } of patterns) {
    const m = s.match(re);
    if (!m) continue;
    let year;
    let month;
    let day;
    if (order === 'ymd') { [, year, month, day] = m; }
    else {
      [, day, month, year] = m;
      if (year.length === 2) year = `20${year}`;
    }
    if (Number(month) < 1 || Number(month) > 12) continue;
    if (Number(day) < 1 || Number(day) > 31) continue;
    const iso = `${year}-${month}-${day}`;
    const d = new Date(`${iso}T00:00:00`);
    if (!Number.isNaN(d.getTime())) return iso;
  }
  return null;
}

/** Beløp: «kr 24,90», «24.90», «24,90 kr». Norsk komma håndteres. */
function parseAmount(raw) {
  const cleaned = String(raw).replace(/\s/g, '').replace(/kr/i, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// Beløp med tusenskille som mellomrom («2 776.35») må med: Coops
// totalsum står slik, og uten dette fant vi ingen sum å sammenligne med.
const AMOUNT = '-?\\d{1,3}(?:[ \\u00a0]\\d{3})+[.,]\\d{2}|-?\\d+[.,]\\d{2}';

/** Bare et beløp på linja, uten navn: «33.48», «33,48 kr», «2 776.35». */
const PRICE_ONLY = new RegExp(`^(${AMOUNT})\\s*(?:kr)?$`, 'i');

/** Vekt- og enhetslinjer under en vare: «1.100 kg  24.90 kr/kg». */
const MEASURE_LINE = /^[\d.,]+\s*(kg|g|l|dl|ml|stk)\b/i;

// Linjene UNDER en vare bærer mengden, enhetsprisen og — når varen var på
// tilbud — den ordinære prisen. Alt dette kastet vi før, og det er nettopp
// det appen trenger for å lære hvor mye familien pleier å kjøpe og hva en
// vare egentlig koster: «16.74 kr/stk» var 40 % avslag, ordinært 27.90.
const QTY_LABEL = /^antall:\s*([\d.,]+)\s*(stk|pk|pakker?)?/i;
const QTY_BARE = /^([\d.,]+)\s*(stk|kg|g|hg|l|dl|cl|ml)\b/i;
const UNIT_PRICE = /([\d.,]+)\s*kr\s*\/\s*(stk|kg|g|hg|l|dl|cl|ml)\b/i;
// «(40 % av 55.80)» og «(av 55.80)» — begge formene forekommer.
const DISCOUNT_OF = /rabatt[^()]*\(\s*(?:[\d.,]+\s*%\s*)?av\s*([\d.,]+)\s*\)/i;
// «MEDLEMSRABATT -22.32», «Tilbud -10.00», «Kundekort rabatt: -22.32».
// Minustegnet kreves: uten det er «Rabatt» like ofte en overskrift.
const DISCOUNT_AMOUNT = /(?:rabatt|avslag|tilbud)\D{0,24}-\s*([\d.,]+)/i;
/** Komponentpris i et mikstilbud: «( 38.50)». */
const PAREN_PRICE = /^\(\s*([\d.,]+)\s*\)$/;

// Basisenheter. En pris i kroner per GRAM er 0,02 — ubrukelig som pris, og
// verre: den ble lært SOM prisen. «876 g» til 21,81 ga 0,02 kr/g, og et
// estimat på 500 g epler ble 4 øre i stedet for 12,45. Alt regnes derfor om
// til kilo og liter FØR enhetsprisen regnes ut.
const BASE_UNIT = {
  g: ['kg', 1000], hg: ['kg', 10], kg: ['kg', 1],
  ml: ['liter', 1000], cl: ['liter', 100], dl: ['liter', 10],
  l: ['liter', 1], liter: ['liter', 1],
};

/** Under dette er enhetsprisen ikke en pris, men en lesefeil. */
const MIN_UNIT_PRICE = 0.5;

/** Over dette er mengden ikke en mengde, men en lesefeil. */
const MAX_QTY = 500;

/**
 * Kan denne tekstlinja være navnet til et beløp som står på linja UNDER?
 * Overskrifter, mengdelinjer og rabattlinjer kan det ikke.
 */
function plausibleName(line) {
  // To tegn er ikke et varenavn. «Kl» (fra «Kl 21.34») ble en vare til
  // 21,34 kroner, og klokkeslettet havnet i prishistorikken.
  if (line.length < 3) return false;
  if (!/[a-zæøåA-ZÆØÅ]/.test(line)) return false;
  // Adresselinjer i toppen av kvitteringen: «Dr. Munks gate 12.50» ble
  // lest som en vare med pris.
  if (/\b(gate|gata|gt|vei|veg|vegen|veien|plass|torg|allé|alle)\b/i.test(line)) return false;
  if (PRICE_ONLY.test(line)) return false;
  if (MEASURE_LINE.test(line)) return false;
  if (/^(antall|rabatt|pris|enhetspris|herav)\b/i.test(line)) return false;
  if (/\bkr\/(kg|stk|l|g)\b/i.test(line)) return false;
  if (NOISE.test(line) || NON_ITEM.test(line)) return false;
  return true;
}

/**
 * Trekker ut varelinjer.
 *
 * To formater må dekkes, og det andre kostet oss en hel kvittering:
 *  1) «varenavn ... beløp» på samme linje (de fleste papirkvitteringer)
 *  2) navnet på én linje og beløpet på den NESTE (Coops elektroniske
 *     kvittering, der «AGURK STK» og «33.48» står under hverandre med
 *     «Antall: 2 stk» og «Rabatt: NOK …» etterpå). Formatet ga null
 *     varelinjer, og opplastingen ble avvist med «Fant færre enn to
 *     varelinjer» — kvitteringen var altså riktig, parseren var ikke.
 */
export function parseLines(text) {
  const out = [];
  let pending = null;          // navnelinje som venter på beløpet under seg
  let lastName = null;         // sist SETTE varenavn (brukes av mikstilbud)
  let current = null;          // varen linjene under hører til
  let mixPending = false;      // «Sum mix» sett, beløpet kommer på neste linje
  let mixParts = [];           // komponentene i et mikstilbud, med ordinærpris

  let sinceItem = 99;          // linjer siden sist varelinje

  const add = (rawName, rawPrice) => {
    // AVVIST LINJE BRYTER KOBLINGEN. Ble den ikke en vare, skal linjene
    // under den heller ikke berike varen FØR den: en bæreposes «Antall: 2
    // stk 2.00 kr/stk» skrev enhetspris 2,00 på osten over, og
    // totalsummen stemte fortsatt siden varelinjas egen pris var urørt.
    const reject = () => { current = null; };

    let count = null;
    const name = String(rawName)
      // Coop merker miljøvarer med «¤» foran navnet.
      .replace(/^[¤*•\-\s]+/, '')
      .replace(/\s{2,}/g, ' ')
      // «Melk 2 stk» -> «Melk», men ANTALLET tas vare på. Før ble det
      // strøket, og 2 × 24,90 = 49,80 ble lært som prisen på én melk.
      .replace(/\s*(\d+)\s*(?:stk|x)\s*$/i, (_, n) => { count = Number(n); return ''; })
      .trim();
    const price = parseAmount(rawPrice);
    if (!name || price === null) return reject();
    if (name.length < 2) return reject();
    // Navnet må se ut som et navn. Uten denne sjekken ble «25%», «Kl» og
    // «02.09.2026» varer med pris.
    if (!plausibleName(name)) return reject();
    // Pant, poser, rabatter og avgifter er ikke varekjøp. Før var dette
    // bare en prefikssjekk, så «MEDLEMSRABATT», «Flaskepant» og
    // «MILJOAVGIFT POSE» gikk rett inn i varedatabasen — og «Plastpose»
    // endte som en foreslått ukentlig vare på Hjem.
    if (NON_ITEM.test(name)) return reject();
    // Negative beløp er alltid en rabatt eller pant, uansett hva linja
    // heter. En slik pris ville dratt varens snitt nedover.
    if (price <= 0) return reject();
    // Databasen tar 120 tegn. En sammenslått OCR-linje kan bli lengre, og
    // da feilet HELE kvitteringen på en engelsk Postgres-melding.
    const row = { name: name.slice(0, 120), price };
    if (count !== null && count > 1 && count <= MAX_QTY) {
      row.qty = count;
      row.unit = 'stk';
    }
    out.push(row);
    current = row;              // videre linjer beriker DENNE varen
    sinceItem = 0;
  };

  /**
   * Gjør de oppsamlede mikskomponentene til varelinjer.
   *
   * Summen fordeles etter ordinærprisen, ikke likt: er den ene pizzaen
   * dyrere ordinært, bærer den mer av rabatten også. Ordinærprisen tas
   * vare på, så tilbudet ikke læres som normalprisen.
   */
  const flushMix = (total) => {
    const parts = mixParts;
    mixParts = [];
    if (!parts.length) return;
    const sum = parts.reduce((a, p) => a + p.regular, 0);
    for (const part of parts) {
      const paid = total !== null && total > 0 && sum > 0
        ? Number((total * (part.regular / sum)).toFixed(2))
        : part.regular;
      add(part.name, String(paid));
      if (current) {
        current.qty = 1;
        current.unit = 'stk';
        if (paid < part.regular) current.regular_price = part.regular;
      }
    }
    current = null;   // linjene etter mikstilbudet hører ikke til den siste
  };

  /**
   * Mengde, enhetspris og ordinærpris fra linjene under varen.
   *
   * NÆRHET KREVES. Uten den fulgte «current» med til neste vare over alle
   * mellomliggende støylinjer: en bærepose på 4 kroner med «Antall: 2 stk
   * 2.00 kr/stk» under seg skrev enhetspris 2,00 på osten FØR posen — og
   * totalsummen stemte fortsatt, for prisen på selve varelinja er urørt.
   * Pose og pant står på nesten hver Coop-kvittering.
   */
  const enrich = (line) => {
    if (!current || sinceItem > 3) return false;
    let touched = false;

    const label = line.match(QTY_LABEL);
    const bare = label ? null : line.match(QTY_BARE);
    const q = label ?? bare;
    if (q) {
      const qty = parseAmount(q[1]);
      if (qty !== null && qty > 0) {
        current.qty = qty;
        current.unit = (q[2] ?? 'stk').toLowerCase().replace(/^pk$/, 'pakke');
        touched = true;
      }
    }

    const up = line.match(UNIT_PRICE);
    if (up) {
      const value = parseAmount(up[1]);
      if (value !== null && value > 0) {
        current.unit_price = value;
        current.unit = current.unit ?? up[2].toLowerCase();
        touched = true;
      }
    }

    const disc = line.match(DISCOUNT_OF);
    if (disc) {
      const before = parseAmount(disc[1]);
      if (before !== null && before > 0) {
        // Ordinær pris for HELE linja. Enhetsprisen regnes ut når vi vet
        // antallet — en tilbudspris skal ikke bli «vanlig pris» i basen.
        current.regular_price = before;
        touched = true;
      }
    } else if (current.regular_price == null) {
      // «MEDLEMSRABATT -22.32» sier ikke hva ordinærprisen var, men den
      // sier hvor mye som ble trukket — og betalt pluss avslag ER
      // ordinærprisen. Uten dette ble tilbudsprisen lært som normalprisen,
      // og feilen så ut som en forbedring.
      const amount = line.match(DISCOUNT_AMOUNT);
      if (amount) {
        const off = parseAmount(amount[1]);
        if (off !== null && off > 0) {
          current.regular_price = Number((current.price + off).toFixed(2));
          touched = true;
        }
      }
    }
    return touched;
  };

  for (const rawLine of String(text || '').split('\n')) {
    const line = rawLine.trim();
    if (!line) { pending = null; continue; }
    sinceItem += 1;

    // «Antall: 2 stk», «876 g» og «Rabatt: … (40% av 55.80)» er ikke varer,
    // men de forteller om varen over. Berik først, filtrer etterpå.
    if (enrich(line)) continue;

    // Mikstilbud («2 for 60»): hver komponent har sin ordinære pris i
    // parentes, og bare «Sum mix» er det som faktisk betales.
    //
    // Før ble bare det SISTE navnet brukt, hele summen ble lagt på den ene
    // varen, og den andre forsvant helt — samme feil som gjorde 93
    // artikler til 46 linjer. Nå huskes hver komponent med prisen sin, og
    // summen fordeles mellom dem etter ordinærprisen.
    const paren = line.match(PAREN_PRICE);
    if (paren && pending) {
      const value = parseAmount(paren[1]);
      if (value !== null && value > 0) {
        mixParts.push({ name: pending, regular: value });
        pending = null;
        continue;
      }
    }
    const mixSame = line.match(new RegExp(`^sum\\s*mix\\b\\D*(${AMOUNT})\\s*(?:kr)?$`, 'i'));
    if (mixSame) { flushMix(parseAmount(mixSame[1])); continue; }
    if (/^sum\s*mix\b/i.test(line)) { mixPending = true; continue; }
    if (mixPending) {
      const mix = line.match(PRICE_ONLY);
      mixPending = false;
      if (mix) { flushMix(parseAmount(mix[1])); continue; }
      // «Sum mix» uten beløp under: komponentene har fortsatt sine
      // ordinærpriser, og de er bedre enn ingenting.
      flushMix(null);
    }

    if (NOISE.test(line)) { pending = null; current = null; continue; }

    const same = line.match(new RegExp(`^(.+?)\\s+(${AMOUNT})\\s*(?:kr)?$`, 'i'));
    if (same) {
      add(same[1], same[2]);
      pending = null;
      continue;
    }

    const only = line.match(PRICE_ONLY);
    if (only) {
      // Beløpet hører til navnet rett over — men bare det FØRSTE beløpet.
      // Coop lister rabatt og enhetspris under, og de skal ikke bli varer.
      if (pending) add(pending, only[1]);
      pending = null;
      continue;
    }

    if (plausibleName(line)) {
      pending = line;
      // Mikstilbudets varenavn står FØR komponentprisene i parentes, og
      // varen legges ikke til før «Sum mix» — derfor huskes navnet her,
      // ikke når en vare faktisk legges til.
      lastName = line;
    } else {
      pending = null;
    }
  }

  flushMix(null);   // «Sum mix» som aldri kom — komponentene skal likevel med

  // Utregninger som krever at hele varen er lest.
  for (const row of out) {
    // Står det ingen mengde, er det én vare. Coop skriver «Antall:» bare
    // når det er flere enn én — uten dette manglet ordinærprisen på
    // nettopp enkeltvarene som var på tilbud (brokkoli 9,90 av 14,90).
    if (row.qty == null) { row.qty = 1; row.unit = row.unit ?? 'stk'; }

    // Gram til kilo, desiliter til liter. Enhetsprisen skal være i kroner
    // per kilo eller per liter, aldri per gram: 0,02 kr/g er riktig regnet
    // og fullstendig ubrukelig, og det var DEN prisen som ble lært.
    const base = BASE_UNIT[String(row.unit).toLowerCase()];
    if (base) {
      const [name, factor] = base;
      row.qty = Number((row.qty / factor).toFixed(4));
      row.unit = name;
      // Enhetsprisen kvitteringen selv oppgir står alltid per basisenhet
      // («24.90 kr/kg» under «876 g»), så den skal IKKE regnes om.
    }

    const qty = Number(row.qty) || 0;
    if (qty > 0 && qty <= MAX_QTY) {
      if (row.unit_price == null) row.unit_price = Number((row.price / qty).toFixed(4));
      if (row.regular_price != null) {
        row.regular_unit_price = Number((row.regular_price / qty).toFixed(4));
      }
    }

    // Siste skanse. Er enhetsprisen under en halv krone, eller mengden
    // absurd, er mengden lest feil — og en feillest mengde er verre enn
    // ingen mengde, for den blir lært som en pris. Da faller vi tilbake
    // til det vi VET: linja kostet så mye, for én vare.
    const unreadable = qty <= 0 || qty > MAX_QTY
      || (row.unit_price != null && row.unit_price < MIN_UNIT_PRICE);
    if (unreadable) {
      row.qty = 1;
      row.unit = 'stk';
      row.unit_price = row.price;
      row.regular_unit_price = row.regular_price ?? null;
    }
  }
  return out;
}

/** Totalsummen kvitteringen selv oppgir. Siste treff vinner. */
export function detectTotal(text) {
  const lines = String(text || '').split('\n').map((l) => l.trim());
  // Merkelappene er RANGERT. «Summer» står også i MVA-tabellen nederst på
  // en Coop-kvittering, og fordi den siste vinner ble totalsummen lest som
  // 67,23 på en kvittering på 2 776,35 — og hele kvitteringen avvist.
  const TIERS = [
    /^(?:totalbeløp|totalbelop|å betale|a betale|totalt|total)\b/i,
    /^(?:kjøpesum|kjopesum)\b/i,
    /^(?:sum|summer)\b/i,
  ];
  for (const label of TIERS) {
    let total = null;
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const m = label.exec(line);
      if (!m) continue;
      // Merkelappen KLIPPES BORT først, og så tas det SISTE beløpet på det
      // som står igjen. Et mønster som «^\D*?beløp» kunne ikke gå over
      // tallene i «Totalt (5 Artikler)  158.67» — den fant merkelappen,
      // men ikke beløpet, og falt gjennom til «Summer» i MVA-tabellen.
      // Da ble totalen 67,23 på en kvittering på 158,67 igjen.
      const rest = line.slice(m[0].length);
      const amounts = [...rest.matchAll(new RegExp(AMOUNT, 'g'))];
      if (amounts.length) {
        total = parseAmount(amounts[amounts.length - 1][0]);
        continue;
      }
      // Elektroniske kvitteringer setter merkelappen og beløpet på hver
      // sin linje («Kjøpesum» / «504,64»), akkurat som varelinjene.
      const below = (lines[i + 1] ?? '').match(PRICE_ONLY);
      if (below) total = parseAmount(below[1]);
    }
    if (total !== null) return total;
  }
  return null;
}

export const TOLERANCE = 0.15;          // ±15 % mellom oppgitt sum og linjesum
export const MAX_AGE_MONTHS = 12;

/**
 * Full validering. Returnerer alltid en begrunnelse, slik at UI-et kan si
 * HVA som var galt i stedet for bare «avvist».
 */
export function validateReceipt(text, { today = new Date() } = {}) {
  const problems = [];
  // Per-sjekk-status for sjekklisten i UI-et: true = bestått,
  // false = feilet, null = kunne ikke vurderes (f.eks. sum uten oppgitt sum).
  const checks = { store: false, date: false, lines: false, total: null };

  const store = detectStore(text);
  checks.store = Boolean(store);
  if (!store) problems.push('Fant ingen kjent butikk på kvitteringen.');

  const date = detectDate(text);
  if (!date) {
    problems.push('Fant ingen dato.');
  } else {
    const d = new Date(`${date}T00:00:00`);
    const now = new Date(today);
    now.setHours(0, 0, 0, 0);
    const cutoff = new Date(now);
    cutoff.setMonth(cutoff.getMonth() - MAX_AGE_MONTHS);
    if (d > now) problems.push('Datoen er fram i tid.');
    else if (d < cutoff) problems.push(`Kvitteringen er eldre enn ${MAX_AGE_MONTHS} måneder.`);
    else checks.date = true;
  }

  const lines = parseLines(text);
  checks.lines = lines.length >= 2;
  if (!checks.lines) problems.push('Fant færre enn to varelinjer.');

  const lineSum = lines.reduce((s, l) => s + l.price, 0);
  const total = detectTotal(text);
  if (total !== null && lineSum > 0) {
    const diff = Math.abs(total - lineSum) / total;
    checks.total = diff <= TOLERANCE;
    if (!checks.total) {
      problems.push(
        `Totalsum (${total.toFixed(2)}) avviker ${Math.round(diff * 100)} % fra linjesummen (${lineSum.toFixed(2)}).`,
      );
    }
  }

  return {
    valid: problems.length === 0,
    problems,
    checks,
    store,
    date,
    lines,
    lineSum: Number(lineSum.toFixed(2)),
    total,
  };
}

/** OCR gir dårligere datagrunnlag enn et PDF-tekstlag — det skal telle mindre. */
export const CONFIDENCE = { txt: 1.0, pdf: 0.9, ocr: 0.6 };
