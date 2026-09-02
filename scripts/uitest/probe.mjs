import { chromium } from 'playwright';
import { installFakeSupabase, readEnvHost, authStorageKey, fakeSession } from './fakeSupabase.mjs';
const host = readEnvHost('/home/user/familylist/.env');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const c = await b.newContext({ viewport:{width:390,height:844}, locale:'nb-NO' });
const p = await c.newPage();
p.on('requestfailed', r => console.log('  MISLYKKET:', r.url().slice(0,120), r.failure()?.errorText));
p.on('response', r => { if (r.status()===404) console.log('  404:', r.url().slice(0,120)); });
const { calls } = await installFakeSupabase(p, host);
await p.addInitScript(([k, sess]) => { localStorage.setItem(k, JSON.stringify(sess)); },
  [authStorageKey(host), fakeSession()]);
await p.goto('http://localhost:4173/app/', { waitUntil:'domcontentloaded' });
await p.waitForTimeout(2500);
const txt = (await p.textContent('body')).replace(/\s+/g,' ').trim();
console.log('\n--- SYNLIG TEKST (450 tegn) ---\n', txt.slice(0,450));
console.log('\n--- NAV-KNAPPER ---', await p.locator('nav button').allTextContents());
console.log('\n--- SUPABASE-KALL ---', calls.slice(0,12).join('\n  '));
await p.screenshot({ path:'/tmp/app.png' });
await b.close();
