// Apekatt-test: åpner appen som ulike brukere, trykker rundt, og noterer
// alt som knekker.
//
// Bakgrunn: Jon har funnet feil ved å bruke appen som en vanlig bruker —
// en blank Tilbud-fane, en blyant som forsvant bak et langt navn, en
// dialog uten vei ut. Ingen av dem ble fanget av 748 enhetstester, fordi
// de oppstår først når ekte komponenter møter ekte tilstand i en ekte
// nettleser.
//
// Første utgave kjørte mot ÉN tilstand: to voksne, to barn, åtte varer.
// Den gikk grønt, og det betydde mindre enn det så ut som. Nå trekkes
// profil, skjermstørrelse og handlemønster per runde (se personas.mjs),
// så appen også blir spurt hva den gjør med en tom liste, 240 varer, et
// utløpt abonnement og et nett som svarer 500.
//
// Kjør:  node scripts/uitest/monkey.mjs [antall runder]
//        node scripts/uitest/monkey.mjs 1 --runde 417     (gjenta én runde)
//
// Hva den regner som en FEIL:
//   * ErrorBoundary vises («Noe gikk galt») — en fane har krasjet
//   * en uncaught exception eller unhandled rejection i nettleseren
//   * console.error (React-advarsler om nøkler, tilstand, hooks)
//   * en tom hovedflate der det skulle stått noe
//   * en fane som blir stående på «Laster …»
//   * en dialog som ikke lar seg lukke
//   * sideveis rulling på telefon (noe stikker utenfor skjermen)
//
// Den skriver ikke til noe ekte. Nettverket er fakset, se fakeSupabase.mjs.

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakeSupabase, readEnvHost, authStorageKey, fakeSession, BROWSER_ARGS } from './fakeSupabase.mjs';
import { serveDist } from './serve.mjs';
import { byggRunde } from './personas.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const argv = process.argv.slice(2);
const ROUNDS = Number(argv.find((a) => /^\d+$/.test(a)) ?? 100);
const BARE = argv.includes('--runde') ? Number(argv[argv.indexOf('--runde') + 1]) : null;
const FRØ = argv.includes('--frø') ? Number(argv[argv.indexOf('--frø') + 1]) : 1;
// --fra/--til kjører et utsnitt av rundene, slik at 1000 runder kan deles
// på fire prosesser uten at to av dem tester nøyaktig det samme.
// Rundenummeret er frøet, så utsnittene er disjunkte av seg selv.
const FRA = argv.includes('--fra') ? Number(argv[argv.indexOf('--fra') + 1]) : null;
const TIL = argv.includes('--til') ? Number(argv[argv.indexOf('--til') + 1]) : null;
const PORT = argv.includes('--port') ? Number(argv[argv.indexOf('--port') + 1]) : 4180;
let BASE = process.env.UITEST_BASE ?? null;
const OUT = process.env.UITEST_OUT ?? join(root, 'docs', 'uitest-rapport.json');

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
  // Profilene «ustabilt», «treg» og «offline» LAGER 500-svar med vilje.
  // At nettleseren logger dem er ikke funnet; funnet er hva appen tegner.
  /the server responded with a status of 500/i,
  /simulert nettverksfeil/i,
];

/**
 * Tilfeldigheten i trykkene.
 *
 * Settes på nytt i starten av hver runde, fra rundenummeret. Alt av
 * knappevalg, feltinnhold og «lagre eller avbryt» går gjennom denne, slik
 * at `--runde 417` kjører nøyaktig samme tur som runde 417 gjorde i den
 * store kjøringen.
 */
let R = Math.random;
const rnd = (n) => Math.floor(R() * n);
const pick = (arr) => arr[rnd(arr.length)];

const findings = new Map();
function record(kind, detail, ctx) {
  const key = `${kind}|${String(detail).slice(0, 220)}`;
  const hit = findings.get(key);
  if (hit) {
    hit.count += 1;
    if (hit.where.length < 8 && !hit.where.includes(ctx)) hit.where.push(ctx);
    return;
  }
  findings.set(key, { kind, detail: String(detail).slice(0, 1200), count: 1, where: [ctx] });
}

