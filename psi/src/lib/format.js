export function paragraphs(text) {
  return String(text || '').split(/\n{2,}|\r?\n/).map((s) => s.trim()).filter(Boolean);
}

/* '2026-09-11' → '11. sep 2026' / '11 Sep 2026' */
const MONTHS = {
  nb: ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};
export function fmtDate(iso, lang = 'nb') {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const mon = MONTHS[lang]?.[m - 1] ?? MONTHS.nb[m - 1];
  return lang === 'nb' ? `${d}. ${mon} ${y}` : `${d} ${mon} ${y}`;
}

export function timeRange(slot) {
  return `${slot.from}–${slot.to}`;
}
