// Observerte butikkruter — startpunktet for hylle-rekkefølgen i en butikk.
//
// Appen lærer ruta av avhukingen din, men den må lære fra NOE. Standard-
// rekkefølgen (frukt og grønt først, hus og hjem sist) er en gjennomsnitts-
// butikk, og de to butikkene Jon handler i går nesten motsatt vei av
// hverandre. Rutene her er OBSERVERT: butikken gått med mobilen og
// skiltene fotografert i rekkefølge 2. september 2026.
//
// VIKTIG, og grunnen til at dette er en «prior» og ikke en fasit:
//  - Ruta gjelder ÉN butikk. Ingen rute gjenbrukes for en annen kjede.
//  - Avhukingen fortsetter å lære. Hver fullførte tur veier 25 % mot 75 %
//    historikk, så etter fire-fem turer er observasjonen fortynnet til
//    under 30 % — omtrent «manuell tur = 5 observasjoner».
//  - Midlertidige kampanjeutstillinger læres ALDRI som faste plasser. Det
//    sto et stort tacobord rett innenfor døra på Coop Extra; den
//    permanente tex-mex-hylla ligger midt i butikken, og det er den som
//    er kartlagt.
//
// Butikkens egne soner er finere enn appens tretten kategorier: BAKING og
// PASTA/MOS er to sider av samme gang, men begge er «Tørrvarer» hos oss,
// og MENYs «FRI FOR» (melkefritt, glutenfritt) har vi ingen egen kategori
// for ennå. Sonene er derfor slått sammen i den rekkefølgen man går forbi
// dem, og en kategori får posisjonen til FØRSTE sone den hører til.

const OBSERVED = {
  // ---------------------------------------------------------------------
  // Coop Extra (Dr. Munks gate, Hovenga)
  //
  // Inn i drikke, hele non-food- og tørrvaresiden, og først helt til slutt
  // brød, frukt og grønt, meieri, kjøtt, pålegg og frys.
  // ---------------------------------------------------------------------
  'Coop Extra': {
    observedAt: '2026-09-02',
    where: 'Dr. Munks gate',
    zones: [
      'Drikke',            // rett fram fra inngangen, stort DRIKKE-skilt
      'Hus og hjem',       // tekstil, vask, papir, bleier
      'Snacks',            // snacks/bleier-gangen
      'Tørrvarer',         // baking, pasta/mos, hermetikk, tex-mex
      'Krydder og saus',   // olje/krydder, sauser/supper, kaffe
      'Ost og pålegg',     // frokost og syltetøy
      'Brød og korn',      // egen brødavdeling
      'Frukt og grønt',    // stor ferskavdeling rett etter brød
      'Meieri',            // ferskvare → meieri
      'Kjøtt',
      'Fisk',
      'Frysevarer',        // fryseøyer til slutt
      'Annet',
    ],
  },

  // ---------------------------------------------------------------------
  // MENY Hovenga
  //
  // Nesten motsatt av Coop Extra: frukt og grønt, fersk bakst og
  // fisketorget FØRST, og drikke helt til slutt. Derfor må ruta være
  // butikkens egen — å gjenbruke Coop-rekkefølgen her ville sendt deg
  // gjennom butikken baklengs.
  // ---------------------------------------------------------------------
  Meny: {
    observedAt: '2026-09-02',
    where: 'Hovenga',
    zones: [
      'Frukt og grønt',    // grønnsakstorget først
      'Brød og korn',      // NYSTEKT BAKERVARER, senere knekkebrød/pølsebrød
      'Fisk',              // FISK & SKALLDYR / fisketorget
      // Kjøtt er ANTATT her, ved ferskvaredisken — det sto ikke noe
      // kjøttskilt i bildeserien. Avhukingen retter det opp.
      'Kjøtt',
      'Hus og hjem',       // baby/bleier, fri for, renhold, dyremat,
                           // kjøkken, borddekking, helse, hygiene
      'Tørrvarer',         // pasta, hermetikk, ris, sauser, baking, taco
      'Snacks',            // godteri + snacks/potetgull/nøtter
      'Krydder og saus',   // ketchup/sennep, olje, dressing, krydder
      'Ost og pålegg',     // OST og SMØR — egen kjølevegg
      'Meieri',            // yoghurt → fløte/melk
      'Frysevarer',        // stor frysavdeling: pizza, ferdigretter, bær
      'Drikke',            // DRIKKE/ØL helt til slutt
      'Annet',
    ],
  },
};

// Butikken kan hete litt forskjellig i butikklisten og i kvitteringen.
// Nøkkelen er kjeden slik appen viser den; her kobles skrivemåtene på.
const ALIASES = {
  'meny hovenga': 'Meny',
  'meny.no': 'Meny',
  'coop extra dr. munk': 'Coop Extra',
  'coop extra dr munk': 'Coop Extra',
  'coop extra hovenga': 'Coop Extra',
  extra: 'Coop Extra',
};

function resolve(store) {
  const raw = String(store ?? '').trim();
  if (!raw) return null;
  if (OBSERVED[raw]) return raw;
  const key = raw.toLowerCase();
  const direct = Object.keys(OBSERVED).find((k) => k.toLowerCase() === key);
  if (direct) return direct;
  return ALIASES[key] ?? null;
}

/**
 * Observert rute for en butikk, som { kategori: posisjon 0..1 }.
 * @returns {Record<string, number>|null} null når butikken ikke er kartlagt.
 */
export function observedRoute(store) {
  const name = resolve(store);
  const zones = name ? OBSERVED[name].zones : null;
  if (!zones || zones.length < 2) return null;
  const out = {};
  zones.forEach((category, i) => {
    // Første sone en kategori hører til vinner: «Tørrvarer» dekker både
    // pasta og baking, og man går forbi pasta først.
    if (out[category] == null) {
      out[category] = Number((i / (zones.length - 1)).toFixed(4));
    }
  });
  return out;
}

/** Når og hvor ruta ble kartlagt — til å si det ærlig i appen. */
export function routeInfo(store) {
  const name = resolve(store);
  if (!name) return null;
  const { observedAt, where } = OBSERVED[name];
  return { store: name, observedAt, where };
}

/** Butikkene som har en observert rute. */
export function routedStores() {
  return Object.keys(OBSERVED);
}
