#!/usr/bin/env node
// Diagnose av én oppskriftsside — hva inneholder den egentlig?
//
//   npm run recipes:diagnose -- "https://www.tine.no/oppskrifter/…"
//
// Skriver en kompakt rapport (ingen fulltekst) som viser om siden har
// JSON-LD, __NEXT_DATA__ eller andre datablokker, og hvor oppskrifts-
// dataene ser ut til å bo. Trygg å dele: bare struktur, nøkkelnavn og
// små utdrag.

import { extractJsonLd, findRecipeNodes, findEmbeddedRecipeNodes, parseRecipeFromHtml } from '../src/lib/recipes/jsonld.js';

const url = process.argv[2];
if (!url) {
  console.error('Bruk: npm run recipes:diagnose -- "<oppskrifts-URL>"');
  process.exit(1);
}

const res = await fetch(url, {
  headers: { 'user-agent': 'PlukkelistenBot/0.1 (+https://plukkelisten.no)' },
  redirect: 'follow',
});
const html = await res.text();

console.log(`URL:            ${url}`);
console.log(`HTTP-status:    ${res.status}`);
console.log(`Sidestørrelse:  ${(html.length / 1024).toFixed(0)} kB`);

const scripts = [...html.matchAll(/<script([^>]*)>/gi)].map((m) => m[1]);
console.log(`Script-tagger:  ${scripts.length}`);
console.log(`  application/ld+json: ${scripts.filter((a) => /ld\+json/i.test(a)).length}`);
console.log(`  __NEXT_DATA__:       ${/__NEXT_DATA__/.test(html) ? 'ja' : 'nei'}`);
console.log(`  application/json:    ${scripts.filter((a) => /application\/json/i.test(a) && !/ld\+json/i.test(a)).length}`);
console.log(`Nøkkelord i HTML:`);
for (const word of ['recipeIngredient', 'ingredients', 'ingredienser', 'recipeYield', 'porsjon']) {
  const n = (html.match(new RegExp(word, 'gi')) ?? []).length;
  console.log(`  ${word}: ${n} treff`);
}

const ld = extractJsonLd(html);
console.log(`JSON-LD-blokker parset: ${ld.length}`);
ld.forEach((doc, i) => {
  const types = JSON.stringify(doc['@type'] ?? (Array.isArray(doc) ? doc.map((d) => d?.['@type']) : doc['@graph']?.map((d) => d?.['@type'])));
  console.log(`  blokk ${i + 1}: @type = ${types?.slice(0, 120)}`);
});
console.log(`Recipe-noder i JSON-LD:    ${findRecipeNodes(ld).length}`);
console.log(`Recipe-noder i JSON-blob:  ${findEmbeddedRecipeNodes(html).length}`);

const parsed = parseRecipeFromHtml(html, { sourceUrl: url });
if (parsed) {
  console.log(`\nPARSET OK: «${parsed.name}» — ${parsed.raw_ingredients.length} ingredienser, `
    + `porsjoner=${parsed.servings?.base_servings ?? 'ukjent'}, tid=${parsed.total_time_minutes ?? '?'} min`);
} else {
  console.log('\nINGEN oppskrift parset. Utdrag rundt første ingrediens-nøkkelord:');
  const m = html.match(/[\s\S]{0,200}(recipeIngredient|ingredien)[\s\S]{0,400}/i);
  console.log(m ? m[0].replace(/\s+/g, ' ').slice(0, 600) : '  (fant ingen ingrediens-nøkkelord i det hele tatt — data lastes nok med JavaScript etterpå)');
}
