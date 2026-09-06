/* Økonomien til PSI: hva hver gruppe har fått, hva som er planlagt, og
   hva som faktisk er brukt.

   Modellen er hentet rett ut av regnearket styret har brukt til nå
   (Budsjett PSI 2026 – justert.xlsx):

     periode      Vår 2026, Høst 2026 …
     tildeling    én per gruppe per periode: innvilget fra SSN/SiG, pluss
                  det som eventuelt er overført fra i fjor
     post         én budsjettlinje: aktivitet, beskrivelse, budsjettert sum
     bilag        én kvittering: hva, beløp, dato, fil, status

   «Felles PSI» er en gruppe på linje med de andre, men uten slug – det er
   den samme bolken som ligger nederst i regnearket.

   Kroner regnes i øre. Summerer man 38,125 og 2193,75 som flyttall nok
   ganger, ender man med 0,000000001 for mye, og et budsjett som ikke går
   opp er verdiløst uansett hvor lite avviket er. */

/* ---------- Kroner ---------- */

export const øre = (kr) => Math.round(Number(kr || 0) * 100);
export const kroner = (ø) => Math.round(ø) / 100;

/* Summerer beløp i kroner uten flyttallsdrift. */
export function sum(beløp = []) {
  return kroner(beløp.reduce((t, b) => t + øre(typeof b === 'object' && b !== null ? b.belop : b), 0));
}

/* «kr 12 345» – hele kroner når det går opp, ellers to desimaler. Norske
   tusenskiller er hardt mellomrom, ikke vanlig mellomrom: ellers brekker
   tallet midt i tabellen. */
export function kr(verdi, { tegn = true } = {}) {
  const n = Number(verdi || 0);
  const desimaler = Math.round(n * 100) % 100 === 0 ? 0 : 2;
  const tall = new Intl.NumberFormat('nb-NO', { minimumFractionDigits: desimaler, maximumFractionDigits: desimaler }).format(n);
  return tegn ? `kr ${tall}` : tall;
}

/* ---------- Status på et bilag ---------- */

/* registrert  lagt inn av gruppa, teller mot budsjettet med en gang
   sendt       med i et utlegg som er sendt til SiG
   refundert   pengene er kommet tilbake
   avvist      teller ikke – feilført, dublett, eller ikke godkjent */
export const BILAGSTATUS = ['registrert', 'sendt', 'refundert', 'avvist'];
export const BILAGSTATUS_TEKST = {
  registrert: 'Registrert',
  sendt: 'Sendt til SiG',
  refundert: 'Refundert',
  avvist: 'Avvist',
};

/* Avviste bilag er de eneste som ikke belaster budsjettet. Et bilag som
   ligger og venter på refusjon er like fullt penger som er brukt. */
export const teller = (b) => b?.status !== 'avvist';

/* ---------- Regnestykket for én gruppe i én periode ---------- */

export function regnUt({ tildeling, poster = [], bilag = [] }) {
  const innvilget = Number(tildeling?.innvilget || 0);
  const overfort = Number(tildeling?.overfort || 0);
  const tilgjengelig = kroner(øre(innvilget) + øre(overfort));
  const tellende = bilag.filter(teller);
  const budsjettert = sum(poster.map((p) => p.budsjettert));
  const brukt = sum(tellende);
  const refundert = sum(tellende.filter((b) => b.status === 'refundert'));
  const venter = sum(tellende.filter((b) => b.status !== 'refundert'));
  return {
    innvilget,
    overfort,
    tilgjengelig,
    budsjettert,
    brukt,
    refundert,
    venter,
    /* Det gruppelederen egentlig spør om: hvor mye er igjen? */
    rest: kroner(øre(tilgjengelig) - øre(brukt)),
    /* Og: er det vi har planlagt i det hele tatt dekket? */
    restBudsjettert: kroner(øre(tilgjengelig) - øre(budsjettert)),
    antallBilag: tellende.length,
    overforbruk: øre(brukt) > øre(tilgjengelig),
    overbudsjettert: øre(budsjettert) > øre(tilgjengelig),
  };
}

/* Hvor mye av tildelingen som er brukt, som andel. Til søylen i
   grensesnittet. Uten tildeling gir vi 0 og ikke NaN – en gruppe uten
   innvilget beløp skal ikke tegne en søyle som går i stykker. */
export function andelBrukt({ tilgjengelig, brukt }) {
  if (!tilgjengelig) return brukt > 0 ? 1 : 0;
  return Math.max(0, Math.min(1, brukt / tilgjengelig));
}

/* ---------- Perioder ---------- */

export const SEMESTRE = [['var', 'Vår'], ['host', 'Høst']];
export const semesterNavn = (s) => (s === 'host' ? 'Høst' : 'Vår');
export const periodeNavn = (p) => (p ? `${semesterNavn(p.semester)} ${p.ar}` : '');

/* Hvilken periode vi står i nå. Vår er januar–juli, høst august–desember:
   semesteret slutter når eksamen er over, ikke ved nyttår. */
export function periodeFor(dato = new Date()) {
  const d = dato instanceof Date ? dato : new Date(dato);
  return { ar: d.getFullYear(), semester: d.getMonth() + 1 <= 7 ? 'var' : 'host' };
}

/* Nyeste først: 2026 høst, 2026 vår, 2025 høst … */
export function sorterPerioder(perioder = []) {
  return [...perioder].sort((a, b) => b.ar - a.ar || (b.semester === 'host' ? 1 : 0) - (a.semester === 'host' ? 1 : 0));
}

/* ---------- Gruppene i økonomien ---------- */

/* Felles PSI er en egen bolk uten idrettsgruppe, akkurat som i
   regnearket. null er nøkkelen dens, og den skal alltid være med. */
export const FELLES = { slug: null, name: 'Felles PSI', icon: '◎' };

export function grupperFor(sports = []) {
  return [...sports.map((s) => ({ slug: s.slug, name: s.name, icon: s.icon })), FELLES];
}

export const nøkkel = (slug) => slug || '__felles';

/* Samler alt til én rad per gruppe, klar for tabellen. */
export function oversikt({ grupper = [], tildelinger = [], poster = [], bilag = [] }) {
  const perGruppe = (liste) => {
    const m = new Map();
    for (const x of liste) {
      const k = nøkkel(x.sport_slug);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(x);
    }
    return m;
  };
  const tPost = perGruppe(poster);
  const tBilag = perGruppe(bilag);
  const tTild = new Map(tildelinger.map((t) => [nøkkel(t.sport_slug), t]));
  return grupper.map((g) => {
    const k = nøkkel(g.slug);
    return { ...g, ...regnUt({ tildeling: tTild.get(k), poster: tPost.get(k) || [], bilag: tBilag.get(k) || [] }) };
  });
}

/* Totalen nederst. Summeres fra radene, ikke regnet om på nytt, så
   tabellen og totalen aldri kan si to forskjellige ting. */
export function total(rader = []) {
  const s = (felt) => sum(rader.map((r) => r[felt]));
  const tilgjengelig = s('tilgjengelig');
  const brukt = s('brukt');
  return {
    innvilget: s('innvilget'),
    overfort: s('overfort'),
    tilgjengelig,
    budsjettert: s('budsjettert'),
    brukt,
    refundert: s('refundert'),
    venter: s('venter'),
    rest: kroner(øre(tilgjengelig) - øre(brukt)),
    antallBilag: rader.reduce((t, r) => t + (r.antallBilag || 0), 0),
  };
}
