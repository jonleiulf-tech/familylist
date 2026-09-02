// Observerte butikkruter — startpunktet for hylle-rekkefølgen i en butikk.
//
// Appen lærer ruta av avhukingen din, men den må lære fra NOE. Standard-
// rekkefølgen (frukt og grønt først, hus og hjem sist) er en gjennomsnitts-
// butikk, og traff dårlig i Coop Extra på Hovenga: der går man inn i
// drikke, gjennom vask, papir, bleier og hele tørrvareseksjonen, og først
// helt til slutt kommer brød, frukt og grønt, meieri, kjøtt, pålegg og frys.
//
// Rutene her er OBSERVERT, ikke gjettet: Jon gikk butikken med mobilen og
// fotograferte skiltene i rekkefølge 2. september 2026.
//
// VIKTIG, og grunnen til at dette er en «prior» og ikke en fasit:
//  - Ruta er ett utgangspunkt per BUTIKK. Ingen rute gjenbrukes for en
//    annen kjede — Coop Extra, MENY, REMA og KIWI har hver sin.
//  - Avhukingen fortsetter å lære. Etter noen turer er det din egen
//    oppførsel som styrer, ikke denne listen (se usePickOrder: hver tur
//    veier 25 % mot 75 % historikk, så etter ~4-5 turer er observasjonen
//    fortynnet til under 30 %).
//  - Midlertidige kampanjeutstillinger læres ALDRI som faste plasser. Det
//    sto et stort tacobord rett innenfor døra; den permanente tex-mex-hylla
//    ligger midt i butikken, og det er den som er kartlagt her.
//
// Butikkens egne soner er finere enn appens tretten kategorier (BAKING og
// PASTA/MOS er to sider av samme gang, men begge er «Tørrvarer» hos oss).
// Derfor er sonene slått sammen i den rekkefølgen man går forbi dem:
// posisjonen er 0..1 der 0 er først i butikken.

/** Sonene slik de ble observert, i gangrekkefølge. */
const OBSERVED = {
  'Coop Extra': [
    // Inngang → drikke rett fram
    'Drikke',
    // Tekstil, vask, papir, snacks, bleier — hele non-food-siden først
    'Hus og hjem',
    'Snacks',
    // Baking, pasta/mos, hermetikk, tex-mex, olje, krydder, sauser, kaffe
    'Tørrvarer',
    'Krydder og saus',
    // «Mat uten» (melkefri, glutenfri) ligger her, sammen med snacks nr. 2.
    // Havredrikk og Gryr står altså LANGT fra meieriet i denne butikken.
    // Appen har ingen egen kategori for det ennå; de varene ligger under
    // Meieri, og der må avhukingen få rette det opp selv.
    // Dyremat, lys, servietter, personlig pleie, godteri
    // Frokost og syltetøy
    'Ost og pålegg',
    // Brød og bakervarer
    'Brød og korn',
    // Fersk frukt og grønt
    'Frukt og grønt',
    // Ferskvare → meieri → kjøtt → pålegg → frys
    'Meieri',
    'Kjøtt',
    'Fisk',
    'Frysevarer',
    'Annet',
  ],
};

/**
 * Observert rute for en butikk, som { kategori: posisjon 0..1 }.
 * @returns {Record<string, number>|null} null når butikken ikke er kartlagt.
 */
export function observedRoute(store) {
  const zones = OBSERVED[String(store ?? '').trim()];
  if (!zones || zones.length < 2) return null;
  const out = {};
  zones.forEach((category, i) => {
    out[category] = Number((i / (zones.length - 1)).toFixed(4));
  });
  return out;
}

/** Butikkene som har en observert rute. */
export function routedStores() {
  return Object.keys(OBSERVED);
}
