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
const NOISE = /^(sum|summer|total|totalt|kjøpesum|kjopesum|å betale|a betale|betalt|kontant|bankkort|visa|mastercard|mva|moms|herav|rabatt|spart|utbytte|kjøpeutbytte|kjopeutbytte|antall|kundenr|medlem|org\.?nr|kvittering|takk|velkommen|åpningstid|tlf|telefon|dato|kasse|ekspeditør|bong|referanse|terminal|avrunding|bonusgrunnlag|elektronisk|salgskvittering|butikk|totalbeløp|totalbelop|bank|dagligvarer|øvrige|ovrige|clerk|kort|aid|authorization|contactless|mixrabatt)\b/i;

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

/**
 * Kan denne tekstlinja være navnet til et beløp som står på linja UNDER?
 * Overskrifter, mengdelinjer og rabattlinjer kan det ikke.
 */
function plausibleName(line) {
  if (line.length < 2) return false;
  if (!/[a-zæøåA-ZÆØÅ]/.test(line)) return false;
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
  let mixPending = false;      // «Sum mix» sett, beløpet kommer på neste linje

  const add = (rawName, rawPrice) => {
    const name = String(rawName)
      // Coop merker miljøvarer med «¤» foran navnet.
      .replace(/^[¤*•\-\s]+/, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s*\d+\s*(stk|x)\s*$/i, '')   // «Melk 2 stk» -> «Melk»
      .trim();
    const price = parseAmount(rawPrice);
    if (!name || price === null) return;
    if (name.length < 2) return;
    // Pant, poser, rabatter og avgifter er ikke varekjøp. Før var dette
    // bare en prefikssjekk, så «MEDLEMSRABATT», «Flaskepant» og
    // «MILJOAVGIFT POSE» gikk rett inn i varedatabasen — og «Plastpose»
    // endte som en foreslått ukentlig vare på Hjem.
    if (NON_ITEM.test(name)) return;
    // Negative beløp er alltid en rabatt eller pant, uansett hva linja
    // heter. En slik pris ville dratt varens snitt nedover.
    if (price <= 0) return;
    out.push({ name, price });
  };

  for (const rawLine of String(text || '').split('\n')) {
    const line = rawLine.trim();
    if (!line) { pending = null; continue; }

    // Mikstilbud («2 for 60»): komponentprisene står i parentes, og bare
    // «Sum mix» er det som faktisk betales. Uten dette forsvant varene
    // helt, og linjesummen ble for lav til å stemme med totalen.
    if (/^sum\s*mix\b/i.test(line)) { mixPending = true; continue; }
    if (mixPending) {
      const mix = line.match(PRICE_ONLY);
      if (mix && lastName) add(lastName, mix[1]);
      mixPending = false;
      continue;
    }

    if (NOISE.test(line)) { pending = null; continue; }

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
      if (!label.test(line)) continue;
      const same = line.match(new RegExp(`^\\D*?(${AMOUNT})`));
      if (same) { total = parseAmount(same[1]); continue; }
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

/**
 * Vekter ny observert pris mot den gamle, 75 % gammel / 25 % ny.
 * Én kvittering skal ikke velte et snitt bygget på femti.
 */
export function blendPrice(oldPrice, newPrice, oldWeight = 0.75) {
  if (oldPrice == null) return Number(newPrice);
  return Number((Number(oldPrice) * oldWeight + Number(newPrice) * (1 - oldWeight)).toFixed(2));
}

/** OCR gir dårligere datagrunnlag enn et PDF-tekstlag — det skal telle mindre. */
export const CONFIDENCE = { txt: 1.0, pdf: 0.9, ocr: 0.6 };