/**
 * Er dette elementet det som faktisk ligger øverst i sitt eget midtpunkt?
 *
 * Appen tegner TO navigasjonsrader — én for smal skjerm, én for bred —
 * og begge har en boks. «Synlig» etter Playwright er derfor ikke nok:
 * den skjulte fikk klikk som ikke gjorde noe, og apekatten trykket rundt
 * på Hjem i alle seks «faner» mens den trodde den byttet. Nettleseren
 * vet svaret; her spør vi den.
 */
async function hittable(locator, vw, vh) {
  const box = await locator.boundingBox().catch(() => null);
  if (!box || box.width < 8 || box.height < 8) return null;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  if (cy < 0 || cy > vh || cx < 0 || cx > vw) return null;
  const ok = await locator.evaluate((el, [x, y]) => {
    const top = document.elementFromPoint(x, y);
    return Boolean(top && (el === top || el.contains(top) || top.contains(el)));
  }, [cx, cy]).catch(() => false);
  return ok ? box : null;
}

function tabLabel(id) {
  return { hjem: 'Hjem', handel: 'Handel', forslag: 'Forslag', middag: 'Middag', tilbud: 'Tilbud', lister: 'Lister' }[id];
}

/** Venter til minst én navigasjonsknapp faktisk kan trykkes. */
async function ventPåTrykkbarNav(page, vw, vh, timeout) {
  const frist = Date.now() + timeout;
  while (Date.now() < frist) {
    const knapper = page.locator('nav button');
    const n = await knapper.count().catch(() => 0);
    for (let i = 0; i < n; i += 1) {
      if (await hittable(knapper.nth(i), vw, vh)) return true;
    }
    await page.waitForTimeout(250);
  }
  return false;
}

async function lukkOverlegg(page) {
  // Butikkmodus dekker hele skjermen. Den HAR Escape, men trenger to
  // trykk når rettesheetet er oppe — det første lukker sheetet, det andre
  // butikkmodus. Knappen er den sikre veien ut, så den prøves først.
  const ut = page.locator('button[aria-label="Avslutt butikkmodus"]');
  if (await ut.count().catch(() => 0)) {
    await ut.first().click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(300);
  }
  for (let esc = 0; esc < 4; esc += 1) {
    if (!(await page.locator('[role="dialog"]').count().catch(() => 0))) return true;
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(250);
  }
  return (await page.locator('[role="dialog"]').count().catch(() => 0)) === 0;
}

