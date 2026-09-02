import { chromium } from 'playwright';
import { installFakeSupabase, readEnvHost, authStorageKey, fakeSession, BROWSER_ARGS } from './fakeSupabase.mjs';
const host = readEnvHost('.env');
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: BROWSER_ARGS });
const c = await b.newContext({ viewport:{width:390,height:844}, locale:'nb-NO' });
const p = await c.newPage();
// Hva blokkerer lastingen i 12 sekunder?
const slow = [];
p.on('requestfinished', async r => {
  const t = r.timing();
  if (t.responseEnd > 1000) slow.push(`${(t.responseEnd/1000).toFixed(1)}s ${r.url().slice(0,90)}`);
});
await installFakeSupabase(p, host);
await p.addInitScript(([k,s])=>localStorage.setItem(k,JSON.stringify(s)), [authStorageKey(host), fakeSession()]);
await p.goto('http://localhost:4173/app/', { waitUntil:'domcontentloaded' });
await p.waitForTimeout(2500);
console.log('TREGE FORESPØRSLER:'); slow.slice(0,8).forEach(s=>console.log('  '+s));

// Prøv 8 tilfeldige knapper og skriv HVA som feiler
const btns = p.locator('button:visible');
const n = await btns.count();
console.log(`\n${n} synlige knapper. Prøver 8:`);
for (let i=0;i<8;i++){
  const idx = Math.floor(Math.random()*n);
  const btn = btns.nth(idx);
  const label = ((await btn.textContent().catch(()=>''))||'').replace(/\s+/g,' ').trim().slice(0,28) || '(uten tekst)';
  const t=Date.now();
  try {
    await btn.click({ timeout: 2500 });
    console.log(`  OK  (${Date.now()-t}ms) «${label}»`);
  } catch (e) {
    const first = e.message.split('\n').filter(l=>/intercept|not stable|not visible|disabled|outside|detached|hidden/i.test(l))[0]
      ?? e.message.split('\n')[0];
    console.log(`  FEIL (${Date.now()-t}ms) «${label}» -> ${first.trim().slice(0,130)}`);
  }
  await p.waitForTimeout(150);
  const d = p.locator('[role="dialog"]');
  if (await d.count()) { await p.keyboard.press('Escape'); await p.waitForTimeout(200); }
}
await b.close();
