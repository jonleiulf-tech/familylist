/* «Kontoutskrift hovedbok, pr. avdeling» – rapporten Michael sender.

   Formatet er fast (regnskapssystemet til SiG lager den), og ser slik ut:

     Kontoutskrift hovedbok, pr. avdeling
     Årstall 2026, Periode 1-12, Avdeling 1-12
     Hovedbokskonto 6565 - Undergrupper
     Konto 6565 Undergrupper - Avdeling nr. 10
     Bilagsnr.  Dato  Periode  Tekst  Mvakode  Avdeling  Beløp  Konto
     9   13.01.2026  1  20182 - PING SERVICES AS - fakturanr. 38078036  0  10  2 490,00  6565
     …
     42 982,20 Sum konto 6565, Avdeling nr. 10
     …
     135 043,17 Sum konto 6565:

   AVDELINGEN ER GRUPPA. Avdeling 5 er Høyt Under Taket-fakturaene, altså
   klatring; avdeling 11 er Cage Grenland, altså padel. Hvilket nummer som
   hører til hvilken gruppe settes én gang i admin – det står ingen steder
   i rapporten.

   To ting gjør parsingen vrien, og begge finnes i de virkelige filene:

     1. Tekst kan mangle helt:
          259  21.04.2026  4     1  10  1 755,00  6565
     2. Mvakode kan mangle:
          57  31.01.2026  1  20045 - Porsgrunn kommune …     10  1 750,00  6565

   Derfor ankres hver rad i avdelingsnummeret, som vi allerede kjenner fra
   overskriften over, og alt mellom perioden og avdelingen leses som tekst
   pluss en eventuell mvakode.

   RAPPORTEN KONTROLLERER SEG SELV. Den oppgir sin egen delsum per avdeling
   og en totalsum. Stemmer ikke det vi har lest med det som står, har vi
   lest feil – og da skal importen si fra, ikke gjette. */

/* ---------- Små deler ---------- */

/* «2 490,00» → 2490. Tusenskillet kan være vanlig mellomrom, hardt
   mellomrom eller smalt hardt mellomrom, avhengig av hvem som lagde
   PDF-en. Negative beløp skrives med minus foran eller bak. */
export function tilTall(tekst) {
  const s = String(tekst ?? '').replace(/[\s   ]/g, '').trim();
  if (!s) return null;
  const bak = /-$/.test(s);
  const rent = s.replace(/^-/, '').replace(/-$/, '').replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(rent)) return null;
  const n = Number(rent);
  return Number.isFinite(n) ? (bak || /^-/.test(s) ? -n : n) : null;
}

/* «13.01.2026» → «2026-01-13» */
export function tilDato(tekst) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(tekst ?? '').trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/* Et beløp, og ikke noe mer.

   Tusenskillet er ETT mellomrom mellom grupper på nøyaktig tre siffer.
   Tillater man mellomrom fritt inni mønsteret, sluker det nabokolonnene:
   «0   10   2 490,00» ble lest som 102 490,00, og avdeling 10 kom ut
   111 000 kroner for høy. Delsummene i rapporten avslørte det. */
const MELLOMROM = '[ \\u00a0\\u202f\\u2009]';
const BELOP_MONSTER = String.raw`-?\d{1,3}(?:MELLOMROM\d{3})*(?:,\d{2})?-?`;
const BELØP = BELOP_MONSTER.replace('MELLOMROM', MELLOMROM);

/* ---------- Linjetyper ---------- */

export const erAvdelingsstart = (l) => /Avdeling\s*nr\.\s*(-?\w+)\s*$/.test(l) && /^Konto\b/.test(l.trim());
export const avdelingAv = (l) => {
  const m = /Avdeling\s*nr\.\s*(-?\w+)\s*$/.exec(l);
  return m ? m[1] : null;
};
export const erKolonneoverskrift = (l) => /Bilagsnr\.?\s+Dato\s+Periode/.test(l);
export const erSidefot = (l) => /Side\s+\d+\s+av\s+\d+/.test(l);