async function main() {
  const host = readEnvHost(join(root, '.env'));

  // Serveren startes her, i testprosessen. Startet utenfor ble den drept
  // sammen med skallet, og testen feilet på ERR_CONNECTION_REFUSED uten å
  // ha prøvd noe.
  let server = null;
  if (!BASE) {
    server = await serveDist(join(root, 'dist'), PORT);
    BASE = server.base;
    console.log(`tjener dist/ på ${BASE}`);
  }
  const browser = await chromium.launch({ executablePath: CHROME, args: BROWSER_ARGS });

  let clicks = 0;
  const started = Date.now();
  const profilTeller = new Map();
  const runder = BARE ? [BARE]
    : (FRA != null && TIL != null)
      ? Array.from({ length: TIL - FRA + 1 }, (_, i) => FRA + i)
      : Array.from({ length: ROUNDS }, (_, i) => i + 1);
  let gjort = 0;

  for (const round of runder) {
    const { profil, skjerm, mønster, state, klikkRng } = byggRunde(round, FRØ);
    R = klikkRng;
    profilTeller.set(profil.id, (profilTeller.get(profil.id) ?? 0) + 1);
    let tab = 'oppstart';
    // De siste trykkene. «Navigasjonen forsvant» er ubrukelig alene; det
    // som trengs er HVILKET trykk som gjorde det.
    const spor = [];
    const sisteTrykk = () => (spor.length ? spor.slice(-4).join(' → ') : 'ingen trykk ennå');
    // Konteksten MÅ si hvilken profil og skjerm, ellers er «runde 417
    // krasjet» ubrukelig — det er 12 profiler og 8 skjermer, og feilen
    // kan ikke gjentas uten å vite hvilken kombinasjon det var.
    const ctxLabel = () => `r${round} ${profil.id}/${skjerm.width}px/${mønster.id}/${tab}`;

    const context = await browser.newContext({
      viewport: { width: skjerm.width, height: skjerm.height },
      locale: 'nb-NO',
      timezoneId: 'Europe/Oslo',
    });
    const page = await context.newPage();

    page.on('pageerror', (e) => {
      // Stakken, ikke bare meldingen. «Cannot read properties of undefined»
      // finnes på hundre steder i appen; uten stakken er funnet ubrukelig.
      const stakk = String(e.stack ?? '').split('\n').slice(1, 5).map((l) => l.trim()).join(' / ');
      record('krasj', `${e.message}${stakk ? `  ⟨${stakk}⟩` : ''}`, ctxLabel());
    });
    page.on('console', (msg) => {
      if (msg.type() !== 'error' && msg.type() !== 'warning') return;
      const t = msg.text();
      if (IGNORE.some((re) => re.test(t))) return;
      record(msg.type() === 'error' ? 'konsollfeil' : 'advarsel', t, ctxLabel());
    });
    // Nye faner stjeler fokus og henger igjen. Lukk dem med én gang.
    context.on('page', (p) => { if (p !== page) p.close().catch(() => {}); });

    try {
      await installFakeSupabase(page, host, {
        state,
        feilrate: profil.feilrate ?? 0,
        forsinkelse: profil.forsinkelse ?? 0,
        offlineEtterMs: profil.offlineEtterMs ?? 0,
      });
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
      // Appen tegner TO navigasjonsrader: den mobile inne i .app-brand og
      // sidemenyen. Over 900px er den mobile `display:none`, og den ligger
      // FØRST i DOM-en — så waitForSelector, som venter på at det første
      // treffet blir synlig, sto og ventet på en knapp som aldri kan bli
      // synlig. 25 sekunders tidsavbrudd på hver eneste brede skjerm.
      const vw = skjerm.width;
      const vh = skjerm.height;
      const nav = await page.waitForSelector('nav button', { state: 'attached', timeout: 25000 })
        .then(() => true).catch(() => false);
      if (!nav) {
        // Ingen navigasjon. Under profilene som kutter nettet er dette
        // RIKTIG: appen skal si «Fikk ikke kontakt» med en Prøv
        // igjen-knapp, ikke tegne seks faner over ingen data. Men det er
        // bare riktig hvis den faktisk SIER det.
        const skjermtekst = ((await page.textContent('body').catch(() => '')) ?? '')
          .replace(/\s+/g, ' ').trim();
        const ærlig = /fikk ikke kontakt|uten nett|prøv igjen|ingen forbindelse/i.test(skjermtekst);
        if (!ærlig) {
          record('appen kom aldri i gang', `ingen navigasjon og ingen forklaring — skjermen viser: «${skjermtekst.slice(0, 200)}»`, ctxLabel());
        }
        await context.close().catch(() => {});
        gjort += 1;
        continue;
      }
      await ventPåTrykkbarNav(page, vw, vh, 20000);
      await page.waitForTimeout(profil.forsinkelse ? 1200 : 500);

      for (const t of mønster.faner) {
        tab = t;
        // Rydd bort åpne overlegg først. Står butikkmodus åpen, ligger den
        // over navigasjonen, og fanebyttet ville feilet — det er riktig
        // oppførsel, ikke en feil å rapportere.
        await lukkOverlegg(page);

        // Den SISTE av de to navigasjonsradene er den som vises på smal
        // skjerm. .first() traff den skjulte, og fanebyttet skjedde aldri —
        // apekatten trykket rundt på Hjem i alle seks «faner».
        const navAll = page.locator(`nav button:has-text("${tabLabel(t)}")`);
        const navN = await navAll.count().catch(() => 0);
        let switched = false;
        for (let forsøk = 0; forsøk < 2 && !switched; forsøk += 1) {
          for (let k = 0; k < navN; k += 1) {
            const cand = navAll.nth(k);
            if (!(await hittable(cand, vw, vh))) continue;
            switched = await cand.click({ timeout: 2000 }).then(() => true).catch(() => false);
            if (switched) break;
          }
          // Ligger en meny åpen, fanger bakteppet det første trykket og
          // lukker menyen — som det skal. Det er RIKTIG oppførsel, ikke en
          // feil, så apekatten lukker og prøver én gang til før den melder
          // fra. Uten dette sto 3 % av fanebyttene som «virker ikke».
          if (!switched) {
            // Escape først, så et trykk på YTTERKANTEN.
            //
            // Her sto `page.mouse.click(vw / 2, vh / 2)` — midt på
            // skjermen. Det traff bakteppet som det skulle for det meste,
            // men når profilmenyen var åpen traff det innholdet i den, og
            // to ganger av 377 trykk landet det på «Logg ut». Da sto
            // apekatten på innloggingsskjermen og meldte at appen hadde
            // mistet navigasjonen — en feil den hadde laget selv.
            //
            // Venstre ytterkant er bakteppe i alle menyene i appen; de er
            // forankret øverst til høyre.
            await page.keyboard.press('Escape').catch(() => {});
            await page.waitForTimeout(150);
            const nav2 = page.locator(`nav button:has-text("${tabLabel(t)}")`).first();
            if (!(await hittable(nav2, vw, vh))) {
              await page.mouse.click(2, Math.round(vh * 0.55)).catch(() => {});
              spor.push('(trykk på ytterkanten for å lukke meny)');
            }
            await page.waitForTimeout(250);
          }
        }
        if (!switched) {
          // ÅRSAKEN, ikke bare at det skjedde. «Kom ikke til Middag» er
          // ubrukelig alene: et åpent overlegg som blokkerer navigasjonen
          // er riktig oppførsel, mens en navigasjon som er dekket av noe
          // annet er en feil.
          const diag = await page.evaluate((label) => {
            const alle = [...document.querySelectorAll('nav button')];
            if (!alle.length) {
              // Navigasjonen er ikke skjult — den er BORTE. App.jsx tegner
              // Shell med showNav={false} i fire tilstander: mangler
              // oppsett, laster, ikke innlogget, og «trenger navn / ingen
              // husholdning». Hvilken av dem det er står i innholdet.
              const h = document.querySelector('main h1, main h2');
              return `INGEN navigasjon i DOM-en — skjermen viser: «${(h?.textContent ?? document.querySelector('main')?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 90)}» — SISTE_TRYKK`;
            }
            // `includes`, ikke `===`: knappene kan ha et tall eller et
            // ikon ved siden av teksten, og en eksakt sammenligning sa
            // «fant ingen knapp» om en knapp som sto rett der.
            const btn = alle.find((b) => (b.textContent ?? '').trim().includes(label));
            if (!btn) return `fant ingen knapp med teksten «${label}» blant ${alle.length}: ${alle.map((b) => (b.textContent ?? '').trim()).join('|')}`;
            const r = btn.getBoundingClientRect();
            const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            const dialogs = [...document.querySelectorAll('[role="dialog"]')]
              .map((d) => d.getAttribute('aria-label') || '(uten navn)');
            const chain = [];
            let node = top;
            while (node && node !== document.body && chain.length < 4) {
              const cs = getComputedStyle(node);
              chain.push(`${node.tagName.toLowerCase()}${node.className ? '.' + String(node.className).split(' ')[0] : ''}`
                + `[${cs.position},z=${cs.zIndex}]`);
              node = node.parentElement;
            }
            return `dekket av ${chain.join(' < ') || 'ingenting'}`
              + ` | boks y=${Math.round(r.y)} h=${Math.round(r.height)}`
              + ` | åpne dialoger: ${dialogs.length ? dialogs.join(', ') : 'ingen'}`;
          }, tabLabel(t)).catch(() => 'kunne ikke undersøke');
          // Er navigasjonen borte, er det ikke et fanebytte som feilet —
          // appen har byttet til en helt annen tilstand. Det er et eget
          // funn, med sporet av trykk som førte dit.
          const medSpor = String(diag).replace('SISTE_TRYKK', `trykk før: ${sisteTrykk()}`);
          if (medSpor.includes('INGEN navigasjon')) {
            record('appen forlot seg selv', medSpor, ctxLabel());
          } else {
            record('fanebytte virker ikke', `kom ikke til ${t} — ${medSpor}`, ctxLabel());
          }
        }
        await page.waitForTimeout(profil.forsinkelse ? 900 : 400);

        await sjekkFane(page, t, ctxLabel, vw, profil);

        // --- Handlemønsteret ---
        if (mønster.kryssAv && t === 'handel') clicks += await kryssAv(page, ctxLabel, vw, vh);
        if (mønster.skriv) clicks += await skrivNoe(page, t, ctxLabel, vw, vh);

        // --- Tilfeldige trykk ---
        for (let i = 0; i < mønster.trykk; i += 1) {
          const btns = page.locator('button:visible, [role="button"]:visible');
          const n = await btns.count().catch(() => 0);
          if (!n) break;
          const btn = btns.nth(rnd(n));

          // Appen tegner TO navigasjonsrader — den skjulte har fortsatt en
          // boks, så Playwright regner den som synlig mens den ikke kan
          // trykkes. Uten denne sjekken gikk hvert tredje klikk i et tre
          // sekunders tidsavbrudd.
          if (!(await hittable(btn, vw, vh))) continue;

          const label = (await btn.textContent().catch(() => '') ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)
            || (await btn.getAttribute('aria-label').catch(() => '')) || '(uten tekst)';
          // Hopp over det som logger ut eller sletter alt — de avslutter turen.
          if (/logg ut|slett kontoen/i.test(label)) continue;
          const ok = await btn.click({ timeout: 1500 }).then(() => true).catch(() => false);
          if (!ok) continue;
          spor.push(`${t}:${label}`);
          clicks += 1;
          await page.waitForTimeout(profil.forsinkelse ? 450 : 200);

          const after = await page.textContent('body').catch(() => '');
          if (CRASH_TEXT.test(after ?? '')) {
            record('krasj etter trykk', `${t} → «${label}»`, ctxLabel());
            await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
            await page.waitForTimeout(800);
            break;
          }

          if (await håndterDialog(page, t, label, ctxLabel, vw, vh)) break;
        }
      }
    } catch (e) {
      record('testfeil', e.message, ctxLabel());
    } finally {
      await context.close().catch(() => {});
    }

    gjort += 1;
    if (gjort % 25 === 0) {
      const mins = ((Date.now() - started) / 60000).toFixed(1);
      const feil = [...findings.values()].filter((f) => f.kind !== 'fanebytte virker ikke').length;
      const merke = FRA != null ? `[${FRA}-${TIL}] ` : '';
      console.log(`  ${merke}${gjort}/${runder.length} runder · ${clicks} trykk · ${findings.size} funn (${feil} utenom fanebytte) · ${mins} min`);
      writeReport(gjort, clicks, started, profilTeller);
    }
  }

  await browser.close();
  if (server) await server.close();
  writeReport(gjort, clicks, started, profilTeller);

  const list = [...findings.values()].sort((a, b) => b.count - a.count);
  console.log(`\nFERDIG: ${gjort} runder, ${clicks} trykk, ${list.length} ulike funn.`);
  console.log('Profiler kjørt:', [...profilTeller.entries()].map(([k, v]) => `${k}=${v}`).join(' '));
  for (const f of list.slice(0, 60)) {
    console.log(`\n[${f.kind} ×${f.count}] ${f.detail.slice(0, 400)}`);
    console.log(`   sett i: ${f.where.join(', ')}`);
  }
  if (!list.length) console.log('Ingen feil funnet.');
}

