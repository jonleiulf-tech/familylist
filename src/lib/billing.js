/**
 * Abonnementet, sett fra appen.
 *
 * Reglene her er en tro kopi av household_has_access() i databasen. To
 * steder å endre en slik regel er ett for mye, så endres den ene må den
 * andre endres i samme slengen — testene under holder dem i kort snor.
 *
 * Sannheten om hvem som har betalt bor hos Stripe. Raden i subscriptions
 * er en kopi webhooken holder oppdatert; her leser vi bare kopien.
 */

/** 15 kr i måneden per husholdning, oppgitt i øre som Stripe vil ha det. */
export const PRICE_ORE = 1500;
export const PRICE_LABEL = '15 kr';

/** Alle får 30 dager. Kampanjekoden legger på en måned til hos Stripe. */
export const TRIAL_DAYS = 30;

/**
 * Nådedager når kortet feiler. Stripe prøver på nytt i drøyt en uke, og
 * det ville vært surt å stenge handlelista mens banken holder på med sitt.
 */
export const GRACE_DAYS = 5;

/** «2026-09-01» → dagnummer. Ren dato-aritmetikk, uten tidssoner å gå seg vill i. */
function dayNumber(value) {
  if (!value) return null;
  const s = String(value).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000);
}

/** Dagens dato som «2026-09-01», i norsk tid — ikke i UTC. */
export function today(now = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo' }).format(now);
}

/** Hele dager fra i dag til datoen. Negativt tall = datoen har passert. */
export function daysUntil(date, from = today()) {
  const a = dayNumber(date);
  const b = dayNumber(from);
  return a === null || b === null ? null : a - b;
}

const NOK = (ore) => `${(ore / 100).toLocaleString('nb-NO')} kr`;

function longDate(value) {
  const s = String(value ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return new Date(`${s}T12:00:00Z`)
    .toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Alt appen trenger å vite om abonnementet, avgjort ett sted.
 *
 * Returnerer alltid et objekt — også uten rad i databasen. Da sier vi at
 * tilgangen er i orden: mangler raden er det vår feil, ikke brukerens, og
 * ingen skal miste handlelista si midt i butikken fordi vi rotet.
 */
export function billingState(sub, now = today()) {
  const left = daysUntil(sub?.paid_until, now);
  const until = longDate(sub?.paid_until);
  const price = sub?.price_ore ?? PRICE_ORE;

  if (!sub) {
    return { access: true, status: 'ukjent', tone: 'ok', daysLeft: null,
             title: 'Abonnement', detail: null, canSubscribe: true };
  }

  // Finnes det alt et abonnement hos Stripe, skal «Start abonnement» ALDRI
  // vises. Ellers tegner den som er i prøveperioden et nummer to og blir
  // trukket dobbelt. Og kundeportalen skal være åpen så snart vi har en
  // kunde — det er der man sier opp, og det må gå an FØR første trekk.
  const hasStripe = Boolean(sub.stripe_subscription_id);
  const hasCustomer = Boolean(sub.stripe_customer_id);

  const base = { daysLeft: left, until, price, status: sub.status,
                 hasStripe, hasCustomer,
                 manage: hasCustomer,
                 cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end) };

  switch (sub.status) {
    case 'grunnlegger':
      return { ...base, access: true, tone: 'ok', canSubscribe: false,
               title: 'Grunnlegger',
               detail: 'Gratis for dere. Takk for at dere var med fra starten 🎉' };

    case 'aktiv': {
      const ending = base.cancelAtPeriodEnd;
      return { ...base, access: left !== null && left >= 0, tone: ending ? 'snart' : 'ok',
               canSubscribe: false, manage: true,
               title: ending ? 'Sagt opp' : 'Aktivt abonnement',
               detail: ending
                 ? `Dere har appen ut perioden, til ${until}. Ombestemmer dere dere, kan den slås på igjen.`
                 : `${NOK(price)} i måneden. Neste trekk ${until}.` };
    }

    case 'prøve': {
      const soon = left !== null && left <= 7;
      return { ...base, access: left !== null && left >= 0, tone: soon ? 'snart' : 'ok',
               canSubscribe: !hasStripe,
               title: 'Prøveperiode',
               detail: left === null ? null
                 : left < 0 ? 'Prøveperioden er over.'
                 : left === 0 ? 'Siste dag av prøveperioden.'
                 : `${left} ${left === 1 ? 'dag' : 'dager'} igjen — til ${until}.` };
    }

    case 'poeng':
      return { ...base, access: left !== null && left >= 0,
               tone: left !== null && left <= 7 ? 'snart' : 'ok', canSubscribe: !hasStripe,
               title: 'Betalt med Plukkepoeng',
               detail: `Dekket til ${until}. Flere poeng gir flere måneder.` };

    case 'forfalt': {
      const access = left !== null && left >= -GRACE_DAYS;
      return { ...base, access, tone: access ? 'snart' : 'stengt', manage: true,
               canSubscribe: false,
               title: 'Betalingen gikk ikke gjennom',
               detail: access
                 ? 'Vi prøver kortet på nytt de nærmeste dagene. Oppdater gjerne kortet, så ordner det seg av seg selv.'
                 : 'Kortet gikk ikke gjennom. Oppdater det, så er dere i gang igjen med én gang.' };
    }

    case 'utløpt':
    default:
      return { ...base, access: false, tone: 'stengt', canSubscribe: !hasStripe,
               title: 'Abonnementet har gått ut',
               detail: `Listene deres ligger trygt der de er. ${NOK(price)} i måneden slår dem på igjen.` };
  }
}

/**
 * Skal vi mase? Bare når noe faktisk krever en handling.
 * Et aktivt abonnement som løper videre er ingen nyhet for noen.
 */
export function needsAttention(state) {
  return state?.tone === 'snart' || state?.tone === 'stengt';
}

/**
 * Den myke sperren: hva som fortsatt går når abonnementet er ute.
 *
 * Å lese, krysse av og gjøre opp er alltid lov. Det er å legge til nytt
 * som stopper. Ingen skal stå i butikken med en liste de ikke får huket
 * av fordi et kort utløp i går.
 */
export function canWrite(state) {
  return state?.access !== false;
}
