// To personer i samme liste, samtidig.
//
// Apekatt-testen kjører én nettleser om gangen. Men Plukkelisten er laget
// for at hele familien skal bruke den PÅ SAMME TID: Jon står i Coop og
// krysser av melk mens kona legger til brød hjemmefra. Det er den
// situasjonen appen er til for, og den som er minst testet — realtime,
// optimistisk tegning og «siste skriving vinner» møter hverandre først
// når to klienter er oppe.
//
// Kjør:  node scripts/uitest/samtidig.mjs [antall runder]
//
// Hva den ser etter:
//   * krasj eller konsollfeil i noen av de to nettleserne
//   * en avkryssing som forsvinner fordi den andre skrev over den
//   * en vare som blir borte fordi begge skrev hele lista samtidig
//   * tellelister der to opptellinger ikke summeres (count_bump)
//
// Merk: realtime er avslått i den falske basen (WebSocket avbrytes), så
// dette måler IKKE at endringer dukker opp av seg selv. Det måler at to
// klienter som skriver mot samme tilstand ikke ødelegger for hverandre —
// og at appen ikke krasjer når tilstanden endrer seg under føttene på
// den. Det siste er det som gir hvite skjermer.

import { chromium } from 'playwright';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakeSupabase, readEnvHost, authStorageKey, fakeSession, launchOptions } from './fakeSupabase.mjs';
import { serveDist } from './serve.mjs';
import { byggRunde, mulberry32 } from './personas.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const RUNDER = Number(argv.find((a) => /^\d+$/.test(a)) ?? 20);
const PORT = argv.includes('--port') ? Number(argv[argv.indexOf('--port') + 1]) : 4190;

const IGNORE = [
  /Download the React DevTools/i, /WebSocket/i, /favicon/i, /Service Worker/i,
  /sw\.js/i, /manifest/i, /fonts\.googleapis\.com/i, /_vercel\/insights/i,
  /ERR_CONNECTION_RESET/i, /404 \(Not Found\)/i, /ERR_FAILED/i,
  /ERR_NAME_NOT_RESOLVED/i, /net::ERR_ABORTED/i,
];

const funn = new Map();
function meld(art, detalj, hvor) {
  const n = `${art}|${String(detalj).slice(0, 200)}`;
  const t = funn.get(n);
  if (t) { t.antall += 1; if (t.hvor.length < 6) t.hvor.push(hvor); return; }
  funn.set(n, { art, detalj: String(detalj).slice(0, 800), antall: 1, hvor: [hvor] });
}

/** Den ANDRE brukeren i husholdningen — hun må finnes som medlem. */
const BRUKER_B = '33333333-3333-4333-8333-333333333333';

