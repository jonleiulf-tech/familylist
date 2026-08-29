// Vasking av ingredienslister fra oppskriftsredigering.
// Familieoppskriften lagres som meals.ingredients og gjenbrukes alle steder
// middagen refereres — derfor skal det som lagres alltid være rent.

/**
 * Normaliserer rader fra redigeringsdialogen: trimmer navn, dropper tomme,
 * tvinger antall til positivt tall (standard 1), og slår sammen duplikater
 * ved å summere antall.
 */
export function normalizeIngredients(rows) {
  const byName = new Map();
  for (const row of rows ?? []) {
    const name = String(row?.n ?? '').trim();
    if (!name) continue;
    const qty = Number(String(row?.qty ?? '').toString().replace(',', '.'));
    const clean = Number.isFinite(qty) && qty > 0 ? qty : 1;
    const key = name.toLowerCase();
    if (byName.has(key)) {
      const existing = byName.get(key);
      existing.qty = Number((existing.qty + clean).toFixed(2));
    } else {
      byName.set(key, { n: name, qty: clean });
    }
  }
  return [...byName.values()];
}
