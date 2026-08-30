// Ingrediens-normalisering for eksterne oppskrifter.
// Rå strenger («600 g kjøttdeig», «2 cloves garlic, minced») → { qty, unit,
// name } → kobling mot VÅR varedatabase via resolveCatalogItem. Eksterne
// kilder får ALDRI lage sitt eget vareunivers — matcher vi ikke trygt,
// merkes raden unmatched og går til manuell avklaring, akkurat som
// Keep-importen.

import { resolveCatalogItem } from '../catalog.js';

// Enheter vi forstår, med kanonisk norsk form.
const UNITS = {
  g: 'g', gram: 'g', grams: 'g', gr: 'g',
  kg: 'kg', kilo: 'kg', kilogram: 'kg',
  l: 'l', liter: 'l', litre: 'l', litres: 'l', liters: 'l',
  dl: 'dl', cl: 'cl', ml: 'ml',
  ss: 'ss', tbsp: 'ss', tablespoon: 'ss', tablespoons: 'ss',
  ts: 'ts', tsp: 'ts', teaspoon: 'ts', teaspoons: 'ts',
  stk: 'stk', pcs: 'stk', piece: 'stk', pieces: 'stk',
  boks: 'boks', bokser: 'boks', can: 'boks', cans: 'boks', tin: 'boks', tins: 'boks',
  pk: 'pk', pakke: 'pk', pakker: 'pk', pack: 'pk', package: 'pk',
  pose: 'pose', poser: 'pose', bag: 'pose',
  glass: 'glass', jar: 'glass',
  fedd: 'fedd', clove: 'fedd', cloves: 'fedd',
  never: 'neve', neve: 'neve', handful: 'neve',
  bunt: 'bunt', bunch: 'bunt',
  skive: 'skive', skiver: 'skive', slice: 'skive', slices: 'skive',
  kopp: 'kopp', cup: 'kopp', cups: 'kopp',
  oz: 'oz', ounce: 'oz', ounces: 'oz',
  lb: 'lb', pound: 'lb', pounds: 'lb',
};

// EN → NO for ingrediensNAVN (vanligste i internasjonale API-er).
// Verdien er navnet slik det står i vår varedatabase / dagligtale.
export const EN_NO = {
  'ground beef': 'kjøttdeig',
  'minced beef': 'kjøttdeig',
  'minced meat': 'kjøttdeig',
  'beef mince': 'kjøttdeig',
  'ground pork': 'medisterdeig',
  'chicken breast': 'kyllingfilet',
  'chicken breasts': 'kyllingfilet',
  'chicken thighs': 'kyllinglår',
  chicken: 'kylling',
  'salmon fillet': 'laksefilet',
  salmon: 'laks',
  cod: 'torsk',
  onion: 'løk',
  onions: 'løk',
  'red onion': 'rødløk',
  'spring onion': 'vårløk',
  'spring onions': 'vårløk',
  garlic: 'hvitløk',
  'garlic clove': 'hvitløk',
  'garlic cloves': 'hvitløk',
  carrot: 'gulrot',
  carrots: 'gulrot',
  potato: 'potet',
  potatoes: 'poteter',
  tomato: 'tomat',
  tomatoes: 'tomater',
  'chopped tomatoes': 'hakkede tomater',
  'crushed tomatoes': 'hakkede tomater',
  'tomato passata': 'passata',
  passata: 'passata',
  'tomato paste': 'tomatpuré',
  'tomato puree': 'tomatpuré',
  cucumber: 'agurk',
  'bell pepper': 'paprika',
  'red pepper': 'paprika',
  pepper: 'pepper',
  'black pepper': 'pepper',
  salt: 'salt',
  sugar: 'sukker',
  flour: 'hvetemel',
  'plain flour': 'hvetemel',
  'all-purpose flour': 'hvetemel',
  butter: 'smør',
  milk: 'melk',
  cream: 'fløte',
  'heavy cream': 'fløte',
  'double cream': 'fløte',
  'sour cream': 'rømme',
  cheese: 'ost',
  'grated cheese': 'revet ost',
  parmesan: 'parmesan',
  egg: 'egg',
  eggs: 'egg',
  rice: 'ris',
  spaghetti: 'spagetti',
  'whole wheat spaghetti': 'fullkornsspagetti',
  'wholewheat spaghetti': 'fullkornsspagetti',
  pasta: 'pasta',
  'olive oil': 'olivenolje',
  oil: 'olje',
  'vegetable oil': 'olje',
  'soy sauce': 'soyasaus',
  broccoli: 'brokkoli',
  spinach: 'spinat',
  mushroom: 'sopp',
  mushrooms: 'sopp',
  'kidney beans': 'kidneybønner',
  chickpeas: 'kikerter',
  lentils: 'linser',
  'coconut milk': 'kokosmelk',
  lemon: 'sitron',
  lime: 'lime',
  bacon: 'bacon',
  'stock cube': 'buljongterning',
  'beef stock': 'kjøttbuljong',
  'chicken stock': 'kyllingbuljong',
  'vegetable stock': 'grønnsaksbuljong',
};