/* «42 982,20 Sum konto 6565, Avdeling nr. 10» */
export function delsumAv(linje) {
  const m = new RegExp(String.raw`^\s*(${BELØP})\s+Sum konto\s+(\d+),\s*Avdeling\s*nr\.\s*(-?\w+)`).exec(linje);
  return m ? { sum: tilTall(m[1]), konto: m[2], avdeling: m[3] } : null;
}

/* «135 043,17 Sum konto 6565:» */
export function totalsumAv(linje) {
  const m = new RegExp(String.raw`^\s*(${BELØP})\s+Sum konto\s+(\d+):`).exec(linje);
  return m ? { sum: tilTall(m[1]), konto: m[2] } : null;
}

export function metaAv(linje) {
  const m = /Årstall\s+(\d{4})/.exec(linje);
  return m ? { ar: Number(m[1]) } : null;
}

export function kontoAv(linje) {
  const m = /Hovedbokskonto\s+(\d+)\s*-\s*(.+?)\s*$/.exec(linje);
  return m ? { konto: m[1], kontonavn: m[2] } : null;
}

/* En bokføringslinje, gitt at vi vet hvilken avdeling vi står i.

   Ankeret er avdelingsnummeret rett før beløpet. Det er det eneste feltet
   vi kjenner verdien av på forhånd, og det gjør at både manglende tekst og
   manglende mvakode går bra. */
export function linjeAv(linje, avdeling) {
  const møn = new RegExp(
    String.raw`^\s*(\d+)\s+(\d{2}\.\d{2}\.\d{4})\s+(\d{1,2})\s+(.*?)\s*${escape(avdeling)}\s+(${BELØP})\s+(\d+)\s*$`,
  );
  const m = møn.exec(linje);
  if (!m) return null;
  const belop = tilTall(m[5]);
  const dato = tilDato(m[2]);
  if (belop === null || dato === null) return null;
  // Det som står mellom perioden og avdelingen er teksten, med mvakoden
  // som et eget lite tall til slutt om den er der. Den må plukkes som et
  // helt ord: gjør man det med et regex på siffer, spiser den to sifre av
  // «fakturanr. 93166661» og lager mvakode 61 av dem.
  const ord = m[4].trim().split(/\s+/).filter(Boolean);
  let mvakode = null;
  if (ord.length && /^\d{1,2}$/.test(ord[ord.length - 1])) mvakode = ord.pop();
  const midt = ord.join(' ');
  return {
    bilagsnr: m[1],
    dato,
    periode: Number(m[3]),
    tekst: midt || null,
    mvakode,
    avdeling: String(avdeling),
    belop,
    konto: m[6],
  };
}

const escape = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ---------- Hele rapporten ---------- */

const øre = (n) => Math.round(Number(n || 0) * 100);

export function parseHovedbok(linjer = []) {
  const ut = {
    ar: null,
    konto: null,
    kontonavn: null,
    avdelinger: [],
    linjer: [],
    sum: null,
    oppgittSum: null,
    advarsler: [],
  };
  let nå = null;

  for (const rå of linjer) {
    const l = String(rå ?? '').replace(/ /g, ' ').trimEnd();
    if (!l.trim()) continue;
    if (erSidefot(l) || erKolonneoverskrift(l)) continue;

    const meta = metaAv(l);
    if (meta && !ut.ar) { ut.ar = meta.ar; continue; }

    const k = kontoAv(l);
    if (k) { ut.konto = k.konto; ut.kontonavn = k.kontonavn; continue; }

    const total = totalsumAv(l);
    if (total) { ut.oppgittSum = total.sum; continue; }

    const del = delsumAv(l);
    if (del) {
      if (nå && nå.nr === del.avdeling) { nå.oppgittSum = del.sum; nå = null; }
      continue;
    }

    if (erAvdelingsstart(l)) {
      const nr = avdelingAv(l);
      nå = ut.avdelinger.find((a) => a.nr === nr);
      if (!nå) { nå = { nr, linjer: [], oppgittSum: null }; ut.avdelinger.push(nå); }
      continue;
    }

    if (!nå) continue;
    const rad = linjeAv(l, nå.nr);
    if (rad) { nå.linjer.push(rad); ut.linjer.push(rad); continue; }
    // En linje inne i en avdeling som ikke lot seg lese er verdt å si fra
    // om: det kan være en rad vi mister.
    if (/^\s*\d+\s+\d{2}\.\d{2}\.\d{4}/.test(l)) ut.advarsler.push(`Klarte ikke lese linja: «${l.trim()}»`);
  }

  // Rapporten oppgir sine egne summer. Stemmer de ikke, har vi lest feil.
  for (const a of ut.avdelinger) {
    a.sum = kroner(a.linjer.reduce((t, r) => t + øre(r.belop), 0));
    if (a.oppgittSum !== null && øre(a.sum) !== øre(a.oppgittSum)) {
      ut.advarsler.push(`Avdeling ${a.nr}: leste ${a.sum}, rapporten sier ${a.oppgittSum}.`);
    }
  }
  ut.sum = kroner(ut.linjer.reduce((t, r) => t + øre(r.belop), 0));
  if (ut.oppgittSum !== null && øre(ut.sum) !== øre(ut.oppgittSum)) {
    ut.advarsler.push(`Totalt: leste ${ut.sum}, rapporten sier ${ut.oppgittSum}.`);
  }
  return ut;
}