/** Krasjet fanen, er den tom, henger den, eller stikker noe utenfor? */
async function sjekkFane(page, t, ctxLabel, vw, profil) {
  const body = await page.textContent('body').catch(() => '');
  if (CRASH_TEXT.test(body ?? '')) {
    const msg = await page.locator('text=/Noe gikk galt/i').first()
      .locator('xpath=..').textContent().catch(() => 'ErrorBoundary vist');
    record('fane krasjet', `${t}: ${String(msg).replace(/\s+/g, ' ').slice(0, 300)}`, ctxLabel());
    return;
  }

  // Helt tom fane? Måles på innholdsflaten mellom topplinje og navigasjon —
  // body inneholder alltid nav og header, så en terskel på hele body ville
  // aldri slått inn. Det var nettopp en blank Tilbud-fane Jon fant, med
  // navigasjonen intakt.
  const main = await page.locator('main, [role="main"]').first().textContent().catch(() => null);
  const inner = (main ?? '').replace(/\s+/g, ' ').trim();
  if (main !== null && inner.length < 25) {
    record('tom fane', `${t}: bare ${inner.length} tegn i innholdsflaten («${inner}»)`, ctxLabel());
  }

  // Står den fast på «Laster …»? Med 500-svar fra serveren er dette den
  // farlige utgangen: appen krasjer ikke, den bare blir aldri ferdig, og
  // brukeren ser en spinner uten slutt.
  if (/^\s*Laster/i.test(inner) || inner === 'Laster …') {
    await page.waitForTimeout(3000);
    const igjen = ((await page.locator('main, [role="main"]').first().textContent().catch(() => '')) ?? '')
      .replace(/\s+/g, ' ').trim();
    if (/^\s*Laster/i.test(igjen)) {
      record('henger på Laster', `${t}: fortsatt «${igjen.slice(0, 60)}» etter 3 sekunder`, ctxLabel());
    }
  }

  // Sideveis rulling. På telefon betyr det at noe stikker utenfor
  // skjermen — et langt varenavn, en for bred tabell, en knapperad som
  // ikke brytes. Det ser ødelagt ut lenge før det krasjer.
  if (vw <= 500) {
    const overflow = await page.evaluate(() => {
      const d = document.documentElement;
      if (d.scrollWidth <= window.innerWidth + 2) return null;
      // Hvilket element er det som er for bredt? Uten det er funnet
      // umulig å fikse.
      let verst = null;
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.right <= window.innerWidth + 2) continue;
        if (!verst || r.right > verst.right) {
          verst = { right: r.right, tag: el.tagName.toLowerCase(), cls: String(el.className || '').split(' ')[0], txt: (el.textContent || '').trim().slice(0, 40) };
        }
      }
      return { scrollWidth: d.scrollWidth, innerWidth: window.innerWidth, verst };
    }).catch(() => null);
    if (overflow) {
      const v = overflow.verst;
      record('stikker utenfor skjermen',
        `${t}: ${overflow.scrollWidth}px innhold i ${overflow.innerWidth}px skjerm`
        + (v ? ` — verst: ${v.tag}.${v.cls} til x=${Math.round(v.right)} («${v.txt}»)` : ''),
        ctxLabel());
    }
  }

  // Under en profil med feilende nett SKAL det stå noe om at det gikk
  // galt, ikke bare ingenting. Tomme faner fanges over; her sjekkes at
  // appen ikke later som alt er i orden når ingenting ble hentet.
  if (profil.offlineEtterMs && t === 'handel') {
    const sier = /uten nett|ingen forbindelse|kunne ikke|prøv igjen|sist kjente/i.test(inner);
    if (!sier && inner.length < 120) {
      record('taus ved nettfeil', `${t}: verken data eller beskjed («${inner.slice(0, 80)}»)`, ctxLabel());
    }
  }
}

