#!/usr/bin/env node
/* Lager responsive nettbilder fra originalene PSI eier.

   1. Legg originalen (jpg/png, gjerne stor) i assets/source-images/<slug>/.
      Første fil i mappa (alfabetisk) blir kortbildet. Originalen rører vi ikke.
   2. node scripts/images.mjs         (krever sharp: npm i --no-save sharp)
   3. Sett image: '/images/psi/<slug>/card' på gruppa i src/data/psi.js.

   Ut: public/images/psi/<slug>/card-{480,960,1440}.{webp,jpg}, 16:9,
   beskåret mot midten («cover»). Vil du styre fokuspunktet, beskjær
   originalen først. */
import sharp from 'sharp';
import { readdirSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '../assets/source-images');
const OUT = resolve(here, '../public/images/psi');
const WIDTHS = [480, 960, 1440];
const RATIO = 16 / 9;

let made = 0;
for (const slug of readdirSync(SRC, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) {
  const files = readdirSync(join(SRC, slug)).filter((f) => /\.(jpe?g|png|webp|tiff?)$/i.test(f)).sort();
  if (files.length === 0) { console.log(`${slug}: ingen original ennå (assets/source-images/${slug}/)`); continue; }
  const input = join(SRC, slug, files[0]);
  const dir = join(OUT, slug);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  for (const w of WIDTHS) {
    const h = Math.round(w / RATIO);
    const base = sharp(input).rotate().resize(w, h, { fit: 'cover', position: 'attention' });
    await base.clone().webp({ quality: 78 }).toFile(join(dir, `card-${w}.webp`));
    await base.clone().jpeg({ quality: 80, mozjpeg: true }).toFile(join(dir, `card-${w}.jpg`));
    made += 2;
  }
  console.log(`${slug}: ${files[0]} → public/images/psi/${slug}/card-*.{webp,jpg}   sett image: '/images/psi/${slug}/card'`);
}
console.log(made ? `Skrev ${made} filer.` : 'Ingenting å gjøre.');
