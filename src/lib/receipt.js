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
];

/** Linjer som aldri er varer, uansett hvordan de ser ut. */
const NOISE = /^(sum|total|totalt|å betale|a betale|betalt|kontant|bankkort|visa|mastercard|mva|moms|herav|rabatt|kundenr|medlem|org\.?nr|kvittering|takk|velkommen|åpningstid|tlf|telefon|dato|kasse|ekspeditør|bong|referanse|terminal|avrunding)\b/i;

/**
 * Linjer som ser ut som varer, men ikke er det. Matcher hvor som helst i
 * navnet, ikke bare i starten — «MEDLEMSRABATT» og «MILJOAVGIFT POSE»
 * slapp unna en prefikssjekk.
 */
const NON_ITEM = /(pant|rabatt|kupong|kundekort|bonus|miljøavgift|miljoavgift|posegebyr|\bpose\b|\bposer\b|bærepose|baerepose|plastpose|handlenett|emballasje|avrunding|gebyr|frakt|hjemlevering|utkjøring|pose\s*\d*\s*stk)/i;

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

/**
 * Trekker ut varelinjer. Formatet som treffer bredest på norske kvitteringer
 * er «varenavn ... beløp» med beløpet sist på linja.
 */
export function parseLines(text) {
  const out = [];
  for (const rawLine of String(text || '').split('\n')) {
    const line = rawLine.trim();
    if (!line || NOISE.test(line)) continue;

    const m = line.match(/^(.+?)\s+(-?\d+[.,]\d{2})\s*(?:kr)?$/i);
    if (!m) continue;

    const name = m[1]
      .replace(/\s{2,}/g, ' ')
      .replace(/\s*\d+\s*(stk|x)\s*$/i, '')   // «Melk 2 stk» -> «Melk»
      .trim();
    const price = parseAmount(m[2]);

    if (!name || price === null) continue;
    if (name.length < 2) continue;
    // Pant, poser, rabatter og avgifter er ikke varekjøp. Før var dette
    // bare en prefikssjekk, så «MEDLEMSRABATT», «Flaskepant» og
    // «MILJOAVGIFT POSE» gikk rett inn i varedatabasen — og «Plastpose»
    // endte som en foreslått ukentlig vare på Hjem.
    if (NON_ITEM.test(name)) continue;
    // Negative beløp er alltid en rabatt eller pant, uansett hva linja
    // heter. En slik pris ville dratt varens snitt nedover.
    if (price <= 0) continue;

    out.push({ name, price });
  }
  return out;
}

/** Totalsummen kvitteringen selv oppgir. Siste treff vinner. */
export function detectTotal(text) {
  const lines = String(text || '').split('\n');
  let total = null;
  for (const line of lines) {
    const m = line.match(/^\s*(?:sum|total|totalt|å betale|a betale)\b\D*?(-?\d+[.,]\d{2})/i);
    if (m) total = parseAmount(m[1]);
  }
  return total;
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
