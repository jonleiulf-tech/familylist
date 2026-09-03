// Hva en vare EGENTLIG koster, lært av kvitteringene.
//
// Piloten 2. september viste to feil som skjulte hverandre: prisene på de
// mest kjøpte varene lå 2-3 ganger for høyt i basen (havredrikk 58 mot
// 22,33), mens mengden var underestimert med det dobbelte. Reglene her
// retter prisen; usualQty() retter mengden.
//
// Fire regler, alle med en grunn:
//
//  1. ORDINÆR pris slår tilbudspris. Agurken kostet 16,74 — men det var
//     40 % avslag, og ordinært 27,90. Lærer vi tilbudsprisen som «prisen»,
//     blir neste ukes estimat for lavt, og feilen ser ut som en forbedring.
//  2. MEDIAN, ikke snitt. Én feillest linje (OCR som leser 129 som 1290)
//     ville dratt snittet i grøfta; medianen merker det ikke.
//  3. TAK på hvor mye én runde får flytte prisen. En pris som hopper 10×
//     er nesten alltid en lesefeil, ikke et prishopp.
//  4. TERSKEL: en etablert pris flyttes ikke av én enkelt observasjon.
//     Har vi ingen pris, er én observasjon bedre enn ingenting.

/** Maks endring per læringsrunde, som andel av dagens pris. */
export const MAX_SHIFT = 0.35;

/** Så mange observasjoner kreves for å flytte en pris vi alt har. */
export const MIN_OBS_TO_MOVE = 2;

/** Observasjoner eldre enn dette teller ikke — priser eldes. */
export const MAX_AGE_DAYS = 120;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Medianen av en tallrekke. */
export function median(values) {
  const xs = values.map(num).filter((v) => v !== null).sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
};

/**
 * Prisen én observasjon forteller om varens VANLIGE pris.
 * Tilbudsprisen er ikke den vanlige prisen — står ordinærprisen på
 * kvitteringen, er det den som gjelder.
 */
export function ordinaryUnitPrice(obs) {
  return num(obs?.regular_unit_price) ?? num(obs?.unit_price) ?? num(obs?.price);
}

/** Observasjoner innenfor aldersgrensen, nyeste først. */
export function recentObservations(observations, { now = new Date(), maxAgeDays = MAX_AGE_DAYS } = {}) {
  const cutoff = new Date(now).getTime() - maxAgeDays * 864e5;
  return (observations ?? [])
    .filter((o) => {
      const t = new Date(o?.observed_at ?? 0).getTime();
      return Number.isFinite(t) && t >= cutoff;
    })
    .sort((a, b) => new Date(b.observed_at) - new Date(a.observed_at));
}

/** Enheter som betyr det samme, slik at «l» og «liter» ikke blir to grupper. */
export const canonUnit = (unit) => {
  const u = String(unit ?? '').trim().toLowerCase();
  if (!u) return 'stk';
  if (u === 'l') return 'liter';
  if (u === 'pk') return 'pakke';
  return u;
};

/**
 * Enheten flest av observasjonene er målt i, og bare de observasjonene.
 *
 * Uten dette havnet «24,90 kr/kg» og «19,90 kr/stk» for de samme eplene i
 * SAMME median, og svaret — 22,40 — var en pris per ingenting. Den ble
 * skrevet til varedatabasen og ganget opp med et antall pakker.
 *
 * @returns {{unit:string, rows:object[]}|null}
 */
