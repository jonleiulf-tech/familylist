import { chromium } from 'playwright';
import { installFakeSupabase, readEnvHost, authStorageKey, fakeSession, BROWSER_ARGS } from './fakeSupabase.mjs';
const host = readEnvHost('.env');
const t0 = Date.now();
const el = (l) => console.log(`  ${((Date.now()-t0)/1000).toFixed(1)}s  ${l}`);
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: BROWSER_ARGS });
el('nettleser startet');
const c = await b.newContext({ viewport:{width:390,height:844}, locale:'nb-NO' });
const p = await c.newPage();
await installFakeSupabase(p, host);
await p.addInitScript(([k,s])=>localStorage.setItem(k,JSON.stringify(s)), [authStorageKey(host), fakeSession()]);
el('rutene på');
await p.goto('http://localhost:4173/app/', { waitUntil:'domcontentloaded', timeout:30000 });
el('lastet');
await p.waitForTimeout(1200);
for (const t of ['Hjem','Handel','Forslag','Middag','Tilbud','Lister']) {
  const nav = p.locator(`nav button:has-text("${t}")`).first();
  await nav.click({timeout:5000}).catch(()=>el(`  ${t}: nav-klikk feilet`));
  await p.waitForTimeout(350);
  el(`fane ${t}`);
  const btns = p.locator('button:visible');
  const n = await btns.count();
  el(`  ${n} synlige knapper`);
  for (let i=0;i<3;i++){
    const btn = btns.nth(Math.floor(Math.random()*n));
    const label = ((await btn.textContent().catch(()=>''))||'').replace(/\s+/g,' ').trim().slice(0,30);
    const s=Date.now();
    await btn.click({timeout:3000}).catch(()=>{});
    await p.waitForTimeout(200);
    const dt=Date.now()-s;
    if (dt>1500) el(`  TREGT (${dt}ms): «${label}»`);
    const d = p.locator('[role="dialog"]').first();
    if (await d.count()) {
      const close = d.locator('button[aria-label="Lukk"], button:has-text("Avbryt")').first();
      if (await close.count()) await close.click({timeout:3000}).catch(()=>{});
      else await p.keyboard.press('Escape');
      await p.waitForTimeout(200);
    }
  }
  el(`  ferdig med ${t}`);
}
el('RUNDE FERDIG');
await b.close();
