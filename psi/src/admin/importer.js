/* Bygger radene som «Kopier innholdet fra datafila hit» skriver til
   databasen.

   Skilt ut fra grensesnittet så den kan testes. Fallgruva den løser:
   idrettene i src/data/psi.js har ingen sort_order, mens kolonnen i
   databasen krever en verdi. Rekkefølgen i fila er den vi vil ha på
   siden, så den blir til 10, 20, 30 og så videre. Da er det også plass
   til å skyte inn en gruppe mellom to andre senere. */

export const CONTENT_NØKLER = ['site', 'organization', 'stats', 'partners'];

export function byggSportsRader(sports = []) {
  return sports.map((sport, i) => {
    const { slug, active, sort_order, ...data } = sport;
    return {
      slug,
      active: active !== false,
      sort_order: Number.isFinite(sort_order) ? sort_order : (i + 1) * 10,
      data,
    };
  });
}

export function byggContentRader(fil = {}) {
  return CONTENT_NØKLER
    .filter((key) => fil[key] != null)
    .map((key) => ({ key, value: fil[key] }));
}
