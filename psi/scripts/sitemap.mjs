#!/usr/bin/env node
/* Lager public/sitemap.xml fra rutene og idrettene i src/data/psi.js.
   Kjøres automatisk før build (se package.json). */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { site, activeSports } from '../src/data/psi.js';

const here = dirname(fileURLToPath(import.meta.url));
const paths = ['/', '/idretter', ...activeSports.map((s) => `/idretter/${s.slug}`), '/treningstider', '/bli-med', '/om', '/kontakt', '/partnere'];
const lastmod = site.lastUpdated;

const url = (p) => {
  const nb = site.domain + p;
  const en = site.domain + (p === '/' ? '/en' : `/en${p}`);
  return `  <url>
    <loc>${nb}</loc>
    <lastmod>${lastmod}</lastmod>
    <xhtml:link rel="alternate" hreflang="nb" href="${nb}"/>
    <xhtml:link rel="alternate" hreflang="en" href="${en}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${nb}"/>
  </url>
  <url>
    <loc>${en}</loc>
    <lastmod>${lastmod}</lastmod>
    <xhtml:link rel="alternate" hreflang="nb" href="${nb}"/>
    <xhtml:link rel="alternate" hreflang="en" href="${en}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${nb}"/>
  </url>`;
};

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${paths.map(url).join('\n')}
</urlset>
`;
const out = resolve(here, '../public/sitemap.xml');
writeFileSync(out, xml);
console.log(`Skrev ${out} (${paths.length * 2} adresser)`);
