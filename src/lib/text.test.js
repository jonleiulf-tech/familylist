import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { lower, trimmed, sameName } from './text.js';

describe('tekstvask som ikke kaster', () => {
  it('tåler alt som kan komme fra en database eller et API', () => {
    for (const v of [null, undefined, '', 0, 42, NaN, false, [], {}]) {
      expect(() => lower(v)).not.toThrow();
      expect(() => trimmed(v)).not.toThrow();
      expect(() => sameName(v, 'Melk')).not.toThrow();
    }
  });

  it('gjør navn sammenlignbare', () => {
    expect(lower('MELK')).toBe('melk');
    expect(trimmed('  Melk  ')).toBe('Melk');
    expect(sameName('Melk', ' melk ')).toBe(true);
    expect(sameName('Melk', 'Brød')).toBe(false);
  });

  it('to tomme navn er IKKE samme vare', () => {
    // Ellers ville to navnløse rader blitt slått sammen til én.
    expect(sameName(null, undefined)).toBe(false);
    expect(sameName('', '  ')).toBe(false);
  });
});

/**
 * Filene vaktposten skal lese. execFileSync uten skall — på Windows er
 * skallet cmd.exe, som ikke kjenner enkle fnutter, og da fikk git
 * 'src/**\/*.js' med fnuttene i og fant ingenting. Vaktposten leste null
 * filer, fant null brudd, og gikk grønn. Derfor kreves det også at den
 * faktisk fant noe.
 */
function kildefiler() {
  const files = execFileSync('git', ['ls-files', 'src/**/*.js', 'src/**/*.jsx'], { encoding: 'utf-8' })
    .trim().split('\n')
    .filter((f) => f && !f.includes('.test.'));
  expect(files.length, 'vaktposten fant ingen kildefiler — da vokter den ingenting').toBeGreaterThan(20);
  return files;
}

describe('ingen ubeskyttet .toLowerCase() på navn i appkoden', () => {
  /**
   * Dette er den regelen som faktisk betyr noe.
   *
   * `shop.items.map((i) => i.name.toLowerCase())` lå i en useMemo på
   * øverste nivå i App.jsx. Mangler ÉN rad navnet, kaster kallet — og
   * fordi det skjer i App selv, altså utenfor ErrorBoundary, blir hele
   * appen en hvit skjerm. Ikke en fane med feilmelding: ingenting.
   *
   * Apekatt-testen fant den to ganger på 2 000 tilfeldige trykk. Denne
   * testen sørger for at den ikke kommer tilbake neste gang noen skriver
   * en rask navnesammenligning.
   */
  it('all navnesammenligning går gjennom lower()/sameName()', () => {
    const files = kildefiler();

    // Feltlisten og metodelisten er BEGGE utvidet etter stresstesten.
    //
    // `.n` kom inn fordi egne lister lagrer elementene som {n, chk, qty} i
    // en jsonb-kolonne, og `i.n.toLowerCase()` i customLists.addItem tok
    // ned hele Lister-fanen da ett element manglet `n`. Regelen dekket
    // bare `.name` og fanget det ikke.
    //
    // `.trim()` kom inn fordi det kaster på nøyaktig samme måte som
    // .toLowerCase(). MealDetailsDialog gjorde `r.n.trim()` på
    // ingredienser fra en ekstern oppskrift, og Shop gjorde
    // `r.name.trim()` på rader en maskin hadde lest ut av et bilde.
    //
    // Noen av treffene var trygge — React-tilstand som alltid er en
    // streng. De er likevel skrevet om: trimmed(x) er aldri feil, og en
    // regel med unntak man må huske er ingen regel.
    const farlig = /\.(?:n|name|item_name|meal_name|product_name|store_name|display_name|match_name|scope|unit|category)\s*\.(?:toLowerCase|toUpperCase|trim)\(\)/;
    const treff = [];
    for (const file of files) {
      const lines = readFileSync(file, 'utf-8').split('\n');
      lines.forEach((line, i) => {
        const kode = line.trim();
        // Kommentarer som FORKLARER feilen skal ikke telles som feilen.
        if (kode.startsWith('//') || kode.startsWith('*') || kode.startsWith('/*')) return;
        if (farlig.test(line)) treff.push(`${file}:${i + 1}  ${kode.slice(0, 90)}`);
      });
    }
    expect(treff, `Bruk lower(x) eller sameName(a, b) i stedet:\n${treff.join('\n')}`).toEqual([]);
  });

  /**
   * `(x || '').toLowerCase()` er IKKE en vakt.
   *
   * Det ser ut som en. Det fanger null, undefined og tom streng — men
   * ikke en verdi som ikke er tekst, og da kaster .toLowerCase() akkurat
   * som før. Det var slik `mealMatchesScope` og `guessUnit` kastet, i kode
   * som allerede så forsiktig ut.
   *
   * `String(x || '')` er trygt, og flagges ikke. Men lower(x) og
   * trimmed(x) sier det kortere og likt over hele kodebasen.
   */
  it('ingen (x || \'\') uten String() rundt', () => {
    const files = kildefiler();

    const farlig = /(?<!String)\(\s*[\w.?[\]']+\s*\|\|\s*''\s*\)\s*\.(?:toLowerCase|toUpperCase|trim|split|replace|includes|startsWith|endsWith|slice|match|normalize|localeCompare)\(/;
    const treff = [];
    for (const file of files) {
      readFileSync(file, 'utf-8').split('\n').forEach((line, i) => {
        const kode = line.trim();
        if (kode.startsWith('//') || kode.startsWith('*') || kode.startsWith('/*')) return;
        if (farlig.test(line)) treff.push(`${file}:${i + 1}  ${kode.slice(0, 90)}`);
      });
    }
    expect(treff, `Bruk lower(x)/trimmed(x), eller String(x || '') hvis du trenger noe annet:\n${treff.join('\n')}`).toEqual([]);
  });
});
