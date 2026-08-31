// Egne plukkelister: pakking, sport, verktøy, telling.
// Kobles bevisst IKKE mot varedatabasen — «sovepose» skal ikke bli til en
// dagligvare med snittpris. Elementene er ren tekst med avhukingsstatus.

/** Ett element: {n: navn, chk: avhuket, qty: antall}. */
export const listItem = (name, checked = false, qty = 1) => ({
  n: String(name).trim(),
  chk: Boolean(checked),
  qty: Number.isFinite(Number(qty)) && Number(qty) > 0 ? Number(qty) : 1,
});

/**
 * Deler innlimt tekst i elementer — én ting per linje.
 * Tåler punktlister og avkryssingsbokser fra andre apper.
 */
export function parseListText(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line
      .replace(/^\s*[-*•·]\s*/, '')          // punkttegn
      .replace(/^\s*\[[ xX]?\]\s*/, '')      // [ ] og [x]
      .replace(/^\s*\d+[.)]\s*/, '')         // «1.» og «1)»
      .trim())
    .filter(Boolean)
    .map((line) => {
      // «2 Sovepose», «2x Sovepose» og «Sovepose x2» gir antall.
      const lead = line.match(/^(\d+)\s*[x×]?\s+(.+)$/);
      if (lead) return listItem(lead[2], false, Number(lead[1]));
      const trail = line.match(/^(.+?)\s*[x×]\s*(\d+)$/i);
      if (trail) return listItem(trail[1], false, Number(trail[2]));
      return listItem(line);
    });
}

/** Legger til. Finnes tingen fra før, økes antallet i stedet for duplikat. */
export function addItem(items, name) {
  const clean = String(name || '').trim();
  if (!clean) return items;
  const idx = items.findIndex((i) => i.n.toLowerCase() === clean.toLowerCase());
  if (idx >= 0) {
    return items.map((i, x) => (x === idx ? { ...i, qty: (Number(i.qty) || 1) + 1 } : i));
  }
  return [...items, listItem(clean)];
}

/** −/+ på antall, som i handlelisten. Går aldri under 1 — fjern med ×. */
export function stepItem(items, index, delta) {
  return items.map((i, idx) => {
    if (idx !== index) return i;
    return { ...i, qty: Math.max(1, (Number(i.qty) || 1) + delta) };
  });
}

export function toggleItem(items, index) {
  return items.map((i, idx) => (idx === index ? { ...i, chk: !i.chk } : i));
}

export const removeItem = (items, index) => items.filter((_, idx) => idx !== index);

/** Deler i uplukket og plukket, i den rekkefølgen UI-et viser dem. */
export function splitItems(items) {
  return {
    open: items.filter((i) => !i.chk),
    picked: items.filter((i) => i.chk),
  };
}

/**
 * Kopierer en liste. Navnet får «(kopi)», og alt blir uplukket —
 * poenget med å kopiere en pakkeliste er å starte på nytt.
 */
export function copyList(list) {
  return {
    name: `${list.name} (kopi)`,
    type: list.type ?? null,
    shared: list.shared ?? true,
    items: (list.items ?? []).map((i) => listItem(i.n, false, i.qty)),
  };
}

/** Nullstiller avhukingene uten å lage en ny liste. */
export const resetChecks = (items) => items.map((i) => listItem(i.n, false, i.qty));

export const progressLabel = (items) => {
  const total = items.length;
  const done = items.filter((i) => i.chk).length;
  if (!total) return 'Tom';
  if (done === total) return 'Ferdig';
  return `${done} av ${total}`;
};
