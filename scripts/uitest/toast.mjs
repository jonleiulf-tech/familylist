import { chromium } from 'playwright';
import { installFakeSupabase, readEnvHost, authStorageKey, fakeSession, BROWSER_ARGS } from './fakeSupabase.mjs';
import { serveDist } from './serve.mjs';
const host = readEnvHost('.env');
const srv = await serveDist(process.cwd() + '/dist', 4181);
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: BROWSER_ARGS });
const c = await b.newContext({ viewport:{width:390,height:844}, locale:'nb-NO' });
const p = await c.newPage();
await installFakeSupabase(p, host);
await p.addInitScript(([k,s])=>localStorage.setItem(k,JSON.stringify(s)), [authStorageKey(host), fakeSession()]);
await p.goto(srv.base + '/app/', { waitUntil:'commit' });
await p.waitForSelector('nav button', { timeout: 20000 });
await p.waitForTimeout(600);

// Utløs en toast: hak av en vare i handlelisten
const nav = p.locator('nav button:has-text("Handel")');
for (let k=await nav.count()-1;k>=0;k--){const bx=await nav.nth(k).boundingBox().catch(()=>null); if(bx&&bx.height>8&&bx.y<844){await nav.nth(k).click().catch(()=>{});break;}}
await p.waitForTimeout(700);
const step = p.locator('button:has-text("+")').first();
if (await step.count()) { await step.click().catch(()=>{}); }
await p.waitForTimeout(600);

const info = await p.evaluate(() => {
  const navEl = document.querySelector('nav');
  const nb = navEl?.getBoundingClientRect();
  // Hva ligger øverst midt på den nederste navigasjonsknappen?
  const y = nb ? nb.top + nb.height/2 : 800;
  const el = document.elementFromPoint(195, y);
  const toast = [...document.querySelectorAll('*')].find(e => /toast/i.test(e.className||''));
  const tb = toast?.getBoundingClientRect();
  return {
    nav: nb ? `top=${Math.round(nb.top)} h=${Math.round(nb.height)} z=${getComputedStyle(navEl).zIndex}` : 'ingen nav',
    toppElement: el ? `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}` : 'ingenting',
    toast: tb ? `top=${Math.round(tb.top)} h=${Math.round(tb.height)} z=${getComputedStyle(toast).zIndex} className=${String(toast.className).split(' ')[0]}` : 'ingen toast',
    overlapp: (tb && nb) ? (tb.bottom > nb.top && tb.top < nb.bottom) : false,
  };
});
console.log(JSON.stringify(info, null, 1));
await b.close(); await srv.close();
