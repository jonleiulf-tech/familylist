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

/**
 * Ny pris for en vare, eller null når observasjonene ikke gir grunnlag.
 *
 * @param {object[]} observations rader fra price_observations
 * @param {number|null} current   prisen som står i varedatabasen nå
 * @returns {{price:number, from:number|null, n:number, low:number, high:number,
 *            capped:boolean}|null}
 */
export function learnedPrice(observations, current = null, opts = {}) {
  const recent = recentObservations(observations, opts);
  const prices = recent.map(ordinaryUnitPrice).filter((p) => p !== null);
  if (!prices.length) return null;

  const now = num(current);
  if (now !== null && prices.length < MIN_OBS_TO_MOVE) return null;

  const target = median(prices);
  if (target === null) return null;

  let price = target;
  let capped = false;
  if (now !== null) {
    const max = now * (1 + MAX_SHIFT);
    const min = now * (1 - MAX_SHIFT);
    if (price > max) { price = max; capped = true; }
    if (price < min) { price = min; capped = true; }
  }

  return {
    price: Number(price.toFixed(2)),
    from: now,
    n: prices.length,
    low: Number(Math.min(...prices).toFixed(2)),
    high: Number(Math.max(...prices).toFixed(2)),
    capped,
  };
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
export function nextHabit(existing, purchase) {
  const qty = num(purchase?.qty);
  if (qty === null) return null;
  const unit = purchase?.unit ?? existing?.unit ?? null;
  const prev = num(existing?.usual_qty);
  const times = Number(existing?.times_bought) || 0;
  // Første kjøp ER vanen. Etter det glir tallet mot det vi faktisk gjør,
  // uten at én storhandel flytter den helt.
  const blended = prev === null ? qty : prev * HABIT_OLD_WEIGHT + qty * (1 - HABIT_OLD_WEIGHT);
  return {
    usual_qty: Number(blended.toFixed(3)),
    unit,
    times_bought: times + 1,
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
