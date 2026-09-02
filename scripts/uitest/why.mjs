import { chromium } from 'playwright';
import { installFakeSupabase, readEnvHost, authStorageKey, fakeSession, BROWSER_ARGS } from './fakeSupabase.mjs';
const host = readEnvHost('.env');
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: BROWSER_ARGS });
const c = await b.newContext({ viewport:{width:390,height:844}, locale:'nb-NO' });
const p = await c.newPage();
await installFakeSupabase(p, host);
await p.addInitScript(([k,s])=>localStorage.setItem(k,JSON.stringify(s)), [authStorageKey(host), fakeSession()]);
const t0=Date.now();
await p.goto('http://localhost:4173/app/', { waitUntil:'domcontentloaded' });
console.log('domcontentloaded etter', Date.now()-t0, 'ms');
await p.waitForTimeout(2000);

// 1) Hvorfor feiler et nav-klikk?
try {
  await p.locator('nav button:has-text("Handel")').first().click({ timeout: 4000 });
  console.log('nav-klikk OK');
} catch (e) {
  console.log('\nNAV-KLIKK FEILET:\n' + e.message.split('\n').slice(0,14).join('\n'));
}

// 2) Hva ligger øverst midt på skjermen?
const top = await p.evaluate(() => {
  const el = document.elementFromPoint(195, 700);
  const path = [];
  let n = el;
  while (n && path.length < 5) {
    path.push(`${n.tagName.toLowerCase()}${n.className ? '.'+String(n.className).split(' ').slice(0,2).join('.') : ''}`);
    n = n.parentElement;
  }
  return path.join(' < ');
});
console.log('\nØverst ved (195,700):', top);

// 3) Finnes det et heldekkende element?
const overlays = await p.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (r.width >= window.innerWidth * 0.95 && r.height >= window.innerHeight * 0.95
        && cs.pointerEvents !== 'none' && cs.position !== 'static') {
      out.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0,3).join('.')} pos=${cs.position} z=${cs.zIndex} pe=${cs.pointerEvents} op=${cs.opacity}`);
    }
  }
  return out.slice(0, 8);
});
console.log('\nHELDEKKENDE ELEMENTER:'); overlays.forEach(o=>console.log('  '+o));

// 4) Pågående animasjoner (Playwright venter på at elementet står stille)
const anim = await p.evaluate(() => document.getAnimations().map(a => {
  const t = a.effect?.target;
  return `${t?.tagName?.toLowerCase?.() ?? '?'}.${String(t?.className ?? '').split(' ')[0]} ${a.animationName ?? ''} playState=${a.playState} iter=${a.effect?.getTiming?.().iterations}`;
}).slice(0, 10));
console.log('\nANIMASJONER:', anim.length ? '' : 'ingen'); anim.forEach(a=>console.log('  '+a));
await b.close();
