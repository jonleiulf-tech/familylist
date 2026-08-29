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
export function estimatedTotal(items) {
  const rows = items.filter((i) => Number(i.price) > 0);
  const sum = rows.reduce((acc, i) => acc + Number(i.price) * Number(i.qty || 1), 0);
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
export function tripName(date = new Date()) {
  return `Handletur ${weekdayName(date.getDay())} ${date.getDate()}. ${MONTHS[date.getMonth()]}`;
}
