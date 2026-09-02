// Apekatt-test: åpner appen, trykker rundt, og noterer alt som knekker.
//
// Bakgrunn: Jon har funnet feil ved å bruke appen som en vanlig bruker —
// en blank Tilbud-fane, en blyant som forsvant bak et langt navn, en
// dialog uten vei ut. Ingen av dem ble fanget av 744 enhetstester, fordi
// de oppstår først når ekte komponenter møter ekte tilstand i en ekte
// nettleser. Denne gjør det samme, tusen ganger, uten å bli sliten.
//
// Kjør:  node scripts/uitest/monkey.mjs [antall runder]
//
// Hva den regner som en FEIL:
//   * ErrorBoundary vises («Noe gikk galt») — en fane har krasjet
//   * en uncaught exception eller unhandled rejection i nettleseren
//   * console.error (React-advarsler om nøkler, tilstand, hooks)
//   * en tom hovedflate der det skulle stått noe
//   * en dialog som ikke lar seg lukke
//
// Den skriver ikke til noe ekte. Nettverket er fakset, se fakeSupabase.mjs.

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakeSupabase, readEnvHost, authStorageKey, fakeSession, BROWSER_ARGS } from './fakeSupabase.mjs';
import { serveDist } from './serve.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ROUNDS = Number(process.argv[2] ?? 100);
let BASE = process.env.UITEST_BASE ?? null;
const OUT = process.env.UITEST_OUT ?? join(root, 'docs', 'uitest-rapport.json');

const TABS = ['hjem', 'handel', 'forslag', 'middag', 'tilbud', 'lister'];

/** Tekster som betyr «her er det noe galt», ikke «her er en tom liste». */
const CRASH_TEXT = /Noe gikk galt|Something went wrong|Uventet feil/i;

/** Konsollstøy vi bevisst ikke bryr oss om. */
const IGNORE = [
  /Download the React DevTools/i,
  /Failed to load resource.*realtime/i,
  /WebSocket/i,
  /favicon/i,
  /net::ERR_ABORTED.*realtime/i,
  /Service Worker/i,
  /sw\.js/i,
  /manifest/i,
  // Ikke tilgjengelig i testmiljøet, og ikke appens feil.
  /fonts\.googleapis\.com/i,
  /_vercel\/insights/i,
  /ERR_CONNECTION_RESET/i,
  /404 \(Not Found\)/i,
  /ERR_FAILED/i,
  /ERR_TUNNEL_CONNECTION_FAILED/i,
  /ERR_NAME_NOT_RESOLVED/i,
];

const rnd = (n) => Math.floor(Math.random() * n);

/**
 * Er dette elementet det som faktisk ligger øverst i sitt eget midtpunkt?
 *
 * Appen tegner TO navigasjonsrader — én for smal skjerm, én for bred —
 * og begge har en boks. «Synlig» etter Playwright er derfor ikke nok:
 * den skjulte fikk klikk som ikke gjorde noe, og apekatten trykket rundt
 * på Hjem i alle seks «faner» mens den trodde den byttet. Nettleseren
 * vet svaret; her spør vi den.
 */
async function hittable(locator) {
  const box = await locator.boundingBox().catch(() => null);
  if (!box || box.width < 8 || box.height < 8) return null;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  if (cy < 0 || cy > 844 || cx < 0 || cx > 390) return null;
  const ok = await locator.evaluate((el, [x, y]) => {
    const top = document.elementFromPoint(x, y);
    return Boolean(top && (el === top || el.contains(top) || top.contains(el)));
  }, [cx, cy]).catch(() => false);
  return ok ? box : null;
}
const pick = (arr) => arr[rnd(arr.length)];

const findings = new Map();
function record(kind, detail, ctx) {
  const key = `${kind}|${String(detail).slice(0, 220)}`;
  const hit = findings.get(key);
  if (hit) { hit.count += 1; if (hit.where.length < 6 && !hit.where.includes(ctx)) hit.where.push(ctx); return; }
  findings.set(key, { kind, detail: String(detail).slice(0, 1200), count: 1, where: [ctx] });
}