export function dominantUnitGroup(observations) {
  const rows = (observations ?? []).filter((o) => ordinaryUnitPrice(o) !== null);
  if (!rows.length) return null;
  const groups = new Map();
  for (const row of rows) {
    const key = canonUnit(row.unit);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  // Flest observasjoner vinner. Står det likt, vinner den nyeste — radene
  // kommer sortert med nyeste først.
  let best = null;
  for (const [unit, group] of groups) {
    if (!best || group.length > best.rows.length) best = { unit, rows: group };
  }
  return best;
}

/**
 * Ny pris for en vare, eller null når observasjonene ikke gir grunnlag.
 *
 * @param {object[]} observations rader fra price_observations
 * @param {number|null} current   prisen som står i varedatabasen nå
 * @param {{seeded?: boolean}} [opts] seeded: prisen er importert, aldri lært
 *   — da skal den kunne rettes i ett hopp. En seedpris på 58 mot 22,33 ville
 *   ellers brukt fire netter på å komme fram, med taket som bremse.
 * @returns {{price:number, unit:string, from:number|null, n:number, days:number,
 *            low:number, high:number, capped:boolean}|null}
 */
export function learnedPrice(observations, current = null, opts = {}) {
  const recent = recentObservations(observations, opts);
  const group = dominantUnitGroup(recent);
  if (!group) return null;
  const prices = group.rows.map(ordinaryUnitPrice).filter((p) => p !== null);
  if (!prices.length) return null;

  // Antall FORSKJELLIGE dager. To linjer på samme kvittering er ikke to
  // uavhengige observasjoner, og en dobbelt opplastet kvittering er det
  // slett ikke — likevel var det nok til å flytte prisen.
  const days = new Set(group.rows.map((o) => String(o.observed_at ?? '').slice(0, 10))).size;

  const now = num(current);
  const seeded = opts.seeded === true;
  if (now !== null && !seeded && (prices.length < MIN_OBS_TO_MOVE || days < MIN_OBS_TO_MOVE)) {
    return null;
  }

  const target = median(prices);
  if (target === null) return null;

  let price = target;
  let capped = false;
  // En seedpris er en gjetning fra et regneark, ikke noe vi har lært. Den
  // skal kunne byttes ut i ett hopp; en pris vi ALT har lært, skal ikke.
  if (now !== null && !seeded) {
    const max = now * (1 + MAX_SHIFT);
    const min = now * (1 - MAX_SHIFT);
    if (price > max) { price = max; capped = true; }
    if (price < min) { price = min; capped = true; }
  }

  // Spennet skal tåle én lesefeil. Min og maks lot én rad på 1 290 stå som
  // «høyeste pris» for alltid, og skjermen viste «kr 22–kr 1290».
  //
  // En persentil alene holder ikke i et lite utvalg: med fem tall drar
  // det ene gale fortsatt 90-persentilen til 783. Derfor kastes først alt
  // som ligger mer enn fire ganger fra medianen — det er ikke priser på
  // samme vare — og spennet regnes av det som står igjen.
  const band = prices.filter((v) => v >= target / 4 && v <= target * 4);
  const sane = band.length ? band : prices;

  return {
    price: Number(price.toFixed(2)),
    unit: group.unit,
    from: now,
    n: prices.length,
    days,
    low: percentile(sane, 0.05),
    high: percentile(sane, 0.95),
    capped,
  };
}

/**
 * Persentil, med lineær interpolasjon. Brukes til pris­spennet: én feillest
 * linje skal ikke definere hverken bunnen eller toppen.
 */
export function percentile(values, p) {
  const xs = values.map(num).filter((v) => v !== null).sort((a, b) => a - b);
  if (!xs.length) return null;
  if (xs.length === 1) return Number(xs[0].toFixed(2));
  const pos = (xs.length - 1) * Math.min(1, Math.max(0, p));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const value = lo === hi ? xs[lo] : xs[lo] + (xs[hi] - xs[lo]) * (pos - lo);
  return Number(value.toFixed(2));
}

/**
 * Hvor mye husholdningen PLEIER å kjøpe av en vare.
 *
 * Estimatet brukte 1 av alt. Piloten: 93 artikler kjøpt mot 46 linjer på
 * listen — nesten alt kjøpes i to. Dette er husholdningens egen vane, så
 * én observasjon er nok til å begynne med; medianen tar over etter hvert.
 *
 * @returns {{qty:number, unit:string|null, n:number}|null}
 */
export function usualQty(observations, { maxAgeDays = MAX_AGE_DAYS, now = new Date() } = {}) {
  const recent = recentObservations(observations, { maxAgeDays, now });
  const rows = recent.filter((o) => num(o?.qty) !== null);
  if (!rows.length) return null;

  // Vektvarer («876 g epler») er ikke en vane man gjentar i antall — der
  // sier mengden mer om størrelsen på posen enn om hvor mye vi kjøper.
  const counted = rows.filter((o) => !o.unit || /^(stk|pakke|boks|pose|bunt|klase)$/i.test(o.unit));
  const use = counted.length ? counted : rows;
  const qty = median(use.map((o) => o.qty));
  if (qty === null) return null;

  // Halve pakker finnes ikke i handlekurven; rund til nærmeste halve for
  // vekt og til hele for stykk.
  const unit = use[0]?.unit ?? null;
  const isCount = !unit || /^(stk|pakke|boks|pose|bunt|klase)$/i.test(unit);
  return {
    qty: isCount ? Math.max(1, Math.round(qty)) : Number(qty.toFixed(2)),
    unit,
    n: use.length,
  };
}

/** Vekt på det appen alt tror, mot det siste kjøpet. */
export const HABIT_OLD_WEIGHT = 0.7;

/**
 * Husholdningens vane for én vare, oppdatert med ett nytt kjøp.
 *
 * Prisene er et fellesgode og ligger i item_catalog. Mengden er det ikke —
 * at vi kjøper tre havredrikker sier ingenting om hva naboen trenger — så
 * dette regnes per husholdning, av husholdningens egne kjøp.
 *
 * Tallet lagres URUNDET. Runder man av her, låser vanen seg: 1 → 1,6 → 2,
 * og deretter 2·0,7 + 3·0,3 = 2,3 → 2 i all evighet. Avrundingen hører
 * hjemme der mengden BRUKES, i habitQty().
 */
/** Over dette er mengden en lesefeil, ikke en vane. */
export const MAX_HABIT_QTY = 500;

export function nextHabit(existing, purchase) {
  const qty = num(purchase?.qty);
  // En OCR som leser «1450 g» som 1450 stk skal ikke bli en vane — og
  // databasens item_habits_sane ville avvist hele kvitteringens vaner.
  if (qty === null || qty > MAX_HABIT_QTY) return null;
  const unit = purchase?.unit ?? existing?.unit ?? null;
  const times = Number(existing?.times_bought) || 0;

  // Bytter enheten, er de to tallene ikke sammenlignbare. En vane på
  // «3 stk» blandet med et kjøp på «0,876 kg» ga 2,36 kg epler — 2,7
  // ganger virkeligheten. Da begynner vanen på nytt i den nye enheten.
  const sameUnit = canonUnit(unit) === canonUnit(existing?.unit);
  const prev = sameUnit ? num(existing?.usual_qty) : null;

  // Første kjøp ER vanen. Etter det glir tallet mot det vi faktisk gjør,
  // uten at én storhandel flytter den helt.
  const blended = prev === null ? qty : prev * HABIT_OLD_WEIGHT + qty * (1 - HABIT_OLD_WEIGHT);
  return {
    usual_qty: Number(blended.toFixed(3)),
    unit,
    // Vanen teller HANDLETURER, ikke varelinjer. Én kvittering med agurk
    // på to linjer er én tur.
    times_bought: prev === null ? 1 : times + 1,
  };
}

/** Mengden slik den skal stå i handlekurven: hele tall for stykkvarer. */
export function habitQty(habit) {
  const qty = num(habit?.usual_qty);
  if (qty === null) return null;
  const unit = habit?.unit ?? null;
  const isCount = !unit || /^(stk|pakke|boks|pose|bunt|klase)$/i.test(unit);
  return isCount ? Math.max(1, Math.round(qty)) : Number(qty.toFixed(2));
}


// ---------------------------------------------------------------------
// Fase 2 (prisintelligens): god pris, trend og sikkerhet
// ---------------------------------------------------------------------

/**
 * Hva er en god pris på denne varen — for OSS (§8)?
 *
 * Ikke fra førpriser. Fra det vi selv har sett: «god» er under 25-persentilen
 * eller 12 % under medianen, det laveste av de to; «svært god» under
 * 10-persentilen eller 24 % under medianen. Med færre enn fire priser er
 * det ingen terskel — da vet vi for lite til å kalle noe godt.
 *
 * @param {number[]} prices  nylige, vaskede priser i én enhet
 * @returns {{good:number, excellent:number, median:number}|null}
 */
export function priceThresholds(prices) {
  const xs = (Array.isArray(prices) ? prices : []).map(Number).filter((v) => Number.isFinite(v) && v > 0);
  if (xs.length < 4) return null;
  const med = median(xs);
  if (!(med > 0)) return null;
  const band = xs.filter((v) => v >= med / 4 && v <= med * 4);
  const use = band.length >= 4 ? band : xs;
  const good = Math.min(percentile(use, 0.25), med * 0.88);
  const excellent = Math.min(percentile(use, 0.10), med * 0.76);
  return {
    good: Number(good.toFixed(2)),
    excellent: Number(Math.min(excellent, good).toFixed(2)),
    median: Number(med.toFixed(2)),
  };
}

/**
 * Faller, stiger eller står prisen stille (§9)?
 *
 * Siste 30 dager mot dagene 31–90. Minst to observasjoner på hver side,
 * ellers «unknown». Under 5 % endring er «stable» — mindre enn det er
 * støy fra pakningsstørrelser og tilbud.
 *
 * @returns {{trend:'falling'|'stable'|'rising'|'unknown', pct:number|null, recent:number|null, earlier:number|null}}
 */
export function priceTrend(observations, { now = new Date() } = {}) {
  const t0 = new Date(now).getTime();
  // Ordinærprisen, som tersklene: en tilbudsuke skal ikke gi «falling»
  // når hyllprisen står stille.
  const pris = (o) => { const p = Number(ordinaryUnitPrice(o)); return Number.isFinite(p) && p > 0 ? p : null; };
  const alder = (o) => { const t = Date.parse(o?.observed_at); return Number.isFinite(t) ? (t0 - t) / 864e5 : null; };
  const recent = []; const earlier = [];
  for (const o of Array.isArray(observations) ? observations : []) {
    const p = pris(o); const a = alder(o);
    if (p === null || a === null || a < 0) continue;
    if (a <= 30) recent.push(p); else if (a <= 90) earlier.push(p);
  }
  if (recent.length < 2 || earlier.length < 2) return { trend: 'unknown', pct: null, recent: null, earlier: null };
  const r = median(recent); const e = median(earlier);
  if (!(e > 0)) return { trend: 'unknown', pct: null, recent: null, earlier: null };
  const pct = ((r - e) / e) * 100;
  return {
    trend: Math.abs(pct) < 5 ? 'stable' : pct > 0 ? 'rising' : 'falling',
    pct: Number(pct.toFixed(1)),
    recent: Number(r.toFixed(2)),
    earlier: Number(e.toFixed(2)),
  };
}

/**
 * Hvor sikker er prisen vi viser (§2)? 0–100.
 *
 *   + nylig observasjon          + flere uavhengige observasjoner
 *   + samme butikk               + kvittering og Kassalapp enige
 *   − gammel                     − bare estimat / gjett
 *   − fra en annen butikk        − uklar enhet
 *
 * Tallet vises aldri rått — bruk confidenceLabel().
 */
export function priceConfidence(observations, { storeCode = null, now = new Date(), unit = null } = {}) {
  const t0 = new Date(now).getTime();
  const rows = (Array.isArray(observations) ? observations : []).filter((o) => Number(o?.unit_price ?? o?.price) > 0);
  if (!rows.length) return 0;
  const alder = (o) => { const t = Date.parse(o?.observed_at); return Number.isFinite(t) ? (t0 - t) / 864e5 : 999; };
  const nyeste = Math.min(...rows.map(alder));
  let score = 20;
  // ferskhet: 0 dager = +40, 30 dager = +25, 120 dager = 0
  score += Math.max(0, 40 - nyeste / 3);
  // antall: opp til +20
  score += Math.min(20, rows.length * 5);
  // samme butikk
  if (storeCode && rows.some((o) => String(o?.store_code ?? '').toUpperCase() === String(storeCode).toUpperCase())) score += 10;
  else if (storeCode) score -= 10;
  // enighet mellom kilder
  const kilder = new Set(rows.map((o) => o?.source).filter(Boolean));
  if (kilder.has('receipt') && kilder.has('kassalapp')) {
    const r = median(rows.filter((o) => o.source === 'receipt').map((o) => Number(o.unit_price ?? o.price)));
    const k = median(rows.filter((o) => o.source === 'kassalapp').map((o) => Number(o.unit_price ?? o.price)));
    if (r > 0 && k > 0 && Math.abs(r - k) / r <= 0.1) score += 10;
  }
  // bare estimater
  if ([...kilder].every((k) => k === 'estimate' || k === 'manual')) score -= 20;
  // uklar enhet
  if (unit && rows.some((o) => o?.unit && String(o.unit).toLowerCase() !== String(unit).toLowerCase())) score -= 10;
  return Math.max(0, Math.min(100, Math.round(score)));
}

/** «Høy sikkerhet», «Middels sikkerhet» eller «Lav sikkerhet». */
export function confidenceLabel(score) {
  const s = Number(score);
  if (!Number.isFinite(s)) return 'Lav sikkerhet';
  return s >= 70 ? 'Høy sikkerhet' : s >= 40 ? 'Middels sikkerhet' : 'Lav sikkerhet';
}