/** Krysser av varer i handlelista, slik en ekte handletur gjør. */
async function kryssAv(page, ctxLabel, vw, vh) {
  let n = 0;
  const bokser = page.locator('button[aria-label^="Plukk "]');
  const antall = await bokser.count().catch(() => 0);
  for (let i = 0; i < Math.min(antall, 6); i += 1) {
    const b = bokser.nth(i);
    if (!(await hittable(b, vw, vh))) continue;
    if (await b.click({ timeout: 1500 }).then(() => true).catch(() => false)) {
      n += 1;
      await page.waitForTimeout(150);
    }
  }
  // Angre igjen på et par — det er der «checked_by» og opptellingen kan
  // komme i utakt.
  const angre = page.locator('button[aria-label^="Angre plukk av "]');
  const a = await angre.count().catch(() => 0);
  for (let i = 0; i < Math.min(a, 2); i += 1) {
    const b = angre.nth(i);
    if (!(await hittable(b, vw, vh))) continue;
    if (await b.click({ timeout: 1500 }).then(() => true).catch(() => false)) { n += 1; await page.waitForTimeout(150); }
  }
  return n;
}

/** Skriver i søkefelt og legger til varer — flyten «oppretter» bruker. */
async function skrivNoe(page, t, ctxLabel, vw, vh) {
  let n = 0;
  const søk = page.locator('input[aria-label="Søk etter vare"], input[aria-label="Søk i tilbud"], input[aria-label="Søk i kokeboka"], input[aria-label="Søk"]').first();
  if (await søk.count().catch(() => 0)) {
    const tekst = pick(['melk', 'egg', 'ost', 'kjøttdeig', 'æøå', 'zzz finnes ikke', '2 kg poteter', '   ', '<b>', '100 %']);
    await søk.fill(tekst).catch(() => {});
    await page.waitForTimeout(400);
    n += 1;
    const legg = page.locator('button[aria-label="Legg til på listen"], button:has-text("Legg til")').first();
    if (await legg.count().catch(() => 0) && await hittable(legg, vw, vh)) {
      if (await legg.click({ timeout: 1500 }).then(() => true).catch(() => false)) { n += 1; await page.waitForTimeout(300); }
    }
    await søk.fill('').catch(() => {});
  }
  return n;
}

