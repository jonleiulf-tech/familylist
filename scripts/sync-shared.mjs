// Kopierer delt logikk fra src/lib til Edge Functions.
//
// Edge Functions kjører i Deno og kan ikke importere fra src/, men logikken
// skal ikke finnes i to versjoner. Denne kopierer, og CI/deploy kan kjøre
// den med --check for å avdekke at kopien har kommet ut av takt.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = [
  ['src/lib/tjek.js', 'supabase/functions/_shared/tjek.ts'],
  ['src/lib/foodConcepts.js', 'supabase/functions/_shared/foodConcepts.ts'],
  ['src/lib/priceDrop.js', 'supabase/functions/_shared/priceDrop.ts'],
  ['src/lib/kassalRank.js', 'supabase/functions/_shared/kassalRank.ts'],
  // Oppskriftshøsting (harvest-recipes-funksjonen). Relative importer
  // skrives om fra .js til .ts under kopieringen.
  ['src/lib/recipes/sources.js', 'supabase/functions/_shared/recipeSources.ts'],
  ['src/lib/recipes/servings.js', 'supabase/functions/_shared/recipeServings.ts'],
  ['src/lib/recipes/jsonld.js', 'supabase/functions/_shared/recipeJsonld.ts'],
  ['src/lib/recipes/provider.js', 'supabase/functions/_shared/recipeProvider.ts'],
  // Tilbudshøsting fra butikkenes nettsider (web-offer-scan-funksjonen).
  ['src/lib/offers/webSources.js', 'supabase/functions/_shared/offerWebSources.ts'],
  ['src/lib/offers/webOffers.js', 'supabase/functions/_shared/offerWebOffers.ts'],
  ['src/lib/catalog.js', 'supabase/functions/_shared/catalogMatch.ts'],
];

// ./sources.js → ./recipeSources.ts osv., så Deno finner kopiene.
const IMPORT_REWRITES = [
  ["./sources.js", './recipeSources.ts'],
  ["./servings.js", './recipeServings.ts'],
  ["./jsonld.js", './recipeJsonld.ts'],
  ["./foodConcepts.js", './foodConcepts.ts'],
];

const HEADER = `// AUTOGENERERT — ikke rediger.
// Kilde: %s. Kjør \`npm run sync:shared\` etter endringer der.
// Testene ligger sammen med kilden.

`;

const check = process.argv.includes('--check');
let drift = false;

for (const [src, dest] of FILES) {
  let body = readFileSync(join(root, src), 'utf-8');
  for (const [from, to] of IMPORT_REWRITES) body = body.replaceAll(`'${from}'`, `'${to}'`);
  const out = HEADER.replace('%s', src) + body;
  const current = (() => {
    try { return readFileSync(join(root, dest), 'utf-8'); } catch { return null; }
  })();

  if (current === out) { console.log(`  uendret  ${dest}`); continue; }

  if (check) {
    console.error(`  UT AV TAKT  ${dest} — kjør: npm run sync:shared`);
    drift = true;
  } else {
    writeFileSync(join(root, dest), out, 'utf-8');
    console.log(`  skrevet  ${dest}`);
  }
}

if (drift) process.exit(1);
