// Oppslag mot varekatalogen: normalisering, søk og kobling av fritekst
// («2 liter melk», middagsingredienser, importlinjer) mot en katalogvare.
// Portert fra prototypens normName() / resolveDb() / mkItem().

/** Enheter som steppes i PAKKER, ikke i enkeltenheter. */
const PACK_UNITS = new Set(['g', 'kg', 'ml', 'liter', 'l', 'dl']);
export const isPackUnit = (unit) => PACK_UNITS.has(String(unit || '').toLowerCase());

/** Gjett enhet ut fra varenavn og kategori. */
export function guessUnit(name, category) {
  const n = (name || '').toLowerCase();
  if (/melk|juice|brus|saft|vann|fløte|drikke/.test(n)) return 'liter';
  if (/kjøttdeig|laks|ost|kjøtt|filet|deig|farse/.test(n)) return 'g';
  if (category === 'Frukt og grønt') return 'stk';
  return 'stk';
}

export function normalizeName(raw, normRules) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const hit = normRules.get(s.toLowerCase());
  if (hit) return hit;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Koble et fritekstnavn mot varekatalogen.
 * Håndterer alternativer («kokosmelk/gryr fløte» -> den som finnes)
 * og fuzzy-treff («curry paste» -> «Rød currypaste»).
 * Returnerer { name, item } der item er null hvis ingen god nok match.
 */
export function resolveCatalogItem(raw, catalog, normRules) {
  const candidates = String(raw || '').split('/').map((s) => s.trim()).filter(Boolean);
  let best = null;
  let bestScore = -1;

  for (const c of candidates) {
    const q = normalizeName(c, normRules).toLowerCase();
    if (!q) continue;
    for (const d of catalog) {
      const dn = d.name.toLowerCase();
      let s = 0;
      if (dn === q) s = 100;
      else if (dn.startsWith(q) || q.startsWith(dn)) s = 70;
      else if (dn.includes(q) || q.includes(dn)) s = 50;
      else {
        const qw = q.split(/\s+/);
        const dw = dn.split(/\s+/);
        const hitW = qw.filter((w) => w.length > 3 && dw.some((x) => x.startsWith(w) || w.startsWith(x))).length;
        if (hitW && hitW >= Math.min(qw.length, dw.length)) s = 45;
        else if (hitW) s = 25;
      }
      if (!s) continue;
      s += Math.min(10, (d.score || 0) / 3);          // hyppig kjøpt vinner
      if (d.avg_price) s += 5;                         // har pris -> bedre kobling
      s -= Math.abs(dn.length - q.length) / 10;        // straff store lengdeavvik
      if (s > bestScore) { bestScore = s; best = d; }
    }
  }

  if (best && bestScore >= 40) return { name: best.name, item: best };
  return { name: normalizeName(candidates[0] || raw, normRules), item: null };
}

/**
 * Autofullfør: prefiks-treff først, deretter delstrengtreff,
 * begge rangert på kjøpsfrekvens-score.
 */
export function searchCatalog(query, catalog, limit = 8) {
  const q = (query || '').trim().toLowerCase();
  if (q.length < 1) return [];
  const prefix = [];
  const contains = [];
  for (const d of catalog) {
    const dn = d.name.toLowerCase();
    if (dn.startsWith(q)) prefix.push(d);
    else if (dn.includes(q)) contains.push(d);
  }
  const byScore = (a, b) => (b.score || 0) - (a.score || 0) || a.name.localeCompare(b.name, 'nb');
  return [...prefix.sort(byScore), ...contains.sort(byScore)].slice(0, limit);
}

/** «to melk og brød og en agurk» -> [{qty, name}] — Web Speech API (no-NO). */
const SPOKEN_NUMBERS = {
  en: 1, ei: 1, ett: 1, én: 1, to: 2, tre: 3, fire: 4, fem: 5,
  seks: 6, sju: 7, syv: 7, åtte: 8, ni: 9, ti: 10,
};

export function parseSpeech(text) {
  const parts = String(text || '')
    .toLowerCase()
    .replace(/[.,!?]/g, '')
    .split(/\s+og\s+|\s*,\s*/)
    .map((p) => p.trim())
    .filter(Boolean);

  return parts.map((part) => {
    const words = part.split(/\s+/);
    let qty = 1;
    let rest = words;
    const first = words[0];
    if (SPOKEN_NUMBERS[first]) { qty = SPOKEN_NUMBERS[first]; rest = words.slice(1); }
    else if (/^\d+$/.test(first)) { qty = Number(first); rest = words.slice(1); }
    // «2 liter melk» — hopp over enheten hvis den kom rett etter tallet
    if (rest.length > 1 && /^(liter|kg|gram|g|stk|pakke|pakker|boks|bokser)$/.test(rest[0])) {
      rest = rest.slice(1);
    }
    return { qty, name: rest.join(' ').trim() };
  }).filter((r) => r.name);
}
