import { chromium } from 'playwright';
import { installFakeSupabase, readEnvHost, authStorageKey, fakeSession, BROWSER_ARGS } from './fakeSupabase.mjs';
import { serveDist } from './serve.mjs';
const host = readEnvHost('.env');
const srv = await serveDist(process.cwd() + '/dist', 4183);
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: BROWSER_ARGS });
const c = await b.newContext({ viewport:{width:390,height:844}, locale:'nb-NO' });
const p = await c.newPage();
await installFakeSupabase(p, host);
await p.addInitScript(([k,s])=>localStorage.setItem(k,JSON.stringify(s)), [authStorageKey(host), fakeSession()]);
await p.goto(srv.base + '/app/', { waitUntil:'commit' });
await p.waitForSelector('nav button', { timeout: 20000 });
await p.waitForTimeout(800);
// Gå til Handel (lang liste) og scroll ned
const nav = p.locator('nav button:has-text("Handel")').first();
await nav.click().catch(()=>{});
await p.waitForTimeout(700);

for (const y of [0, 200, 600]) {
  await p.evaluate((v)=>window.scrollTo(0,v), y);
  await p.waitForTimeout(350);
  const r = await p.evaluate(() => {
    const navEl = document.querySelector('nav');
    const cs = getComputedStyle(navEl);
    const box = navEl.getBoundingClientRect();
    const btn = navEl.querySelector('button');
    const br = btn.getBoundingClientRect();
    const top = document.elementFromPoint(br.x+br.width/2, br.y+br.height/2);
    return {
      scrollY: Math.round(window.scrollY),
      navPosisjon: cs.position, navZ: cs.zIndex,
      navY: Math.round(box.y),
      knappY: Math.round(br.y),
      oeverst: top ? `${top.tagName.toLowerCase()}.${String(top.className).split(' ')[0]}` : 'ingenting',
      erNav: Boolean(top && navEl.contains(top)),
    };
  });
  console.log(JSON.stringify(r));
}
await b.close(); await srv.close();