// Beskrivelser som kan strykes fra slutten («, minced», «finely chopped»)
const TRAILING_PREP = /,?\s*(finely |roughly |coarsely )?(minced|chopped|diced|sliced|grated|crushed|peeled|melted|softened|beaten|hakket|finhakket|revet|skivet|i biter|i terninger|i skiver)\.?$/i;

const FRACTIONS = { '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75 };

function parseQty(str) {
  const s = str.trim();
  if (FRACTIONS[s] != null) return FRACTIONS[s];
  const frac = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const mixed = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/); // «1 1/2»
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * «600 g kjøttdeig» → { qty: 600, unit: 'g', name: 'kjøttdeig', raw }
 * Mengde og enhet er null når de ikke finnes — aldri gjettet.
 */
export function parseIngredientLine(raw) {
  let cleaned = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;

  // Kolon-format fra enkelte norske kilder: «Tørket oregano: 2 ts»,
  // «Squash: 0.5» → snu til «2 ts tørket oregano» før vanlig parsing.
  const colon = cleaned.match(/^([^:]{2,60}):\s*([\d½⅓⅔¼¾].*)$/);
  if (colon) cleaned = `${colon[2].trim()} ${colon[1].trim()}`;

  let rest = cleaned;
  let qty = null;
  let unit = null;

  // Mengde først: «600», «1,5», «1/2», «1 1/2», «½»
  const qtyMatch = rest.match(/^((?:\d+\s+\d+\s*\/\s*\d+)|(?:\d+\s*\/\s*\d+)|(?:\d+(?:[.,]\d+)?)|[½⅓⅔¼¾])\s*/);
  if (qtyMatch) {
    qty = parseQty(qtyMatch[1]);
    rest = rest.slice(qtyMatch[0].length);
  }

  // Så eventuelt enhet: «g», «dl», «cloves», «boks» …
  const unitMatch = rest.match(/^([a-zA-ZæøåÆØÅ.]+)\s+/);
  if (qty != null && unitMatch) {
    const candidate = unitMatch[1].replace(/\.$/, '').toLowerCase();
    if (UNITS[candidate]) {
      unit = UNITS[candidate];
      rest = rest.slice(unitMatch[0].length);
    }
  }

  const name = rest.replace(TRAILING_PREP, '').replace(/^of\s+/i, '').trim();
  if (!name) return null;
  return { qty, unit, name, raw: cleaned };
}

/** Oversett et ingrediensnavn EN → NO når vi har det i ordboka. */
export function translateName(name) {
  const key = String(name ?? '').toLowerCase().trim();
  if (EN_NO[key]) return EN_NO[key];
  // «fresh basil» → prøv uten kjente beskrivelser; behold strippet form
  // også uten ordbok-treff — den matcher varedatabasen bedre.
  const stripped = key.replace(/^(fresh|dried|frozen|large|small|medium|ripe)\s+/, '');
  if (EN_NO[stripped]) return EN_NO[stripped];
  if (stripped !== key) return stripped;
  return name;
}

/**
 * Hele løypa for én rå ingrediens-streng:
 * parse → oversett → koble mot varedatabasen.
 * matched=false betyr «trenger avklaring» — vi finner ikke på nye varer.
 */
export function normalizeExternalIngredient(raw, catalog, normRules) {
  const parsed = parseIngredientLine(raw);
  if (!parsed) return null;
  const translated = translateName(parsed.name);
  const { name, item } = resolveCatalogItem(translated, catalog, normRules);
  return {
    raw: parsed.raw,
    qty: parsed.qty,
    unit: parsed.unit,
    name: item ? item.name : name,
    catalog_item: item,
    matched: Boolean(item),
  };
}

/** Normaliser en hel oppskrifts ingrediensliste. */
export function normalizeExternalIngredients(rawList, catalog, normRules) {
  return (rawList ?? [])
    .map((raw) => normalizeExternalIngredient(raw, catalog, normRules))
    .filter(Boolean);
}
