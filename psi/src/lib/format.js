export function paragraphs(text) {
  return String(text || '').split(/\n{2,}|\r?\n/).map((s) => s.trim()).filter(Boolean);
}

/* '2026-09-11' → '11. sep 2026' / '11 Sep 2026' */
const MONTHS = {
  nb: ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};
export function fmtDate(iso, lang = 'nb') {
  // Datoen kan mangle – en gruppe uten sist-oppdatert, en rad uten dato.
  // Bunnteksten ligger utenfor ErrorBoundary, så en TypeError her tar
  // hele siden.
  if (typeof iso !== 'string' || !iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const mon = MONTHS[lang]?.[m - 1] ?? MONTHS.nb[m - 1];
  return lang === 'nb' ? `${d}. ${mon} ${y}` : `${d} ${mon} ${y}`;
}

export function timeRange(slot) {
  return `${slot.from}–${slot.to}`;
}

/* Kort smakebit til nyhetskortene. Brukes når saken ikke har en egen
   ingress — Spond-innlegg har det aldri. Klipper ved ordgrense, aldri
   midt i et ord, og setter ellipse bare når noe faktisk ble klippet. */
export function excerpt(text, max = 160) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.5 ? cut.slice(0, space) : cut).replace(/[.,;:–-]+$/, '')} …`;
}

/* Dato fra et tidsstempel, i norsk tid. published_at er UTC, og å klippe
   de ti første tegnene gir gårsdagens dato for alt som publiseres etter
   kl. 22 om sommeren. */
export function dagFra(tidsstempel) {
  if (!tidsstempel) return '';
  const d = new Date(tidsstempel);
  if (Number.isNaN(d.getTime())) return String(tidsstempel).slice(0, 10);
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit' });
  return f.format(d);
}