async function main() {
  const host = readEnvHost(join(root, '.env'));

  // Serveren startes her, i testprosessen. Startet utenfor ble den drept
  // sammen med skallet, og testen feilet på ERR_CONNECTION_REFUSED uten å
  // ha prøvd noe.
  let server = null;
  if (!BASE) {
    server = await serveDist(join(root, 'dist'));
    BASE = server.base;
    console.log(`tjener dist/ på ${BASE}`);
  }
  const browser = await chromium.launch({ executablePath: CHROME, args: BROWSER_ARGS });

  let round = 0;
  let clicks = 0;
  const started = Date.now();

  for (round = 1; round <= ROUNDS; round += 1) {
    const ctxLabel = () => `runde ${round}/${tab}`;
    let tab = 'oppstart';

    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },     // iPhone-ish, som Jon bruker
      locale: 'nb-NO',
      timezoneId: 'Europe/Oslo',
    });
    const page = await context.newPage();

    page.on('pageerror', (e) => record('krasj', e.message, ctxLabel()));
    page.on('console', (msg) => {
      if (msg.type() !== 'error' && msg.type() !== 'warning') return;
      const t = msg.text();
      if (IGNORE.some((re) => re.test(t))) return;
      record(msg.type() === 'error' ? 'konsollfeil' : 'advarsel', t, ctxLabel());
    });

    try {
      await installFakeSupabase(page, host);
      // Innlogget fra start. Nøkkelen MÅ være sb-<prosjekt-ref>-auth-token —
      // med et gjettet navn fant supabase-js ingen sesjon, og apekatten
      // satt på innloggingsskjermen og rapporterte «ingen feil».
      await page.addInitScript(([k, sess]) => {
        localStorage.setItem(k, JSON.stringify(sess));
      }, [authStorageKey(host), fakeSession()]);

      await page.goto(`${BASE}/app/`, { waitUntil: 'commit', timeout: 30000 });
      // Vent på at appen har tegnet navigasjonen, ikke på at nettleseren
      // er «ferdig». domcontentloaded tok 12,5 sekunder her — det er
      // stilarket fra Google Fonts som blokkerer, og det finnes ikke i
      // dette miljøet. Navigasjonen er det ekte signalet.
      await page.waitForSelector('nav button', { timeout: 20000 });
      await page.waitForTimeout(500);

      // --- Gå gjennom fanene og trykk rundt ---
      const order = [...TABS].sort(() => Math.random() - 0.5);
      for (const t of order) {
        tab = t;
        // Rydd bort åpne overlegg først. Står butikkmodus åpen, ligger den
        // over navigasjonen, og fanebyttet ville feilet — det er riktig
        // oppførsel, ikke en feil å rapportere.
        for (let esc = 0; esc < 3; esc += 1) {
          if (!(await page.locator('[role="dialog"]').count().catch(() => 0))) break;
          await page.keyboard.press('Escape').catch(() => {});
          await page.waitForTimeout(200);
        }
        // Den SISTE av de to navigasjonsradene er den som vises på smal
        // skjerm. .first() traff den skjulte, og fanebyttet skjedde aldri —
        // apekatten trykket rundt på Hjem i alle seks «faner».
        const navAll = page.locator(`nav button:has-text("${tabLabel(t)}")`);
        const navN = await navAll.count().catch(() => 0);
        let switched = false;
        for (let k = 0; k < navN; k += 1) {
          const cand = navAll.nth(k);
          if (!(await hittable(cand))) continue;
          switched = await cand.click({ timeout: 2000 }).then(() => true).catch(() => false);
          if (switched) break;
        }
        if (!switched) record('fanebytte virker ikke', `kom ikke til ${t}`, ctxLabel());
        await page.waitForTimeout(400);

        // Krasjet fanen?
        const body = await page.textContent('body').catch(() => '');
        if (CRASH_TEXT.test(body ?? '')) {
          const msg = await page.locator('text=/Noe gikk galt/i').first()
            .locator('xpath=..').textContent().catch(() => 'ErrorBoundary vist');
          record('fane krasjet', `${t}: ${String(msg).replace(/\s+/g, ' ').slice(0, 300)}`, ctxLabel());
        }
        // Helt tom fane? Måles på innholdsflaten mellom topplinje og
        // navigasjon — body inneholder alltid nav og header, så en
        // terskel på hele body ville aldri slått inn. Det var nettopp en
        // blank Tilbud-fane Jon fant, med navigasjonen intakt.
        const main = await page.locator('main, [role="main"]').first()
          .textContent().catch(() => null);
        const inner = (main ?? '').replace(/\s+/g, ' ').trim();
        if (main !== null && inner.length < 25) {
          record('tom fane', `${t}: bare ${inner.length} tegn i innholdsflaten`, ctxLabel());
        }

        // Trykk på noen tilfeldige knapper i denne fanen.
        for (let i = 0; i < 6; i += 1) {
          const btns = page.locator('button:visible, [role="button"]:visible');
          const n = await btns.count().catch(() => 0);
          if (!n) break;
          const btn = btns.nth(rnd(n));

          // Appen tegner TO navigasjonsrader — én for smal skjerm og én
          // for bred — og den skjulte har fortsatt en boks, så Playwright
          // regner den som synlig mens den ikke kan trykkes. Uten denne
          // sjekken gikk hvert tredje klikk i en tre sekunders tidsavbrudd,
          // og en runde tok fem minutter i stedet for tjue sekunder.
          if (!(await hittable(btn))) continue;

          const label = (await btn.textContent().catch(() => '') ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)
            || (await btn.getAttribute('aria-label').catch(() => '')) || '(uten tekst)';
          // Hopp over det som logger ut eller sletter alt — de avslutter turen.
          if (/logg ut|slett kontoen/i.test(label)) continue;
          const ok = await btn.click({ timeout: 1500 }).then(() => true).catch(() => false);
          if (!ok) continue;
          clicks += 1;
          await page.waitForTimeout(200);

          const after = await page.textContent('body').catch(() => '');
          if (CRASH_TEXT.test(after ?? '')) {
            record('krasj etter trykk', `${t} → «${label}»`, ctxLabel());
            await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
            await page.waitForTimeout(800);
            break;
          }

          // Åpnet det en dialog? Skriv litt i den, og lukk den igjen.
          const dialog = page.locator('[role="dialog"]').first();
          if (await dialog.count()) {
            const fields = dialog.locator('input[type="text"]:visible, input:not([type]):visible, textarea:visible');
            const fn = await fields.count().catch(() => 0);
            if (fn && Math.random() < 0.6) {
              await fields.nth(rnd(fn)).fill(pick(['Melk', 'Pølser med lompe', 'ÆØÅ test', '2', '']))
                .catch(() => {});
            }
            const sel = dialog.locator('select:visible');
            const sn = await sel.count().catch(() => 0);
            if (sn && Math.random() < 0.4) {
              const s = sel.nth(rnd(sn));
              const opts = await s.locator('option').count().catch(() => 0);
              if (opts > 1) await s.selectOption({ index: rnd(opts) }).catch(() => {});
            }
            // Lukk. Klarer den ikke det, er dialogen en blindvei.
            const close = dialog.locator(
              'button[aria-label="Lukk"], button:has-text("Avbryt"), '
              + 'button[aria-label="Avslutt butikkmodus"], button:has-text("Ferdig")',
            ).first();
            if (await close.count()) await close.click({ timeout: 3000 }).catch(() => {});
            else await page.keyboard.press('Escape').catch(() => {});
            await page.waitForTimeout(250);
            if (await page.locator('[role="dialog"]').count() > 0 && Math.random() < 0.5) {
              await page.keyboard.press('Escape').catch(() => {});
              await page.waitForTimeout(200);
              if (await page.locator('[role="dialog"]').count() > 0) {
                record('dialog uten vei ut', `${t} → «${label}»`, ctxLabel());
                await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
                await page.waitForTimeout(800);
                break;
              }
            }
          }
        }
      }
    } catch (e) {
      record('testfeil', e.message, `runde ${round}`);
    } finally {
      await context.close().catch(() => {});
    }

    if (round % 10 === 0) {
      const mins = ((Date.now() - started) / 60000).toFixed(1);
      console.log(`  ${round}/${ROUNDS} runder · ${clicks} trykk · ${findings.size} ulike funn · ${mins} min`);
      writeReport(round, clicks, started);
    }
  }

  await browser.close();
  if (server) await server.close();
  writeReport(round - 1, clicks, started);

  const list = [...findings.values()].sort((a, b) => b.count - a.count);
  console.log(`\nFERDIG: ${ROUNDS} runder, ${clicks} trykk, ${list.length} ulike funn.`);
  for (const f of list.slice(0, 40)) {
    console.log(`\n[${f.kind} ×${f.count}] ${f.detail.slice(0, 300)}`);
    console.log(`   sett i: ${f.where.join(', ')}`);
  }
  if (!list.length) console.log('Ingen feil funnet.');
}

function tabLabel(id) {
  return { hjem: 'Hjem', handel: 'Handel', forslag: 'Forslag', middag: 'Middag', tilbud: 'Tilbud', lister: 'Lister' }[id];
}

function writeReport(rounds, clicks, started) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({
    kjort: new Date().toISOString(),
    runder: rounds,
    trykk: clicks,
    minutter: Number(((Date.now() - started) / 60000).toFixed(1)),
    funn: [...findings.values()].sort((a, b) => b.count - a.count),
  }, null, 2));
}

main().catch((e) => { console.error('Apekatten falt av:', e); process.exit(1); });