/**
 * Åpnet trykket en dialog? Skriv i den, og lukk den igjen.
 * Returnerer true hvis dialogen var en blindvei og runden må starte på nytt.
 */
async function håndterDialog(page, t, label, ctxLabel, vw, vh) {
  const dialog = page.locator('[role="dialog"]').first();
  if (!(await dialog.count().catch(() => 0))) return false;

  const fields = dialog.locator('input[type="text"]:visible, input[type="number"]:visible, input:not([type]):visible, textarea:visible');
  const fn = await fields.count().catch(() => 0);
  if (fn && R() < 0.7) {
    await fields.nth(rnd(fn)).fill(pick([
      'Melk', 'Pølser med lompe', 'ÆØÅ test', '2', '', '   ',
      '-1', '0', '999999', '0,5', '3.7', 'x'.repeat(200), '<script>x</script>',
    ])).catch(() => {});
  }
  const sel = dialog.locator('select:visible');
  const sn = await sel.count().catch(() => 0);
  if (sn && R() < 0.5) {
    const s = sel.nth(rnd(sn));
    const opts = await s.locator('option').count().catch(() => 0);
    if (opts > 1) await s.selectOption({ index: rnd(opts) }).catch(() => {});
  }

  // Av og til LAGRE i stedet for å avbryte. Uten dette ble ingen dialog
  // noen gang sendt inn, og all validering — tomt navn, negativt antall,
  // 200 tegn i et felt — sto utestet.
  if (R() < 0.35) {
    const lagre = dialog.locator('button:has-text("Lagre"), button:has-text("Legg til"), button:has-text("Send"), button:has-text("Opprett")').first();
    if (await lagre.count().catch(() => 0) && await hittable(lagre, vw, vh)) {
      await lagre.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(400);
      const etter = await page.textContent('body').catch(() => '');
      if (CRASH_TEXT.test(etter ?? '')) {
        record('krasj etter lagring', `${t} → «${label}»`, ctxLabel());
        await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
        await page.waitForTimeout(800);
        return true;
      }
    }
  }

  // Lukk. Klarer den ikke det, er dialogen en blindvei.
  const close = dialog.locator(
    'button[aria-label="Lukk"], button:has-text("Avbryt"), '
    + 'button[aria-label="Avslutt butikkmodus"], button:has-text("Ferdig")',
  ).first();
  if (await close.count().catch(() => 0)) await close.click({ timeout: 3000 }).catch(() => {});
  else await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);

  if (await page.locator('[role="dialog"]').count().catch(() => 0) > 0) {
    // Escape er den siste utveien. Klarer heller ikke den det, er
    // brukeren låst inne.
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(300);
    if (await page.locator('[role="dialog"]').count().catch(() => 0) > 0) {
      const navn = await page.locator('[role="dialog"]').first().getAttribute('aria-label').catch(() => null);
      record('dialog uten vei ut', `${t} → «${label}» (dialog: ${navn ?? 'uten navn'})`, ctxLabel());
      await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(800);
      return true;
    }
  }
  return false;
}

function writeReport(rounds, clicks, started, profilTeller) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({
    kjort: new Date().toISOString(),
    runder: rounds,
    trykk: clicks,
    minutter: Number(((Date.now() - started) / 60000).toFixed(1)),
    profiler: Object.fromEntries(profilTeller ?? []),
    funn: [...findings.values()].sort((a, b) => b.count - a.count),
  }, null, 2));
}

main().catch((e) => { console.error('Apekatten falt av:', e); process.exit(1); });
