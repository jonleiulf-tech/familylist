#!/usr/bin/env node
/* Lager favicon-settet (favicon-32/192, icon-512, apple-touch-icon) fra
   public/logo/psi-wordmark-white.png på svart sirkel, og krymper
   ordmerkene til 512 px. Kjør: node scripts/icons.mjs (krever sharp:
   npm i --no-save sharp) */
import sharp from 'sharp';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const pub = (p) => resolve(here, '../public', p);

const mark = await sharp(pub('logo/psi-wordmark-white.png')).resize(880, 880).toBuffer();
const circle = Buffer.from('<svg width="1024" height="1024"><circle cx="512" cy="512" r="512" fill="#0d0d0c"/></svg>');
const icon = await sharp(circle).composite([{ input: mark, left: 72, top: 72 }]).png().toBuffer();
for (const [n, s] of [['favicon-32.png', 32], ['favicon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  await sharp(icon).resize(s, s).png().toFile(pub(n));
}
console.log('Skrev favicon-settet');
