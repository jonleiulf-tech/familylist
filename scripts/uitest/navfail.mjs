// Hvorfor feiler fanebyttet? Bytter fane 60 ganger og fanger ÅRSAKEN.
import { chromium } from 'playwright';
import { installFakeSupabase, readEnvHost, authStorageKey, fakeSession, BROWSER_ARGS } from './fakeSupabase.mjs';
import { serveDist } from './serve.mjs';
const host = readEnvHost('.env');
const srv = await serveDist(process.cwd() + '/dist', 4182);
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: BROWSER_ARGS });
const c = await b.newContext({ viewport:{width:390,height:844}, locale:'nb-NO' });
const p = await c.newPage();
await installFakeSupabase(p, host);
await p.addInitScript(([k,s])=>localStorage.setItem(k,JSON.stringify(s)), [authStorageKey(host), fakeSession()]);
await p.goto(srv.base + '/app/', { waitUntil:'commit' });
await p.waitForSelector('nav button', { timeout: 20000 });
await p.waitForTimeout(800);

const TABS=['Hjem','Handel','Forslag','Middag','Tilbud','Lister'];
let fails=0, tries=0;
for (let i=0;i<60;i++){
  const t = TABS[i % TABS.length];
  const all = p.locator(`nav button:has-text("${t}")`);
  const n = await all.count();
  let hit=false, why=null;
  for (let k=0;k<n;k++){
    const el = all.nth(k);
    const box = await el.boundingBox().catch(()=>null);
    if (!box) { why = why ?? 'ingen boks'; continue; }
    const cx=box.x+box.width/2, cy=box.y+box.height/2;
    const info = await el.evaluate((e,[x,y])=>{
      const top=document.elementFromPoint(x,y);
      return { self: Boolean(top && (e===top||e.contains(top)||top.contains(e))),
               top: top ? `${top.tagName.toLowerCase()}.${String(top.className).split(' ')[0]}` : 'ingenting',
               disabled: e.disabled, aria: e.getAttribute('aria-current') };
    }, [cx,cy]).catch(()=>null);
    if (info?.self) { hit=true; await el.click({timeout:1500}).catch(()=>{hit=false;}); break; }
    why = why ?? `dekket av ${info?.top} (boks y=${Math.round(box.y)} h=${Math.round(box.height)})`;
  }
  tries++;
  if (!hit) {
    fails++;
    const dlg = await p.locator('[role="dialog"]').count();
    const active = await p.locator('nav button[aria-current="page"]').first().textContent().catch(()=>'?');
    console.log(`FEIL #${fails} mot «${t}»: ${why} | dialoger=${dlg} | aktiv fane=«${String(active).trim()}»`);
    if (fails===1) await p.screenshot({ path:'/tmp/navfail.png' });
  }
  await p.waitForTimeout(250);
}
console.log(`\n${fails} av ${tries} fanebytter feilet (${Math.round(100*fails/tries)} %)`);
await b.close(); await srv.close();
