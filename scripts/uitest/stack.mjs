import { chromium } from 'playwright';
import { installFakeSupabase, readEnvHost, authStorageKey, fakeSession, BROWSER_ARGS } from './fakeSupabase.mjs';
const host = readEnvHost('.env');
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: BROWSER_ARGS });
const c = await b.newContext({ viewport:{width:390,height:844}, locale:'nb-NO' });
const p = await c.newPage();
p.on('pageerror', e => { console.log('\n=== KRASJ ===\n' + e.message + '\n' + (e.stack ?? '').split('\n').slice(0,12).join('\n')); });
await installFakeSupabase(p, host);
await p.addInitScript(([k,s])=>localStorage.setItem(k,JSON.stringify(s)), [authStorageKey(host), fakeSession()]);
await p.goto('http://localhost:4173/app/', { waitUntil:'commit' });
await p.waitForSelector('nav button', { timeout: 20000 });
await p.waitForTimeout(600);
// Gå til Tilbud via den SISTE nav-raden
const nav = p.locator('nav button:has-text("Tilbud")');
const n = await nav.count();
for (let k=n-1;k>=0;k--) {
  const box = await nav.nth(k).boundingBox().catch(()=>null);
  if (box && box.height>8 && box.y<844) { await nav.nth(k).click({timeout:2000}).catch(()=>{}); break; }
}
await p.waitForTimeout(1500);
const txt = ((await p.textContent('main').catch(()=>''))||'').replace(/\s+/g,' ').trim();
console.log('\nTILBUD-FANEN:', txt.slice(0,300));
// Trykk på alt som ser ut som en tilbudsknapp
for (const label of ['Hvor kommer tilbudet fra?','Sjekk og legg til varene','Se alle tilbud','Hva kan jeg lage nå?']) {
  const btn = p.locator(`button:has-text("${label}")`).first();
  if (await btn.count()) {
    console.log(`\n-> trykker «${label}»`);
    await btn.click({timeout:2000}).catch(e=>console.log('   klikk feilet'));
    await p.waitForTimeout(1200);
    const after = ((await p.textContent('main').catch(()=>''))||'').replace(/\s+/g,' ').trim();
    console.log('   etter:', after.slice(0,200));
  }
}
await b.close();
