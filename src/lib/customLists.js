// Egne lister: pakking, sport, verktøy.
// Kobles bevisst IKKE mot varedatabasen — «sovepose» skal ikke bli til en
// dagligvare med snittpris. Elementene er ren tekst med avhukingsstatus.

/** Ett element: {n: navn, chk: avhuket}. */
export const listItem = (name, checked = false) => ({ n: String(name).trim(), chk: Boolean(checked) });

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
    .map((n) => listItem(n));
}

/** Legger til uten duplikater (skiller ikke på store/små bokstaver). */
export function addItem(items, name) {
  const clean = String(name || '').trim();
  if (!clean) return items;
  if (items.some((i) => i.n.toLowerCase() === clean.toLowerCase())) return items;
  return [...items, listItem(clean)];
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
    items: (list.items ?? []).map((i) => listItem(i.n, false)),
  };
}

/** Nullstiller avhukingene uten å lage en ny liste. */
export const resetChecks = (items) => items.map((i) => listItem(i.n, false));

export const progressLabel = (items) => {
  const total = items.length;
  const done = items.filter((i) => i.chk).length;
  if (!total) return 'Tom';
  if (done === total) return 'Ferdig';
  return `${done} av ${total}`;
};
