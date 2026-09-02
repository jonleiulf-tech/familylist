// Måleenheter: hva man kan velge mellom, og hva som skjer med tallet når
// man bytter enhet.
//
// «20 dl mel» skal kunne bli «2 l» med ett trykk. Innenfor samme familie
// (vekt eller volum) regnes tallet om, fordi omregningen er en fasit.
// På tvers av familier finnes ingen fasit — 20 dl mel er ikke 2 kg mel
// uten å vite tettheten — så da beholdes tallet og bare enheten byttes.

/** Enhetene i velgeren, i den rekkefølgen de vises. */
export const UNIT_OPTIONS = [
  { value: 'stk', label: 'stk' },
  { value: 'pakke', label: 'pakke' },
  { value: 'boks', label: 'boks' },
  { value: 'pose', label: 'pose' },
  // Slik noe faktisk selges: en bunt persille eller asparges, en klase
  // bananer eller tomater.
  { value: 'bunt', label: 'bunt' },
  { value: 'klase', label: 'klase' },
  { value: 'g', label: 'g' },
  { value: 'hg', label: 'hg' },
  { value: 'kg', label: 'kg' },
  { value: 'ml', label: 'ml' },
  { value: 'dl', label: 'dl' },
  { value: 'liter', label: 'l' },
  { value: 'ss', label: 'ss' },
  { value: 'ts', label: 'ts' },
  { value: 'fedd', label: 'fedd' },
  { value: 'neve', label: 'neve' },
];

// Skrivemåter som betyr det samme. «l» og «liter» lagres som «liter»,
// fordi resten av appen (isPackUnit, guessUnit) alt bruker den formen.
const ALIAS = {
  l: 'liter', ltr: 'liter', lt: 'liter', liter: 'liter', litre: 'liter', litres: 'liter', liters: 'liter',
  g: 'g', gr: 'g', gram: 'g', grammer: 'g',
  hg: 'hg', hekto: 'hg', hektogram: 'hg',
  kg: 'kg', kilo: 'kg', kilogram: 'kg',
  ml: 'ml', milliliter: 'ml',
  cl: 'cl', centiliter: 'cl',
  dl: 'dl', desiliter: 'dl',
  ss: 'ss', spiseskje: 'ss', spiseskjeer: 'ss',
  ts: 'ts', teskje: 'ts', teskjeer: 'ts',
  stk: 'stk', stykk: 'stk', styk: 'stk',
  pk: 'pakke', pakke: 'pakke', pakker: 'pakke',
  boks: 'boks', bokser: 'boks',
  pose: 'pose', poser: 'pose',
  fedd: 'fedd',
  neve: 'neve', never: 'neve',
  bunt: 'bunt', bunter: 'bunt',
  klase: 'klase', klaser: 'klase',
  klype: 'klype',
  porsjon: 'porsjon', porsjoner: 'porsjon',
};

/** Kanonisk enhetsnavn, eller null når enheten er ukjent/tom. */
export function normalizeUnit(unit) {
  const raw = String(unit ?? '').trim().toLowerCase().replace(/\.$/, '');
  if (!raw) return null;
  return ALIAS[raw] ?? null;
}

// Faktorer inn til en grunnenhet per familie. Skjeene hører til volum:
// 1 ss = 15 ml er standard i norske oppskrifter, 1 ts = 5 ml.
const FAMILIES = [
  { name: 'vekt', units: { g: 1, hg: 100, kg: 1000 } },
  { name: 'volum', units: { ml: 1, cl: 10, dl: 100, liter: 1000, ts: 5, ss: 15 } },
];

/** «vekt», «volum» eller null (stk, pakke, fedd … har ingen omregning). */
export function unitFamily(unit) {
  const u = normalizeUnit(unit);
  if (!u) return null;
  return FAMILIES.find((f) => u in f.units)?.name ?? null;
}

/** Tall fra et skjemafelt: «2,5» og «2.5» er samme mengde. */
export function parseQty(qty) {
  const raw = String(qty ?? '').trim().replace(',', '.');
  if (!raw) return null;          // tomt felt er ingen mengde, ikke null gram
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Runder til noe man kjenner igjen: 0,4 — 2 — 1500 — 0,067. */
function roundNice(value) {
  const abs = Math.abs(value);
  const decimals = abs >= 100 ? 0 : abs >= 10 ? 1 : abs >= 1 ? 2 : 3;
  return Number(value.toFixed(decimals));
}

/**
 * Regner mengden om når enheten byttes.
 * @returns {{qty:number|null, converted:boolean}} converted er false når
 *   tallet ble stående (ukjent enhet, samme enhet eller ulik familie).
 */
export function convertQty(qty, fromUnit, toUnit) {
  const n = parseQty(qty);
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);
  if (n === null || !from || !to || from === to) return { qty: n, converted: false };
  const family = FAMILIES.find((f) => from in f.units && to in f.units);
  if (!family) return { qty: n, converted: false };
  return { qty: roundNice((n * family.units[from]) / family.units[to]), converted: true };
}

/**
 * Enheten som passer best for mengden innenfor samme familie: 2000 g blir
 * «2 kg», 0,5 dl blir «50 ml». Brukes til å foreslå — aldri til å endre
 * noe bak brukerens rygg.
 */
export function tidyUnit(qty, unit) {
  const n = parseQty(qty);
  const u = normalizeUnit(unit);
  const family = u ? FAMILIES.find((f) => u in f.units) : null;
  if (n === null || !family || n === 0) return { qty: n, unit: u };
  // Skjeene er et mål, ikke en pakningsstørrelse — de skal stå som de er.
  if (u === 'ss' || u === 'ts') return { qty: n, unit: u };
  const base = n * family.units[u];
  const ladder = family.name === 'vekt'
    ? ['g', 'hg', 'kg']
    : ['ml', 'dl', 'liter'];
  let best = u;
  for (const cand of ladder) {
    const v = base / family.units[cand];
    if (v >= 1) best = cand;
  }
  return { qty: roundNice(base / family.units[best]), unit: best };
}
