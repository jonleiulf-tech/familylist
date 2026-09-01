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

/**
 * Matord som på norsk skrives med liten forbokstav, selv om de kommer fra
 * et stedsnavn eller et personnavn.
 *
 * «Bolognese» er ikke lenger byen Bologna, like lite som «wienerbrød» er
 * Wien — ordet er blitt et vanlig substantiv. Engelsk gjør det motsatt
 * («Pasta Bolognese»), og den skrivemåten smitter lett over fra
 * oppskriftssider. Her rettes den, uansett om tittelen roper eller ikke.
 */
const LOWERCASE_DISHES = [
  'bolognese', 'carbonara', 'arrabbiata', 'puttanesca', 'pesto', 'lasagne',
  'risotto', 'gratäng', 'grateng', 'wienerbrød', 'wienerschnitzel',
  'béarnaise', 'bearnaise', 'hollandaise', 'vinaigrette', 'remulade',
  'tzatziki', 'hummus', 'guacamole', 'salsa', 'chorizo', 'mozzarella',
  'parmesan', 'cheddar', 'feta', 'ricotta', 'mascarpone', 'halloumi',
  'baguette', 'ciabatta', 'focaccia', 'bruschetta', 'panna cotta',
  'tiramisu', 'creme brulee', 'crème brûlée', 'quiche', 'ratatouille',
  'bourguignon', 'stroganoff', 'wellington', 'caesar', 'waldorf',
  'chili con carne', 'taco', 'burrito', 'fajita', 'enchilada', 'quesadilla',
  'sushi', 'sashimi', 'teriyaki', 'tempura', 'ramen', 'wok', 'curry',
  'kebab', 'falafel', 'couscous', 'bulgur', 'quinoa', 'polenta', 'gnocchi',
  'ravioli', 'tagliatelle', 'spaghetti', 'penne', 'fusilli', 'linguine',
  'espresso', 'cappuccino', 'latte', 'americano',
];

/**
 * Retter matord som har fått engelsk stor forbokstav. Ordet må stå som et
 * eget ord — «Bolognese» rettes, «Bolognaskinke» røres ikke.
 */
function lowercaseDishWords(text) {
  let out = text;
  for (const word of LOWERCASE_DISHES) {
    const capitalised = word.charAt(0).toLocaleUpperCase('nb-NO') + word.slice(1);
    // Ikke rett ordet når det står FØRST — der er stor forbokstav riktig.
    out = out.replace(
      new RegExp(`(?<=[\\p{L}\\p{N}][^\\p{L}\\p{N}]{1,3})${capitalised}\\b`, 'gu'),
      word,
    );
  }
  return out;
}

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
  const s = lowercaseDishWords(String(raw ?? '').trim().replace(/\s+/g, ' '));
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
