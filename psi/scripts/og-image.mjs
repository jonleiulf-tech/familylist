#!/usr/bin/env node
/* Lager public/og-image.png (1200x630) fra HTML med Chromium via Playwright.
   Favicon-settet lages av scripts/icons.mjs. Kjør: npm run og:image
   Krever at playwright er installert (npx playwright install chromium). */
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { organization, activeSports } from '../src/data/psi.js';

const here = dirname(fileURLToPath(import.meta.url));
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright').catch(() => null);
if (!pw) { console.error('Installer playwright: npm i -D playwright && npx playwright install chromium'); process.exit(1); }

const logo = 'data:image/png;base64,' + readFileSync(resolve(here, '../public/logo/psi-wordmark-white.png')).toString('base64');
const html = `<!doctype html><html><head><meta charset="utf-8">
<style>
body{margin:0;width:1200px;height:630px;background:radial-gradient(900px 500px at 85% -20%, rgba(255,106,26,.28), transparent 60%),#0d0d0c;color:#f4efe6;font-family:'Barlow Condensed','Arial Narrow',Impact,Arial,sans-serif;display:flex;flex-direction:column;justify-content:flex-start;padding:64px 88px 0;box-sizing:border-box}
.eyebrow{font-size:28px;letter-spacing:.14em;text-transform:uppercase;color:#ff6a1a;font-weight:700}
.mark{font-size:200px;line-height:.85;font-weight:800;color:#ff6a1a;letter-spacing:-.02em;margin-top:12px}
.text{max-width:660px}
.name{font-size:46px;text-transform:uppercase;font-weight:800;line-height:1;margin-top:8px}
.values{white-space:nowrap;font-size:28px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;margin-top:22px;color:#b9b3a6}
.sports{position:absolute;left:300px;bottom:56px;font-size:28px;color:#b9b3a6;text-transform:uppercase;letter-spacing:.06em}
.url{position:absolute;left:88px;bottom:56px;font-size:28px;color:#f4efe6;letter-spacing:.04em}
.logo{position:absolute;right:88px;top:95px;width:380px;height:380px}
</style></head><body>
<img class="logo" src="${logo}" alt="">
<div class="text">
<div class="eyebrow">USN Campus Porsgrunn</div>
<div class="mark">${organization.shortName}</div>
<div class="name">${organization.name}</div>
<div class="values">${organization.values.nb}</div>
</div>
<div class="url">psiusn.no</div>
<div class="sports">${activeSports.map((s) => s.shortName.nb).join(' · ')}</div>
</body></html>`;


const dir = mkdtempSync(join(tmpdir(), 'psi-og-'));
const ogPath = join(dir, 'og.html'); writeFileSync(ogPath, html);

const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto('file://' + ogPath);
await page.screenshot({ path: resolve(here, '../public/og-image.png') });
await browser.close();
console.log('Skrev public/og-image.png');
