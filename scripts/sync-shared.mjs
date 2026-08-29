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
];

const HEADER = `// AUTOGENERERT — ikke rediger.
// Kilde: %s. Kjør \`npm run sync:shared\` etter endringer der.
// Testene ligger sammen med kilden.

`;

const check = process.argv.includes('--check');
let drift = false;

for (const [src, dest] of FILES) {
  const body = readFileSync(join(root, src), 'utf-8');
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
