import { chromium } from 'playwright';
import { installFakeSupabase, readEnvHost, authStorageKey, fakeSession, BROWSER_ARGS } from './fakeSupabase.mjs';
import { serveDist } from './serve.mjs';
const host = readEnvHost('.env');
const srv = await serveDist(process.cwd()+'/dist', 4186);
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: BROWSER_ARGS });
const c = await b.newContext({ viewport:{width:390,height:844}, locale:'nb-NO' });
const p = await c.newPage();
await installFakeSupabase(p, host);
await p.addInitScript(([k,s])=>localStorage.setItem(k,JSON.stringify(s)), [authStorageKey(host), fakeSession()]);
await p.goto(srv.base+'/app/', { waitUntil:'commit' });
await p.waitForSelector('nav button', { timeout:20000 });
await p.waitForTimeout(700);

// Åpne «Meld feil eller ønske»
const btn = p.locator('button[aria-label*="Meld"], button:has-text("Meld feil")').first();
if (!(await btn.count())) {
  const all = p.locator('button:visible'); const n = await all.count();
  for (let i=0;i<n;i++){ const t=(await all.nth(i).getAttribute('aria-label'))||''; if(/meld|tilbakemeld|ønske/i.test(t)){ await all.nth(i).click(); break; } }
} else await btn.click();
await p.waitForTimeout(600);
const åpen = await p.locator('[role="dialog"]').count();
const navn = await p.locator('[role="dialog"]').first().getAttribute('aria-label').catch(()=>null);
console.log(`dialog åpen: ${åpen} (${navn})`);

// 1) Escape uten fokus i et felt
await p.keyboard.press('Escape'); await p.waitForTimeout(400);
console.log('etter Escape:', await p.locator('[role="dialog"]').count());

// 2) Åpne igjen, skriv i feltet, så Escape
if (!(await p.locator('[role="dialog"]').count())) {
  const all = p.locator('button:visible'); const n = await all.count();
  for (let i=0;i<n;i++){ const t=(await all.nth(i).getAttribute('aria-label'))||''; if(/meld|tilbakemeld|ønske/i.test(t)){ await all.nth(i).click(); break; } }
  await p.waitForTimeout(500);
  const felt = p.locator('[role="dialog"] textarea, [role="dialog"] input').first();
  if (await felt.count()) { await felt.click(); await felt.type('test'); }
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  console.log('etter Escape med fokus i felt:', await p.locator('[role="dialog"]').count());
}
await b.close(); await srv.close();
