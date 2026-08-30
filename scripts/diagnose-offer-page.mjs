#!/usr/bin/env node
// Diagnose av én tilbudsside — hva inneholder den egentlig?
//
//   npm run offers:diagnose -- "https://kiwi.no/tilbud/"
//
// Kompakt rapport: har siden JSON-LD-produkter eller JSON-blober med
// priser, og hva klarer parseren å hente ut? Trygg å dele.

import { extractWebOffers } from '../src/lib/offers/webOffers.js';

// Tåler <vinkelklammer> og anførselstegn rundt adressen.
const url = String(process.argv[2] ?? '').replace(/^[<'"«‹\s]+|[>'"»›\s]+$/g, '');
if (!url || !/^https?:\/\//i.test(url)) {
  console.error('Bruk: npm run offers:diagnose -- "https://…tilbudsside…"');
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
console.log(`  application/json:    ${scripts.filter((a) => /application\/json/i.test(a) && !/ld\+json/i.test(a)).length}`);
console.log('Nøkkelord i HTML:');
for (const word of ['"price"', 'currentPrice', 'ordinaryPrice', '@type"?\\s*:\\s*"?Product', 'tilbud']) {
  const n = (html.match(new RegExp(word, 'gi')) ?? []).length;
  console.log(`  ${word}: ${n} treff`);
}

const rows = extractWebOffers(html);
console.log(`\nParseren fant ${rows.length} tilbud.`);
rows.slice(0, 8).forEach((r) => {
  console.log(`  ${r.product_name} — kr ${r.price}${r.original_price ? ` (før ${r.original_price})` : ''}`);
});
if (!rows.length) {
  console.log('  Ingen strukturerte priser funnet — siden lastes trolig med');
  console.log('  JavaScript etterpå, eller prisene ligger i egne API-kall.');
}
