#!/usr/bin/env node
/* Lager public/og-image.png (1200x630) og public/apple-touch-icon.png
   fra HTML med Chromium via Playwright. Kjør: npm run og:image
   Krever at playwright er installert (npx playwright install chromium). */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { organization, activeSports } from '../src/data/psi.js';

const here = dirname(fileURLToPath(import.meta.url));
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright').catch(() => null);
if (!pw) { console.error('Installer playwright: npm i -D playwright && npx playwright install chromium'); process.exit(1); }

const html = `<!doctype html><html><head><meta charset="utf-8">
<style>
body{margin:0;width:1200px;height:630px;background:radial-gradient(900px 500px at 85% -20%, rgba(255,106,26,.28), transparent 60%),#0d0d0c;color:#f4efe6;font-family:'Barlow Condensed','Arial Narrow',Impact,Arial,sans-serif;display:flex;flex-direction:column;justify-content:center;padding:0 88px;box-sizing:border-box}
.eyebrow{font-size:28px;letter-spacing:.14em;text-transform:uppercase;color:#ff6a1a;font-weight:700}
.mark{font-size:260px;line-height:.85;font-weight:800;color:#ff6a1a;letter-spacing:-.02em;margin-top:12px}
.name{font-size:54px;text-transform:uppercase;font-weight:800;line-height:1;margin-top:8px}
.values{font-size:34px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;margin-top:22px;color:#b9b3a6}
.sports{position:absolute;right:88px;bottom:72px;font-size:30px;color:#b9b3a6;text-transform:uppercase;letter-spacing:.06em}
.url{position:absolute;left:88px;bottom:72px;font-size:30px;color:#f4efe6;letter-spacing:.04em}
</style></head><body>
<div class="eyebrow">USN Campus Porsgrunn</div>
<div class="mark">${organization.shortName}</div>
<div class="name">${organization.name}</div>
<div class="values">${organization.values.nb}</div>
<div class="url">psiusn.no</div>
<div class="sports">${activeSports.map((s) => s.shortName.nb).join(' · ')}</div>
</body></html>`;

const icon = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;width:180px;height:180px;background:#0d0d0c;display:grid;place-items:center;font-family:'Barlow Condensed','Arial Narrow',Impact,Arial,sans-serif}
div{color:#ff6a1a;font-weight:800;font-size:92px;letter-spacing:.02em}
</style></head><body><div>PSI</div></body></html>`;

const dir = mkdtempSync(join(tmpdir(), 'psi-og-'));
const ogPath = join(dir, 'og.html'); writeFileSync(ogPath, html);
const iconPath = join(dir, 'icon.html'); writeFileSync(iconPath, icon);

const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto('file://' + ogPath);
await page.screenshot({ path: resolve(here, '../public/og-image.png') });
await page.setViewportSize({ width: 180, height: 180 });
await page.goto('file://' + iconPath);
await page.screenshot({ path: resolve(here, '../public/apple-touch-icon.png') });
await browser.close();
console.log('Skrev public/og-image.png og public/apple-touch-icon.png');
