// Norsk formatering: mellomrom som tusenskille, komma som desimalskille.

const nbNumber = new Intl.NumberFormat('nb-NO', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const nbInt = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 });

export const num = (v) => nbNumber.format(Number(v) || 0);

/** «kr 115» / «kr 19,20». Runde kroner vises uten desimaler. */
export function kr(value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return '—';
  return Number.isInteger(v) ? `kr ${nbInt.format(v)}` : `kr ${nbNumber.format(v)}`;
}

/**
 * Estimert total. Prefikset «ca.» brukes så snart én pris ikke kommer
 * fra Kassalapp — da er summen et anslag, ikke en kvittering.
 */
/**
 * Antall INNKJØP en mengde tilsvarer — prisen i katalogen er per pakke/stk,
 * så «600 g laks» er 2 pakker à ~400 g, ikke 600 × pakkeprisen (som ga
 * kr 76 110 for en laksemiddag). Små mål (dl, ss, fedd …) er én innkjøpt
 * enhet; stk-aktige enheter rundes opp til hele.
 */
export function purchases(qty, unit, packSize) {
  const q = Number(qty) || 1;
  const u = String(unit || '').toLowerCase();
  // Pakkestørrelser under 10 g er datastøy (en «pakke» laks på 1 gram gir
  // 500 kjøp for 500 g) — da brukes standarden på 400 g i stedet.
  const pack = Number(packSize) >= 10 ? Number(packSize) : 400;
  if (u === 'g') return Math.max(1, Math.ceil(q / pack));
  if (u === 'kg') return Math.max(1, Math.ceil((q * 1000) / pack));
  if (u === 'liter' || u === 'l') {
    // Flaske/kartong-størrelse i pack_size (liter): «1,75 l melk» = 1 kartong,
    // «4×1,5 l brus» (qty 6, pack 1,5) = 4. Uten kjent størrelse: ceil(liter).
    const litrePack = Number(packSize) > 0 ? Number(packSize) : null;
    return litrePack ? Math.max(1, Math.ceil(q / litrePack)) : Math.max(1, Math.ceil(q));
  }
  if (['dl', 'cl', 'ml', 'ss', 'ts', 'kopp', 'fedd', 'skive', 'neve', 'bunt', 'klype'].includes(u)) return 1;
  return Math.max(1, Math.ceil(q));       // stk, pakke, boks, pose, glass …
}

/**
 * Liten forklaringstekst som gjør mengden entydig — «3 pakke» alene sier
 * ikke hvor mange gram det er. Vises i liten skrift under mengden, likt
 * alle steder mengder står (gjennomgang, handleliste, butikkmodus, middag).
 *
 * Ukjent pakkestørrelse → standardantakelsen 400 g merkes «ca.», samme
 * antakelse som prisestimatet (purchases) bruker.
 */
export function qtyDetail(qty, unit, packSize) {
  const q = Number(qty) || 0;
  if (q <= 0) return null;
  const u = String(unit || '').toLowerCase();
  const known = Number(packSize) >= 10;
  const pack = known ? Number(packSize) : 400;
  const approx = known ? '' : 'ca. ';
  const g = (n) => `${Math.round(n).toLocaleString('nb-NO')} g`;

  if (['pakke', 'pk', 'pose', 'boks', 'glass'].includes(u)) {
    return q > 1
      ? `à ${approx}${g(pack)} — ${approx}${g(q * pack)} totalt`
      : `à ${approx}${g(pack)}`;
  }
  if (u === 'g' || u === 'kg') {
    const grams = u === 'kg' ? q * 1000 : q;
    const n = Math.max(1, Math.ceil(grams / pack));
    return `kjøpes som ${n} ${n === 1 ? 'pakke' : 'pakker'} à ${approx}${g(pack)}`;
  }
  return null;   // stk, liter, dl, ss … er entydige nok
}

/**
 * Prisestimat for én rad: pakkepris × antall innkjøp.
 * Vern mot dårlige prisdata (ørepriser fra import, gale pakkestørrelser):
 * ingen enkelt matvare koster titusener — et slikt «estimat» er verdiløst
 * og skjules heller enn å skremme med «ca. kr 63 425» for en laks.
 */
export function estimateCost(row) {
  const cost = (Number(row.price) || 0) * purchases(row.qty, row.unit, row.pack_size);
  return cost > 10000 ? 0 : cost;
}

export function estimatedTotal(items) {
  const rows = items.filter((i) => Number(i.price) > 0);
  const sum = rows.reduce((acc, i) => acc + estimateCost(i), 0);
  const exact = rows.length > 0 && rows.every((i) => i.price_source === 'kassalapp');
  return { sum, exact, label: rows.length ? `${exact ? '' : 'ca. '}${kr(sum)}` : '—' };
}

/** Literpris/enhetspris: «kr 19,20/l». */
export function unitPrice(price, weight, weightUnit) {
  const p = Number(price);
  const w = Number(weight);
  if (!Number.isFinite(p) || !Number.isFinite(w) || w <= 0) return null;
  if (weightUnit === 'ml' || weightUnit === 'l') {
    const litres = weightUnit === 'ml' ? w / 1000 : w;
    return `${kr(p / litres)}/l`;
  }
  if (weightUnit === 'g' || weightUnit === 'kg') {
    const kilos = weightUnit === 'g' ? w / 1000 : w;
    return `${kr(p / kilos)}/kg`;
  }
  return `${kr(p / w)}/${weightUnit || 'stk'}`;
}

const WEEKDAYS = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
export const weekdayName = (d) => WEEKDAYS[d] ?? '';

export function dayLabel(isoDate) {
  const d = new Date(`${isoDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return 'I dag';
  if (diff === 1) return 'I morgen';
  return `${weekdayName(d.getDay())} ${d.getDate()}.`;
}

export const isoDate = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

/** «Handletur onsdag 27. august» — forvalgt navn når en tur lagres. */
const MONTHS = ['januar','februar','mars','april','mai','juni','juli','august','september','oktober','november','desember'];
const DAYS_SHORT = ['SØN', 'MAN', 'TIR', 'ONS', 'TOR', 'FRE', 'LØR'];
const MONTHS_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAI', 'JUN', 'JUL', 'AUG', 'SEP', 'OKT', 'NOV', 'DES'];

/** «LØR 29. AUG» — datostripene på dagskortene. */
export function shortDate(isoDate) {
  // Tåler både rene datoer ('2026-08-30') og fulle tidsstempler fra
  // databasen ('2026-08-30T07:12:34+00:00').
  const s = String(isoDate ?? '');
  const d = new Date(s.includes('T') ? s : `${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return `${DAYS_SHORT[d.getDay()]} ${d.getDate()}. ${MONTHS_SHORT[d.getMonth()]}`;
}

export function longDate(date = new Date()) {
  const d = new Date(date);
  const wd = weekdayName(d.getDay());
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)} ${d.getDate()}. ${MONTHS[d.getMonth()]}`;
}

export function tripName(date = new Date()) {
  return `Handletur ${weekdayName(date.getDay())} ${date.getDate()}. ${MONTHS[date.getMonth()]}`;
}