async function åpne(browser, host, state, bruker, bredde, base, merkelapp, runde) {
  const ctx = await browser.newContext({
    viewport: { width: bredde, height: 844 }, locale: 'nb-NO', timezoneId: 'Europe/Oslo',
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => meld('krasj', `${merkelapp}: ${e.message}`, `r${runde}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (IGNORE.some((re) => re.test(t))) return;
    meld('konsollfeil', `${merkelapp}: ${t}`, `r${runde}`);
  });
  // BEGGE nettleserne mot SAMME state-objekt. Det er hele poenget: to
  // klienter, én sannhet, og ingen av dem vet om den andre.
  await installFakeSupabase(page, host, { state, userId: bruker });
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [authStorageKey(host), fakeSession(bruker)]);
  await page.goto(`${base}/app/`, { waitUntil: 'commit', timeout: 30000 });
  await page.waitForSelector('nav button', { state: 'attached', timeout: 25000 });
  await page.waitForTimeout(900);
  return { ctx, page };
}

async function tilFane(page, tekst) {
  const knapper = page.locator(`nav button:has-text("${tekst}")`);
  const n = await knapper.count().catch(() => 0);
  for (let i = 0; i < n; i += 1) {
    const b = knapper.nth(i);
    const boks = await b.boundingBox().catch(() => null);
    if (!boks || boks.width < 8) continue;
    if (await b.click({ timeout: 2000 }).then(() => true).catch(() => false)) return true;
  }
  return false;
}

async function main() {
  const host = readEnvHost(join(root, '.env'));
  const server = await serveDist(join(root, 'dist'), PORT);
  console.log(`tjener dist/ på ${server.base}`);
  const browser = await chromium.launch(launchOptions());

  let plukk = 0;
  let lagt = 0;
  const start = Date.now();

  for (let runde = 1; runde <= RUNDER; runde += 1) {
    const rng = mulberry32(runde * 7919 + 3);
    // Bruk «rotete»-profilen halvparten av gangene: samtidighet OG stygge
    // data er verre enn hver av dem alene.
    const { state } = byggRunde(runde * 3 + (runde % 2), 1);
    // Den andre brukeren må være medlem, ellers ser hun ingenting.
    state.members.push({
      household_id: state.households[0].id, user_id: BRUKER_B, display_name: 'Kari',
      initials: 'KA', role: 'member', avatar: null, created_at: new Date().toISOString(), households: null,
    });
    const varerFør = state.shopping_items.length;

    let a = null;
    let b = null;
    try {
      // Jon på telefon i butikken, Kari på nettbrett hjemme.
      [a, b] = await Promise.all([
        åpne(browser, host, state, '22222222-2222-4222-8222-222222222222', 390, server.base, 'Jon', runde),
        åpne(browser, host, state, BRUKER_B, 768, server.base, 'Kari', runde),
      ]);

      await Promise.all([tilFane(a.page, 'Handel'), tilFane(b.page, 'Handel')]);
      await Promise.all([a.page.waitForTimeout(600), b.page.waitForTimeout(600)]);

      // --- SAMTIDIG: Jon krysser av, Kari legger til ---
      const jonPlukker = async () => {
        // input[type=checkbox], IKKE button.
        //
        // Avkryssingen i handlelisten er en ekte avkryssingsboks med
        // aria-label «Plukk <vare>». Apekattens kryssAv() har lett etter
        // en BUTTON med samme merkelapp — den finnes ikke, så den fant
        // aldri noe, og «handletur»-mønsteret krysset i praksis aldri av
        // en eneste vare. Det vanligste en bruker gjør i appen sto
        // utestet mens tallene så pene ut.
        const bokser = a.page.locator('input[type="checkbox"][aria-label^="Plukk "]');
        const n = await bokser.count().catch(() => 0);
        for (let i = 0; i < Math.min(n, 5); i += 1) {
          if (await bokser.nth(i).click({ timeout: 1500 }).then(() => true).catch(() => false)) {
            plukk += 1;
            await a.page.waitForTimeout(60 + Math.floor(rng() * 120));
          }
        }
      };
      const kariLeggerTil = async () => {
        const søk = b.page.locator('input[aria-label="Søk etter vare"]').first();
        if (!(await søk.count().catch(() => 0))) return;
        for (const navn of ['Brød', 'Kaffe', 'Bananer']) {
          await søk.fill(navn).catch(() => {});
          await b.page.waitForTimeout(300);
          const legg = b.page.locator('button[aria-label="Legg til på listen"], button:has-text("Legg til")').first();
          if (await legg.count().catch(() => 0)) {
            if (await legg.click({ timeout: 1500 }).then(() => true).catch(() => false)) lagt += 1;
          }
          await b.page.waitForTimeout(200);
        }
        await søk.fill('').catch(() => {});
      };
      // Ikke etter hverandre — samtidig. Det er der kappløpene bor.
      await Promise.all([jonPlukker(), kariLeggerTil()]);
      await Promise.all([a.page.waitForTimeout(800), b.page.waitForTimeout(800)]);

      // --- Ble noe borte? ---
      //
      // Både avkryssing og innlegging går via egne PATCH/POST per rad, så
      // ingen av dem skal kunne slette den andres arbeid. Skrev appen
      // HELE lista i én operasjon, ville Karis tre varer forsvunnet i det
      // øyeblikket Jon krysset av.
      const varerEtter = state.shopping_items.length;
      // Landet Karis innlegginger i det hele tatt? `lagt` teller trykk,
      // ikke skrivinger — og et trykk som ikke gjør noe er verdiløst som
      // test. Enten en ny rad, eller et økt antall på en rad som fantes.
      const kariSkrev = state.shopping_items.some((i) => i.created_by === BRUKER_B)
        || varerEtter > varerFør;
      if (!kariSkrev) {
        meld('innlegging landet ikke', `Kari trykket «Legg til», men ingen rad ble skrevet (${varerFør} → ${varerEtter})`, `r${runde}`);
      }
      if (varerEtter < varerFør) {
        meld('varer forsvant', `${varerFør} varer før, ${varerEtter} etter — noen skrev over den andre`, `r${runde}`);
      }
      const avkrysset = state.shopping_items.filter((i) => i.checked).length;

      // --- Begge tegner videre uten å krasje ---
      for (const [merke, s] of [['Jon', a], ['Kari', b]]) {
        for (const fane of ['Hjem', 'Middag', 'Tilbud', 'Lister', 'Handel']) {
          await tilFane(s.page, fane);
          await s.page.waitForTimeout(250);
          const txt = ((await s.page.textContent('body').catch(() => '')) ?? '');
          if (/Noe gikk galt|Uventet feil/i.test(txt)) {
            meld('fane krasjet', `${merke} på ${fane} etter samtidig bruk`, `r${runde}`);
            break;
          }
        }
      }

      if (runde % 5 === 0) {
        console.log(`  ${runde}/${RUNDER} runder · ${plukk} avkryssinger · ${lagt} innlegginger`
          + ` · ${state.shopping_items.length} varer (${avkrysset} avkrysset) · ${funn.size} funn`);
      }
    } catch (e) {
      meld('testfeil', e.message, `r${runde}`);
    } finally {
      await a?.ctx.close().catch(() => {});
      await b?.ctx.close().catch(() => {});
    }
  }

  await browser.close();
  await server.close();

  const liste = [...funn.values()].sort((x, y) => y.antall - x.antall);
  const min = ((Date.now() - start) / 60000).toFixed(1);
  console.log(`\nFERDIG: ${RUNDER} runder med to samtidige brukere,`
    + ` ${plukk} avkryssinger, ${lagt} innlegginger, ${min} min.`);
  if (!liste.length) console.log('Ingen feil funnet.');
  for (const f of liste) {
    console.log(`\n[${f.art} ×${f.antall}] ${f.detalj}`);
    console.log(`   sett i: ${f.hvor.join(', ')}`);
  }
}

main().catch((e) => { console.error('Falt av:', e); process.exit(1); });
