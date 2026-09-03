// Kopierer delt logikk fra src/lib til Edge Functions.
//
// Edge Functions kjører i Deno og kan ikke importere fra src/, men logikken
// skal ikke finnes i to versjoner. Denne kopierer, og CI/deploy kan kjøre
// den med --check for å avdekke at kopien har kommet ut av takt.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = [
  // Tekstvasken alle de andre lener seg på. Den MÅ være med: catalog.js
  // og offers/webOffers.js importerer den, og uten kopien pekte begge
  // kopiene deres på en ./text.js som ikke finnes i _shared/ — og
  // web-offer-scan feilet allerede ved innlasting. Ingen test så det,
  // fordi ingen test leste de genererte filene.
  ['src/lib/text.js', 'supabase/functions/_shared/text.ts'],
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
  // Linjegjenoppbygging av PDF-tekst (receipt-ocr-funksjonen).
  ['src/lib/pdfLines.js', 'supabase/functions/_shared/pdfLines.ts'],
  // Prislæring fra kvitteringer (learn-prices-funksjonen).
  ['src/lib/priceLearning.js', 'supabase/functions/_shared/priceLearning.ts'],
];

// ./sources.js → ./recipeSources.ts osv., så Deno finner kopiene.
const IMPORT_REWRITES = [
  // _shared/ er flat, så både ./text.js (fra src/lib) og ../text.js (fra
  // src/lib/offers og src/lib/recipes) blir ./text.ts.
  ["./text.js", './text.ts'],
  ["../text.js", './text.ts'],
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
let brutt = false;

// Alt som VIL finnes i _shared/ når kjøringen er ferdig — så en kopi kan
// importere en annen kopi som ikke er skrevet ennå.
const finnes = new Set(FILES.map(([, dest]) => basename(dest)));
try { for (const f of readdirSync(join(root, 'supabase/functions/_shared'))) finnes.add(f); } catch { /* tom */ }

// Windows sjekker ut med CRLF når core.autocrlf er på — BÅDE kopien i
// _shared/ og kilden i src/. Første utgave vasket bare kopien, så `out`
// (bygget fra kilden) bar CRLF mens `current` var vasket til LF, og alle
// fjorten sa «ut av takt» rett etter at de var skrevet. En sjekk som
// alltid feiler blir slått av; derfor vaskes begge sider.
const norm = (t) => (t ?? '').replace(/\r\n/g, '\n');

for (const [src, dest] of FILES) {
  let body = readFileSync(join(root, src), 'utf-8');
  for (const [from, to] of IMPORT_REWRITES) body = body.replaceAll(`'${from}'`, `'${to}'`);
  const out = HEADER.replace('%s', src) + body;

  // Peker kopien på noe som ikke finnes i _shared/? Deno finner det ikke,
  // og funksjonen faller ved innlasting — ikke ved bruk, ved INNLASTING,
  // så alt i den funksjonen er dødt. Det er akkurat dette som skjedde med
  // ./text.js. Sjekkes her, der det oppstår, ikke i produksjon.
  for (const m of out.matchAll(/from\s+'(\.\.?\/[^']+)'/g)) {
    const mål = basename(m[1]);
    if (m[1].startsWith('../') || !finnes.has(mål)) {
      console.error(`  BRUTT IMPORT  ${dest} peker på '${m[1]}' som ikke finnes i _shared/ — legg kilden inn i FILES og importen i IMPORT_REWRITES`);
      brutt = true;
    }
  }

  const current = (() => {
    try { return readFileSync(join(root, dest), 'utf-8'); } catch { return null; }
  })();

  if (norm(current) === norm(out)) { console.log(`  uendret  ${dest}`); continue; }

  if (check) {
    console.error(`  UT AV TAKT  ${dest} — kjør: npm run sync:shared`);
    drift = true;
  } else {
    writeFileSync(join(root, dest), out, 'utf-8');
    console.log(`  skrevet  ${dest}`);
  }
}

if (brutt) {
  console.error('\nEn eller flere kopier har importer Deno ikke kan finne. Funksjonene som bruker dem starter ikke.');
  process.exit(1);
}
if (drift) process.exit(1);
