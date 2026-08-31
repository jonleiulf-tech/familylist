#!/usr/bin/env node
/**
 * Henter offisielle næringstall fra Matvaretabellen (Mattilsynet) og
 * oppdaterer kcal/protein i src/lib/foodConcepts.js.
 *
 * Hvorfor et skript og ikke et API-kall i drift: tabellen publiseres ÉN gang
 * i året. Å slå opp i den ved hver sidevisning ville vært å belaste
 * Mattilsynet for data som ikke endrer seg — og appen ville sluttet å virke
 * offline. Derfor bakes tallene inn i koden, og dette skriptet kjøres når
 * en ny årgang kommer.
 *
 *   node scripts/import-matvaretabellen.mjs            # vis hva som endres
 *   node scripts/import-matvaretabellen.mjs --write    # skriv til fila
 *
 * Matvaretabellen er åpne offentlige data. Kildehenvisning skal stå i
 * appen der tallene vises — se KILDE-teksten nederst.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONCEPTS_FILE = join(HERE, '..', 'src', 'lib', 'foodConcepts.js');

// Matvaretabellen serverer hele datasettet som statisk JSON.
const SOURCE = 'https://www.matvaretabellen.no/api/nb/foods.json';

/**
 * Søkeord per konsept — hvilken rad i tabellen konseptet skal hente tall
 * fra. Holdes her og ikke i foodConcepts.js, slik at appen ikke drar med
 * seg importlogikk den aldri bruker.
 *
 * Verdien er en liste med ord som ALLE må finnes i matvarenavnet. Første
 * treff vinner, så mest spesifikke søk først.
 */
const LOOKUP = {
  kjottdeig: ['kjøttdeig', 'storfe'],
  kylling: ['kylling', 'bryst', 'rå'],
  kalkun: ['kalkun', 'rå'],
  svinekjott: ['svin', 'kotelett'],
  storfe: ['storfe', 'ytrefilet'],
  lam: ['lam', 'rå'],
  bacon: ['bacon'],
  polse: ['grillpølse'],
  skinke: ['skinke', 'kokt'],
  laks: ['laks', 'oppdrett', 'rå'],
  torsk: ['torsk', 'rå'],
  sei: ['sei', 'rå'],
  orret: ['ørret', 'rå'],
  reker: ['reker'],
  makrell: ['makrell', 'tomat'],
  tunfisk: ['tunfisk'],
  tofu: ['tofu'],
  kikerter: ['kikerter'],
  linser: ['linser'],
  egg: ['egg', 'hønseegg'],
  melk: ['melk', 'lettmelk'],
  flote: ['fløte', 'kremfløte'],
  romme: ['rømme'],
  ost: ['ost', 'norvegia'],
  fetaost: ['fetaost'],
  smor: ['smør'],
  yoghurt: ['yoghurt', 'naturell'],
  potet: ['potet', 'rå'],
  ris: ['ris', 'polert', 'rå'],
  pasta: ['pasta', 'tørr'],
  brod: ['brød', 'grovt'],
  lok: ['løk', 'rå'],
  gulrot: ['gulrot', 'rå'],
  paprika: ['paprika', 'rå'],
  tomat: ['tomat', 'rå'],
  agurk: ['agurk', 'rå'],
  brokkoli: ['brokkoli', 'rå'],
  blomkal: ['blomkål', 'rå'],
  sopp: ['sjampinjong'],
  mais: ['mais'],
  erter: ['erter'],
  spinat: ['spinat'],
  eple: ['eple'],
  banan: ['banan'],
  avokado: ['avokado'],
  olje: ['olivenolje'],
  sukker: ['sukker'],
  mel: ['hvetemel'],
};

const nutrient = (food, ids) => {
  for (const n of food.constituents ?? food.nutrients ?? []) {
    const id = String(n.nutrientId ?? n.id ?? '').toLowerCase();
    if (ids.includes(id)) return Number(n.quantity ?? n.value);
  }
  return null;
};

async function main() {
  const write = process.argv.includes('--write');

  process.stdout.write(`Henter ${SOURCE} …\n`);
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`Matvaretabellen svarte ${res.status}`);
  const data = await res.json();
  const foods = data.foods ?? data;
  process.stdout.write(`${foods.length} matvarer lastet.\n\n`);

  let src = await readFile(CONCEPTS_FILE, 'utf8');
  const changes = [];
  const misses = [];

  for (const [id, terms] of Object.entries(LOOKUP)) {
    const hit = foods.find((f) => {
      const name = String(f.foodName ?? f.name ?? '').toLowerCase();
      return terms.every((t) => name.includes(t));
    });
    if (!hit) { misses.push(`${id} (søkte: ${terms.join(' + ')})`); continue; }

    const kcal = nutrient(hit, ['energy', 'kcal', 'energi']);
    const protein = nutrient(hit, ['protein']);
    if (!(kcal > 0)) { misses.push(`${id} — fant «${hit.foodName}», men ingen energiverdi`); continue; }

    // Bytt ut tallene på konseptets linje, la resten stå urørt.
    const line = new RegExp(`(\\{ id: '${id}',[^\\n]*?kcal: )([\\d.]+)(, protein: )([\\d.]+)`);
    const m = src.match(line);
    if (!m) { misses.push(`${id} — fant ikke linjen i foodConcepts.js`); continue; }

    const newKcal = Math.round(kcal);
    const newProtein = Math.round((protein ?? 0) * 10) / 10;
    if (Number(m[2]) !== newKcal || Number(m[4]) !== newProtein) {
      changes.push(`${id.padEnd(18)} ${m[2]}→${newKcal} kcal, ${m[4]}→${newProtein} g protein   [${hit.foodName}]`);
      src = src.replace(line, `$1${newKcal}$3${newProtein}`);
    }
  }

  if (changes.length) {
    process.stdout.write(`Endringer (${changes.length}):\n${changes.join('\n')}\n\n`);
  } else {
    process.stdout.write('Ingen endringer — tallene stemmer allerede.\n\n');
  }
  if (misses.length) {
    process.stdout.write(`Ikke funnet (${misses.length}) — disse beholder anslaget:\n  ${misses.join('\n  ')}\n\n`);
  }

  if (!write) {
    process.stdout.write('Tørrkjøring. Kjør med --write for å lagre.\n');
    return;
  }

  // Merk kilden i toppen av fila, så det aldri er tvil om hvor tallene kommer fra.
  const stamp = `// Næringstall sist hentet fra Matvaretabellen (Mattilsynet): ${new Date().toISOString().slice(0, 10)}\n`;
  src = src.replace(/^\/\/ Næringstall sist hentet.*\n/m, '');
  src = stamp + src;

  await writeFile(CONCEPTS_FILE, src);
  process.stdout.write(`Skrevet til ${CONCEPTS_FILE}\n`);
  process.stdout.write('HUSK: kildehenvisning til Matvaretabellen skal stå der tallene vises i appen.\n');
}

main().catch((e) => {
  process.stderr.write(`${e.message}\n`);
  process.exitCode = 1;
});
