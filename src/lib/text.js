/**
 * Tekstvask som ikke kaster.
 *
 * Bakgrunnen er en hvit skjerm. App.jsx bygget et oppslag over
 * handlelisten med `shop.items.map((i) => i.name.toLowerCase())` i en
 * useMemo på øverste nivå. Mangler ÉN rad navnet, kaster kallet — og
 * fordi det skjer i App selv, altså utenfor ErrorBoundary, forsvinner
 * hele appen. Ikke en fane, ikke en dialog: alt, uten feilmelding.
 *
 * En navnløs rad er ikke hypotetisk. Databasen krever `name not null`,
 * men appen tegner OPTIMISTISK — raden legges inn lokalt før serveren har
 * sagt ja — og den mellomlagrede listen i localStorage kan være skrevet
 * av en eldre versjon av appen med andre felt.
 *
 * Derfor: all sammenligning av navn går gjennom disse. De koster
 * ingenting, og de fjerner en hel klasse hvite skjermer.
 */

/** Små bokstaver, uansett hva som kommer inn. */
export const lower = (v) => String(v ?? '').toLowerCase();

/** Klippet for mellomrom, uansett hva som kommer inn. */
export const trimmed = (v) => String(v ?? '').trim();

/** Sant når to navn er samme vare. Tåler null, tall og mellomrom. */
export const sameName = (a, b) => {
  const x = lower(a).trim();
  const y = lower(b).trim();
  return x !== '' && x === y;
};
