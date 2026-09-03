// Jager den siste krasjen, med kildekart så stakken peker på ekte filer.
import { chromium } from 'playwright';
import { installFakeSupabase, readEnvHost, authStorageKey, fakeSession, BROWSER_ARGS } from './fakeSupabase.mjs';
import { serveDist } from './serve.mjs';
const host = readEnvHost('.env');
const srv = await serveDist(process.cwd() + '/dist', 4185);
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: BROWSER_ARGS });
const TABS=['Hjem','Handel','Forslag','Middag','Tilbud','Lister'];
let found=0;
for (let attempt=1; attempt<=40 && !found; attempt++){
  const c = await b.newContext({ viewport:{width:390,height:844}, locale:'nb-NO' });
  const p = await c.newPage();
  const trail=[];
  p.on('pageerror', e => {
    if (!/toLowerCase/.test(e.message)) return;
    found++;
    console.log(`\n=== KRASJ (forsøk ${attempt}) ===\n${e.message}`);
    console.log((e.stack??'').split('\n').slice(0,10).join('\n'));
    console.log('SPOR:', trail.slice(-14).join(' → '));
  });
  await installFakeSupabase(p, host);
  await p.addInitScript(([k,s])=>localStorage.setItem(k,JSON.stringify(s)), [authStorageKey(host), fakeSession()]);
  await p.goto(srv.base+'/app/', { waitUntil:'commit' });
  await p.waitForSelector('nav button', { timeout:20000 }).catch(()=>{});
  await p.waitForTimeout(500);
  for (const t of [...TABS].sort(()=>Math.random()-0.5)) {
    for (let e=0;e<3;e++){ if(!(await p.locator('[role="dialog"]').count().catch(()=>0))) break;
      await p.keyboard.press('Escape').catch(()=>{}); await p.waitForTimeout(150); }
    const nav = p.locator(`nav button:has-text("${t}")`);
    for (let k=0;k<await nav.count();k++){ const bx=await nav.nth(k).boundingBox().catch(()=>null);
      if(bx&&bx.height>8){ await nav.nth(k).click({timeout:1500}).catch(()=>{}); break; } }
    trail.push(`[${t}]`);
    await p.waitForTimeout(300);
    for (let i=0;i<7 && !found;i++){
      const btns=p.locator('button:visible'); const n=await btns.count().catch(()=>0); if(!n) break;
      const btn=btns.nth(Math.floor(Math.random()*n));
      const bx=await btn.boundingBox().catch(()=>null);
      if(!bx||bx.height<8||bx.y<0||bx.y>844) continue;
      const label=((await btn.textContent().catch(()=>''))||'').replace(/\s+/g,' ').trim().slice(0,24)||'(ikon)';
      if(/logg ut/i.test(label)) continue;
      trail.push(label);
      await btn.click({timeout:1200}).catch(()=>{});
      await p.waitForTimeout(180);
    }
    if (found) break;
  }
  await c.close();
}
await b.close(); await srv.close();
if (!found) console.log('Fant den ikke i 40 forsøk.');