const kroner = (ø) => Math.round(ø) / 100;

/* Stemmer alt? Da kan importen kjøres uten at noen leser gjennom først. */
export const gikkOpp = (r) => r.advarsler.length === 0 && r.linjer.length > 0;

/* ---------- Nøkler, så samme rapport kan importeres om igjen ---------- */

/* Rapporten Michael sender i august inneholder alt som sto i den fra
   april. Importerer man begge, skal ikke januar telles to ganger. Nøkkelen
   må derfor være stabil for den samme bokføringslinja, og forskjellig for
   to linjer som bare ligner.

   To rader kan være helt like bortsett fra rekkefølgen (samme bilag, samme
   beløp, samme dag). Da skiller løpenummeret dem. */
export function nøkkelFor(rad, løpenummer = 0) {
  return [
    rad.konto, rad.avdeling, rad.bilagsnr, rad.dato,
    rad.mvakode ?? '-', øre(rad.belop), løpenummer,
  ].join('|');
}

export function medNøkler(linjer = []) {
  const sett = new Map();
  return linjer.map((rad) => {
    const grunn = nøkkelFor(rad, 0);
    const n = sett.get(grunn) || 0;
    sett.set(grunn, n + 1);
    return { ...rad, nokkel: nøkkelFor(rad, n) };
  });
}

/* ---------- Hva importen vil gjøre ---------- */

/* Sammenligner det som står i rapporten med det som alt ligger i basen.
   Ingenting skrives før noen har sett denne lista.

   Rapporten dekker HELE regnskapet, ikke bare PSI. Avdelingslista til SiG
   har tolv avdelinger, og Makerspace, Formula Student, Filmklubben,
   Musikkklubben og Sqeeze er ikke våre. De merkes som «hopp over» én
   gang, og da hverken importeres de eller spørres det om dem igjen. */
export function planlegg({ linjer = [], eksisterende = [], kobling = {}, ignorerte = [] }) {
  const hopp = new Set([...ignorerte].map(String));
  const fraFør = new Map(eksisterende.map((r) => [r.nokkel, r]));
  const nye = [];
  const uendret = [];
  const endret = [];
  const hoppetOver = [];
  for (const rad of medNøkler(linjer)) {
    if (hopp.has(rad.avdeling)) { hoppetOver.push(rad); continue; }
    const gammel = fraFør.get(rad.nokkel);
    const sport_slug = kobling[rad.avdeling] === undefined ? undefined : kobling[rad.avdeling];
    const med = { ...rad, sport_slug };
    if (!gammel) nye.push(med);
    else if (øre(gammel.belop) !== øre(rad.belop) || gammel.tekst !== rad.tekst) endret.push({ ...med, id: gammel.id });
    else uendret.push({ ...med, id: gammel.id });
  }
  const ukjenteAvdelinger = [...new Set(linjer.map((r) => r.avdeling))]
    .filter((a) => !hopp.has(a) && kobling[a] === undefined);
  return { nye, endret, uendret, hoppetOver, ukjenteAvdelinger };
}
