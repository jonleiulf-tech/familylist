// Oppskriftstitler fra ulike kilder skrevet i samme stil.
//
// Noen matblogger skriver titlene i VERSALER. I en liste der alt annet er
// satt med vanlig setningsskrift roper de, og de er tyngre å lese — store
// bokstaver mangler ordbildet øyet kjenner igjen.
//
// Vi rører BARE titler som er skrevet i versaler. En tittel med vanlig
// blanding av store og små bokstaver er bevisst skrevet slik av kilden,
// og skal stå som den er.

/** Merkenavn og forkortelser som skal beholde versalene sine. */
const KEEP_UPPER = new Set([
  'TINE', 'BBQ', 'OK', 'DIY', 'USA', 'NRK', 'IKEA', 'ICA', 'NYC',
]);

/** Hvor stor andel av bokstavene som må være store før vi kaller det roping. */
const SHOUT_RATIO = 0.7;

const isShouting = (s) => {
  const letters = s.replace(/[^a-zæøåéA-ZÆØÅÉ]/g, '');
  if (letters.length < 5) return false;          // «BBQ» er ikke roping
  const upper = letters.replace(/[^A-ZÆØÅÉ]/g, '').length;
  return upper / letters.length >= SHOUT_RATIO;
};

/**
 * «OSTEKAKE MED RØKT LAKS, RØDLØK, DILL OG SITRON»
 *   → «Ostekake med røkt laks, rødløk, dill og sitron»
 *
 * Setningsskrift, ikke tittelskrift: norsk bruker liten forbokstav i ord
 * som ikke er egennavn, i motsetning til engelsk. Første bokstav i hver
 * setning løftes, og merkenavn beholder versalene.
 */
export function tidyTitle(raw) {
  const s = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (!s || !isShouting(s)) return s;

  const lowered = s
    .split(' ')
    .map((w) => {
      const bare = w.replace(/[^A-ZÆØÅÉa-zæøåé]/g, '');
      return KEEP_UPPER.has(bare.toUpperCase()) && bare.length >= 2 && KEEP_UPPER.has(bare)
        ? w
        : w.toLocaleLowerCase('nb-NO');
    })
    .join(' ');

  // Stor forbokstav først, og etter punktum, spørsmålstegn og utropstegn.
  return lowered.replace(/(^|[.!?]\s+)([a-zæøåé])/g,
    (_, sep, ch) => sep + ch.toLocaleUpperCase('nb-NO'));
}
