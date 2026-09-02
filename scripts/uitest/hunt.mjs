// Jager krasjen på Tilbud: klikker tilfeldig til den fyrer, og skriver
// hele stakken med ekte filnavn (dev-serveren er ikke minifisert).
import { chromium } from 'playwright';
import { installFakeSupabase, readEnvHost, authStorageKey, fakeSession, BROWSER_ARGS } from './fakeSupabase.mjs';
const host = readEnvHost('.env');
const TAB = process.argv[2] ?? 'Tilbud';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: BROWSER_ARGS });
let found = false;
for (let attempt = 1; attempt <= 12 && !found; attempt += 1) {
  const c = await b.newContext({ viewport:{width:390,height:844}, locale:'nb-NO' });
  const p = await c.newPage();
  const trail = [];
  p.on('pageerror', e => {
    found = true;
    console.log(`\n=== KRASJ (forsøk ${attempt}) ===`);
    console.log('MELDING:', e.message);
    console.log('STAKK:\n' + (e.stack ?? '(ingen)').split('\n').slice(0,14).join('\n'));
    console.log('KLIKKESPOR:', trail.join(' → '));
  });
  await installFakeSupabase(p, host);
  await p.addInitScript(([k,s])=>localStorage.setItem(k,JSON.stringify(s)), [authStorageKey(host), fakeSession()]);
  await p.goto('http://localhost:5173/app/', { waitUntil:'commit' });
  await p.waitForSelector('nav button', { timeout: 25000 }).catch(()=>{});
  await p.waitForTimeout(700);
  const nav = p.locator(`nav button:has-text("${TAB}")`);
  const nn = await nav.count();
  for (let k=nn-1;k>=0;k--){ const box=await nav.nth(k).boundingBox().catch(()=>null);
    if (box && box.height>8 && box.y<844){ await nav.nth(k).click({timeout:2000}).catch(()=>{}); break; } }
  await p.waitForTimeout(900);
  for (let i=0;i<14 && !found;i++){
    const btns = p.locator('button:visible');
    const n = await btns.count().catch(()=>0);
    if (!n) break;
    const btn = btns.nth(Math.floor(Math.random()*n));
    const box = await btn.boundingBox().catch(()=>null);
    if (!box || box.height<8 || box.y<0 || box.y>844) continue;
    const label = ((await btn.textContent().catch(()=>''))||'').replace(/\s+/g,' ').trim().slice(0,26) || '(ikon)';
    if (/logg ut/i.test(label)) continue;
    trail.push(label);
    await btn.click({timeout:1500}).catch(()=>{});
    await p.waitForTimeout(300);
  }
  await c.close();
}
await b.close();
if (!found) console.log('Fant ikke krasjen i 12 forsøk.');
