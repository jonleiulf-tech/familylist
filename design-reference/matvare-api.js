// matvare-api.js — Matvaretabellen (Mattilsynet). Åpne data, CORS-vennlig.
// Kilde skal oppgis: «Matvaretabellen (Mattilsynet)». Årlig oppdatering → trygt å mellomlagre.
const URL_FOODS = 'https://www.matvaretabellen.no/api/nb/foods.json';
let cache = null, loading = null;

async function load() {
  if (cache) return cache;
  if (!loading) loading = fetch(URL_FOODS).then(r => r.json()).then(j => { cache = j.foods || j; return cache; });
  return loading;
}

function nutrient(f, ids) {
  for (const id of ids) {
    const c = (f.constituents || []).find(x => x.nutrientId === id && typeof x.quantity === 'number');
    if (c) return c.quantity;
  }
  return null;
}

// Finn beste treff på norsk varenavn. Returnerer null hvis ikke funnet.
export async function lookupFood(name) {
  const q = (name || '').trim().toLowerCase();
  if (q.length < 3) return null;
  let foods;
  try { foods = await load(); } catch (_) { return null; }
  const scored = [];
  for (const f of foods) {
    const fn = f.foodName.toLowerCase();
    let s = 0;
    if (fn === q) s = 100;
    else if (fn.startsWith(q + ',') || fn.startsWith(q + ' ')) s = 80;
    else if (fn.startsWith(q)) s = 70;
    else if (fn.includes(q)) s = 40;
    else if ((f.searchKeywords || []).some(k => k.toLowerCase() === q)) s = 60;
    if (s) { if (/rå|frisk/.test(fn)) s += 5; scored.push([s, f]); }
  }
  if (!scored.length) return null;
  scored.sort((a, b) => b[0] - a[0]);
  const f = scored[0][1];
  return {
    name: f.foodName,
    kcal: f.calories && f.calories.quantity != null ? Math.round(f.calories.quantity) : null,
    protein: nutrient(f, ['Protein']),
    fat: nutrient(f, ['Fett']),
    carbs: nutrient(f, ['Karbo']),
    fiber: nutrient(f, ['Fiber']),
    salt: nutrient(f, ['NaCl', 'Na']),
    url: f.uri || ('https://www.matvaretabellen.no/' + (f.foodId || ''))
  };
}
