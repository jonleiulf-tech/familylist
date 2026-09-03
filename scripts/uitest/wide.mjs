import { chromium } from 'playwright';
import { installFakeSupabase, readEnvHost, authStorageKey, fakeSession, BROWSER_ARGS } from './fakeSupabase.mjs';
import { serveDist } from './serve.mjs';
const host = readEnvHost('.env');
const srv = await serveDist(process.cwd() + '/dist', 4184);
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: BROWSER_ARGS });
for (const [w,h,navn] of [[390,844,'telefon'],[768,1024,'nettbrett'],[1280,900,'maskin']]) {
  const c = await b.newContext({ viewport:{width:w,height:h}, locale:'nb-NO' });
  const p = await c.newPage();
  await installFakeSupabase(p, host);
  await p.addInitScript(([k,s])=>localStorage.setItem(k,JSON.stringify(s)), [authStorageKey(host), fakeSession()]);
  await p.goto(srv.base+'/app/', { waitUntil:'commit' });
  await p.waitForSelector('nav button', { timeout: 20000 }).catch(()=>{});
  await p.waitForTimeout(700);
  const r = await p.evaluate(() => {
    const navs=[...document.querySelectorAll('nav')].map(n=>{
      const cs=getComputedStyle(n), bx=n.getBoundingClientRect();
      return `${cs.display}/${cs.position} y=${Math.round(bx.y)} h=${Math.round(bx.height)}`;
    });
    const side=document.querySelector('.app-sidebar');
    const main=document.querySelector('.app-main');
    const mb=main?.getBoundingClientRect();
    // Dekker navigasjonen innholdet nederst?
    const lastBtn=[...document.querySelectorAll('.app-main button')].pop();
    const lb=lastBtn?.getBoundingClientRect();
    let dekket=false;
    if (lb) { const top=document.elementFromPoint(lb.x+lb.width/2, lb.y+lb.height/2);
      dekket = Boolean(top && top.closest && top.closest('nav')); }
    return { navs, sidebar: side ? getComputedStyle(side).display : 'ingen',
             mainBunn: mb ? Math.round(mb.bottom) : null, sisteKnappDekket: dekket };
  });
  console.log(navn.padEnd(10), JSON.stringify(r));
  await c.close();
}
await b.close(); await srv.close();
