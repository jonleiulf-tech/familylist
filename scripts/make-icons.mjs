// Genererer PNG-ikoner fra merket i public/favicon.svg.
// Kjør på nytt hvis merket endres: node scripts/make-icons.mjs
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'public/favicon.svg'));

const targets = [
  ['public/icon-192.png', 192],
  ['public/icon-512.png', 512],
  ['public/apple-touch-icon.png', 180],
  ['public/favicon-32.png', 32],
];

for (const [file, size] of targets) {
  await sharp(svg, { density: 512 }).resize(size, size).png().toFile(join(root, file));
  console.log(`  ${file} (${size}px)`);
}
