// Finner knappen som tømmer skjermen: fersk side per knapp, ett klikk.
import { chromium } from 'playwright';
import { installFakeSupabase, readEnvHost, authStorageKey, fakeSession, BROWSER_ARGS } from './fakeSupabase.mjs';
const host = readEnvHost('.env');
const TAB = process.argv[2] ?? 'Handel';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: BROWSER_ARGS });

// Først: hvilke knapper finnes på fanen?
const open = async () => {
  const c = await b.newContext({ viewport:{width:390,height:844}, locale:'nb-NO' });
  const p = await c.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type()==='error') errs.push('console: '+m.text()); });
  await installFakeSupabase(p, host);
  await p.addInitScript(([k,s])=>localStorage.setItem(k,JSON.stringify(s)), [authStorageKey(host), fakeSession()]);
  await p.goto('http://localhost:4173/app/', { waitUntil:'domcontentloaded', timeout:30000 });
  await p.waitForTimeout(1500);
  const nav = p.locator(`nav button:has-text("${TAB}")`).first();
  await nav.click({timeout:5000}).catch(()=>{});
  await p.waitForTimeout(600);
  return { c, p, errs };
};

const { c: c0, p: p0 } = await open();
const labels = [];
const btns = p0.locator('button:visible');
const n = await btns.count();
for (let i=0;i<n;i++){
  const t = ((await btns.nth(i).textContent().catch(()=>''))||'').replace(/\s+/g,' ').trim();
  const a = await btns.nth(i).getAttribute('aria-label').catch(()=>null);
  labels.push(t || a || `(nr ${i})`);
}
console.log(`${TAB}: ${n} knapper\n`);
await c0.close();

for (let i=0;i<n;i++){
  const { c, p, errs } = await open();
  const btn = p.locator('button:visible').nth(i);
  await btn.click({timeout:3000}).catch(()=>{});
  await p.waitForTimeout(700);
  const after = await p.locator('button:visible').count().catch(()=>-1);
  const bodyLen = ((await p.textContent('body').catch(()=>''))||'').trim().length;
  const flag = after === 0 ? '  <<< TØMMER SKJERMEN' : after < 5 ? '  <<< nesten tom' : '';
  if (flag || errs.length) {
    console.log(`[${i}] «${labels[i]}» -> ${after} knapper, ${bodyLen} tegn${flag}`);
    for (const e of errs.slice(0,3)) console.log(`      ${e.slice(0,220)}`);
  }
  await c.close();
}
await b.close();
console.log('\nferdig');
