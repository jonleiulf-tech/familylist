// Den myke sperren: stopper den det den skal, og bare det?
//
// Bakgrunn: sperren satt bare på addItem/addMany, altså på veien som
// lager en NY rad i handlelista. Men søkeraden på Handel slår sammen med
// en rad som fins fra før — finner den «Kaffe» på lista, øker den
// antallet med updateItem i stedet, og den veien var ikke sperret.
//
// Utenfra var det samme handling med to helt ulike utfall, avhengig av
// noe brukeren ikke kan se: «Brød» ga abonnementsdialogen, «Kaffe» ble
// stille lagt til. Og med et utløpt abonnement kunne man handle videre i
// det uendelige så lenge varen alt sto på lista.
//
// Funnet av samtidighetstesten, som meldte «Kari trykket Legg til, men
// ingen rad ble skrevet» i 4 av 40 runder. Alle fire var runder der
// profilen hadde utløpt eller forfalt abonnement.
//
// Kjør:  node scripts/uitest/sperre.mjs
// Exit 0 = begge retninger stemmer.

import { chromium } from 'playwright';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakeSupabase, readEnvHost, authStorageKey, fakeSession, BROWSER_ARGS } from './fakeSupabase.mjs';
import { serveDist } from './serve.mjs';
import { grunnBase, mulberry32 } from './personas.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const iso = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

/** Lager en base med kjent handleliste og valgt abonnementstilstand. */
function base(status, paidUntil) {
  const s = grunnBase(mulberry32(1));
  s.subscriptions = [{
    household_id: s.households[0].id, status, paid_until: paidUntil,
    stripe_customer_id: null, stripe_subscription_id: null,
    updated_at: new Date().toISOString(),
  }];
  // Kjent utgangspunkt: Kaffe FINS (så «Legg til» blir en sammenslåing),
  // Bananer FINS IKKE (så det blir en ny rad). Det er nettopp de to
  // veiene som oppførte seg ulikt.
  s.shopping_items = [{
    id: 'kaffe', household_id: s.households[0].id, name: 'Kaffe', qty: 1,
    unit: 'g', category: 'Drikke', store: 'Coop Extra', price: 79, pack_size: 500,
    price_source: 'receipt', checked: false, checked_at: null, checked_by: null,
    created_by: null, created_at: new Date().toISOString(), is_offer: false,
    variant: null, kassal_product_id: null, ean: null, brand: null, kassal_name: null,
  }];
  return s;
}

async function prøv(browser, host, srv, state) {
  const ctx = await browser.newContext({ viewport: { width: 768, height: 900 }, locale: 'nb-NO' });
  const page = await ctx.newPage();
  await installFakeSupabase(page, host, { state });
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)),
    [authStorageKey(host), fakeSession()]);
  await page.goto(`${srv.base}/app/`, { waitUntil: 'commit', timeout: 30000 });
  await page.waitForSelector('nav button', { state: 'attached', timeout: 25000 });
  await page.waitForTimeout(1200);

  const nav = page.locator('nav button:has-text("Handel")');
  for (let i = 0; i < await nav.count(); i += 1) {
    const b = await nav.nth(i).boundingBox().catch(() => null);
    if (b && b.width > 8) { await nav.nth(i).click().catch(() => {}); break; }
  }
  await page.waitForTimeout(800);

  const ut = {};
  for (const navn of ['Kaffe', 'Bananer']) {
    const søk = page.locator('input[aria-label="Søk etter vare"]').first();
    await søk.fill(navn);
    await page.waitForTimeout(500);
    const legg = page.locator('button[aria-label="Legg til på listen"], button:has-text("Legg til")').first();
    if (await legg.count()) await legg.click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(700);
    ut[navn] = {
      dialog: await page.locator('[role="dialog"]').first().getAttribute('aria-label').catch(() => null),
    };
    if (await page.locator('[role="dialog"]').count()) {
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(300);
    }
    await søk.fill('').catch(() => {});
  }
  await ctx.close().catch(() => {});
  return ut;
}

const host = readEnvHost(join(root, '.env'));
const srv = await serveDist(join(root, 'dist'), 4230);
const browser = await chromium.launch({ executablePath: CHROME, args: BROWSER_ARGS });
let feil = 0;
const si = (ok, tekst) => { console.log(`${ok ? '  ok  ' : 'FEIL  '}${tekst}`); if (!ok) feil += 1; };

// --- 1. Utløpt: BEGGE veier skal stoppes ---
{
  const state = base('utløpt', iso(-9));
  const r = await prøv(browser, host, srv, state);
  console.log('utløpt abonnement:');
  si(r.Kaffe.dialog === 'Abonnement', `sammenslåing stoppes (dialog: ${r.Kaffe.dialog})`);
  si(r.Bananer.dialog === 'Abonnement', `ny rad stoppes (dialog: ${r.Bananer.dialog})`);
  const kaffe = state.shopping_items.find((i) => i.name === 'Kaffe');
  si(Number(kaffe?.qty) === 1, `Kaffe står på 1 (er ${kaffe?.qty})`);
  si(state.shopping_items.length === 1, `ingen ny rad (${state.shopping_items.length} rader)`);
}

// --- 2. Gyldig prøveperiode: BEGGE veier skal slippe gjennom ---
{
  const state = base('prøve', iso(20));
  const r = await prøv(browser, host, srv, state);
  console.log('gyldig prøveperiode:');
  si(r.Kaffe.dialog !== 'Abonnement', 'sammenslåing slipper gjennom');
  si(r.Bananer.dialog !== 'Abonnement', 'ny rad slipper gjennom');
  const kaffe = state.shopping_items.find((i) => i.name === 'Kaffe');
  si(Number(kaffe?.qty) > 1, `Kaffe er økt (${kaffe?.qty})`);
  si(state.shopping_items.some((i) => /banan/i.test(i.name ?? '')), 'Bananer ble lagt til');
}

await browser.close();
await srv.close();
console.log(feil ? `\n${feil} avvik.` : '\nBegge retninger stemmer.');
process.exit(feil ? 1 : 0);
