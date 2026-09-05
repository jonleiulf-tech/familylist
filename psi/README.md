# psiusn.no – PSI, Porsgrunn Studentidrettslag

Nettsiden til PSI: studentidrett ved USN Campus Porsgrunn, i dag en del av
Studentsamfunnet i Grenland (SiG). Siden er inngangen; **Spond er fasiten**
for treninger, påmelding og endringer uke for uke.

Domene: **https://psiusn.no** · Hosting: Vercel · Innhold fra én datafil, med valgfri
Supabase-admin for styret.

---

## Skal du endre noe? To måter, samme innhold.

**A. Datafila (standard).** `src/data/psi.js` inneholder alt innhold som kan
endres. Rediger, `npm test`, push. Vercel publiserer.

**B. Admin i nettleseren (valgfritt).** Med Supabase koblet til (se SETUP.md,
«Admin») logger styret og gruppelederne inn på `/admin` og redigerer i
skjemaer: grupper, treningstider, Spond-lenker, nyheter, arrangementer,
bilder, partnere, tekster og tilgang. Rollene *PSI-admin*, *Gruppeleder* og
*Gruppemedlem* styrer hvem som får gjøre hva, håndhevet i databasen.
Databasen har da forrang; fila er fallback og startpunkt
(«Innstillinger → Verktøy → Kopier innholdet fra datafila hit» første gang).
Nyheter, kalender og bilder finnes bare i databasen; uten Supabase er de
seksjonene bare borte fra sidene.

Uansett måte er dette feltene:

| Vil du …                          | Rediger i `src/data/psi.js`                       |
|-----------------------------------|---------------------------------------------------|
| bytte gruppeleder                 | `sports[].leader`                                 |
| endre gruppe-e-post               | `sports[].email`                                  |
| flytte eller legge til treningstid | `sports[].schedule[]` (dag 1–7, `from`, `to`, `venue`) |
| endre Spond-kode eller -lenke     | `sports[].spondCode`, `sports[].spondInviteUrl`   |
| legge inn bilde fra aktiviteten   | original i `assets/source-images/<slug>/`, `npm run images`, så `sports[].image` og `imageAlt` |
| bytte idrettsmerket på kortet     | `sports[].glyph` → fil i `public/images/sports/` |
| endre medlemslenke                | `site.membershipUrl`                              |
| endre felles kontakt              | `site.mainContact`                                |
| oppdatere deltakertall            | `stats.uniqueParticipants` og `stats.asOf`        |
| bytte PSI-leder                   | `organization.leader`                             |
| legge til samarbeidspartner       | `partners[]` (`url`, `logo`, `status`)            |
| endre sosiale kanaler             | `site.social.instagram` / `site.social.facebook` (url, owner, isDedicatedPsiAccount) |
| bytte PSI-logo                    | `site.logo`, `site.logoOnLight`, `site.emblem` → filer i `public/logo/` |
| markere nytt semester             | `site.currentSemester`, `site.lastUpdated`        |

Tekst som vises til brukeren står på begge språk: `{ nb: '…', en: '…' }`.
Fakta (koder, e-post, tider) står én gang. Alle sider leser herfra, så ingenting
er duplisert: treningstidene på forsiden, på `/treningstider` og på hver
idrettsside kommer fra samme `schedule`-liste.

Faste knappetekster og overskrifter ligger i `src/i18n/strings.js`.

Etter en endring: `npm test` sjekker at de fem gruppene, lederne, e-postene og
Spond-kodene fortsatt stemmer med spesifikasjonen, og at tidene er gyldige.
Push til `main`, så bygger Vercel og publiserer.

---

## Kom i gang lokalt

```bash
npm install
npm run dev        # http://localhost:5174
npm test           # datavalidering + enhetstester
npm run build      # produksjonsbuild til dist/ (lager også sitemap.xml)
npm run og:image   # regenerer delingsbildet (krever playwright)
npm run images     # lager responsive WebP/JPG av originalbilder (krever sharp)
npm run icons      # regenerer favicon-settet fra logoen (krever sharp)
```

---

## Arkitektur

```
React + Vite, statisk (SPA med History-ruter, ingen avhengigheter utover React og qrcode)
  ├─ src/data/psi.js ....... ALT redigerbart innhold (se over)
  ├─ src/i18n/strings.js ... faste UI-tekster, nb + en
  ├─ src/lib/router.jsx .... ruter; /en/… gir engelsk, / gir norsk
  ├─ src/lib/i18n.jsx ...... språkkontekst og t()-hjelper for {nb,en}-felt
  ├─ src/components/ ....... Nav, Footer, Spond-CTA med QR, kort, steg, partnere
  ├─ public/images/sports/ . idrettsmerkene, klippet ut av PSI-seglet
  ├─ public/images/partners/ partnerlogoer (SiG og USN inne, tre mangler)
  ├─ src/lib/content.jsx ... useContent(): fila først, Supabase over hvis satt opp
  ├─ src/pages/ ............ Hjem, Idretter, SportPage (én mal), Treningstider,
  │                          Bli med, Om, Kontakt, Partnere, Stand (QR til utskrift)
  ├─ src/lib/calendar.js ... treninger + arrangementer → agenda og ICS (ren, testet)
  ├─ scripts/spond_sync.py . valgfri synk fra Spond (GitHub Actions, ikke nettleser)
  ├─ src/admin/ ............ /admin: arbeidsflate for styret og gruppeledere (krever Supabase)
  ├─ api/kalender/ ......... /api/kalender/<gruppe>.ics: kalenderabonnement (Vercel-funksjon)
  ├─ supabase/schema.sql ... content, sports, RLS. Limes inn i SQL Editor
  ├─ supabase/schema-v2.sql  roller (members), news, events, media, bucket «media»
  ├─ supabase/schema-v3.sql  Spond-synk: source/external_id, hidden_by_admin, sync_runs
  ├─ scripts/sitemap.mjs ... sitemap.xml fra rutene (kjøres før build)
  └─ scripts/og-image.mjs .. og-image.png + apple-touch-icon.png fra HTML
```

### Sider

| Sti | Innhold |
|---|---|
| `/` | Hero, fem idrettskort, Spond, «Ny i PSI?», «Savner du en idrett?», kort om PSI, partnere |
| `/idretter`, `/idretter/<slug>` | Liste og én gjenbrukbar idrettsside |
| `/treningstider` | Hele uka fra `weeklySchedule()` |
| `/kalender` | Kommende treninger og arrangementer med filter per gruppe, ukeplan, og abonnement (ICS) |
| `/nyheter`, `/nyheter/<slug>` | Nyheter fra admin, for hele PSI eller én gruppe |
| `/bli-med` | Fem steg og store Spond-knapper. Målet for den generelle QR-koden |
| `/om`, `/kontakt`, `/partnere` | Struktur, ledere, gruppekontakter, partnere |
| `/stand` | QR-koder til utskrift for stand og plakater (ikke i meny, ikke indeksert) |
| `/admin/…` | Arbeidsflate for styret og gruppeledere. Viser en forklaring hvis Supabase ikke er satt opp |
| `/api/kalender/<psi\|fotball\|fotball+klatring>.ics` | Kalenderabonnement. `?type=match,event`, `?lang=en` |
| `/en/…` | Samme sider på engelsk |

### Spond

Spond har ikke et offentlig API for å hente arrangementer fra vanlige grupper.
Siden bruker derfor bare offisielle invitasjonslenker (`spond.com/invite/<kode>`)
og koder, og sier eksplisitt at Spond overstyrer nettsiden ved avvik. QR-koder
genereres i nettleseren fra `spondInviteUrl`, ikke lagret som bilder.
Kommer et offisielt API, er `sports[]` stedet å koble det på.

Ingen Spond-passord, tokens eller medlemsdata finnes i repoet.

**Valgfri synk.** `psi/scripts/spond_sync.py` kan speile arrangementene fra
Spond inn i `events` (kjøres av `.github/workflows/psi-spond-sync.yml`, hver
time). Den bruker det uoffisielle biblioteket
[spond](https://pypi.org/project/spond/) mot Sponds interne API, med PSIs egen
konto, og leser bare tittel, tid, sted og avlyst — `to_event_row()` bygger
raden fra en hviteliste, så persondata kan ikke lekke inn ved et uhell.
Rader merkes `source='spond'` og `external_id`, så neste kjøring oppdaterer i
stedet for å duplisere, og de er skrivebeskyttet i admin.

Har en gruppe et Spond-arrangement en dag, skjules den genererte treningen fra
grunnskjemaet den dagen (og tas ut av ICS med `EXDATE`), så uka ikke vises
dobbelt. Slutter biblioteket å virke, står nettsiden på grunnskjemaet og det
styret har lagt inn selv. Oppsett og forbehold: `SETUP.md`, «Spond-synk».

### Innholdslaget

Alle sider leser gjennom `useContent()` i `src/lib/content.jsx`. Den starter
med `psi.js` (siden tegnes umiddelbart) og legger databasens rader over hvis
`VITE_SUPABASE_URL` og `VITE_SUPABASE_ANON_KEY` er satt. Tabellene i
`supabase/schema.sql` har samme form som fila: `sports` (én rad per gruppe,
jsonb) og `content` (site, organization, stats, partners). `schema-v2.sql`
legger til `members` (roller), `news`, `events`, `media` og visningen
`public_board`. Publikum leser det som er publisert; skriving styres av
rollene i `members`, håndhevet med Row Level Security.

Skulle Spond få et offisielt API, er `sports[]` stedet å koble det på.

---

## Design

Mørk bunn (`--black`), krem innholdsflate (`--cream`), oransje aksent
(`--orange`), teal sekundært (`--teal`). Barlow Condensed i overskrifter,
Barlow i brødtekst. Tokens i `src/styles/tokens.css`, alt annet i `base.css`.
Bruk variablene, ikke hex.

Knapper er minst 48 px høye. Siden er mobil først: QR-koder vises bare på
brede skjermer og på `/stand`, på mobil er «Bli med i Spond»-knappen det viktige.

---

## Flytte PSI til eget repo

PSI ligger i dag som mappa `psi/` i et repo som også inneholder et annet
prosjekt. Det er en praktisk ordning mens siden bygges, ikke en binding.
Skal PSI overta selv, flyttes mappa ut med hele historikken sin:

```bash
# 1. I dette repoet: løft psi/ ut som en egen branch der psi/ blir rota
git subtree split -P psi -b psi-only

# 2. Lag et tomt repo hos PSI, f.eks. github.com/psiusn/psiusn.no
#    (uten README, uten .gitignore)

# 3. Push historikken dit
git push git@github.com:psiusn/psiusn.no.git psi-only:main

# 4. Klon det nye repoet og sjekk at alt virker
git clone git@github.com:psiusn/psiusn.no.git && cd psiusn.no
npm install && npm test && npm run build
```

Alle commits følger med, og filene ligger i rota i stedet for under `psi/`.

I Vercel: **Settings → Git** → koble prosjektet til det nye repoet, og sett
**Root Directory** tilbake til tom (rota). Domenet psiusn.no følger prosjektet
og trenger ingen endring. Ingenting i koden peker utenfor mappa, så det kreves
ingen kodeendring.

Til slutt kan `psi/` slettes fra det gamle repoet.

---

## Det som mangler

- **Bilder fra ekte PSI-aktivitet.** Ingen er lagt inn ennå. Til da tegner siden
  et PSI-panel per gruppe: idrettsmerket klippet ut av PSIs eget segl, på mørk
  flate med seglet som stempel. Det er PSIs eget materiell, ikke stock og ingen
  oppdiktede personer, og de fem panelene leses som én identitet.
  Når ekte foto kommer: legg originalen i `assets/source-images/<slug>/`, kjør
  `npm run images`, og sett `sports[].image`. Panelet forsvinner automatisk.
  Kildene PSI har pekt på er `PSI_Host_2026_treningstider_og_aktiviteter1.pdf`
  s. 4–7 og `Søknad høst 2026 - PSI.pdf` s. 2. Ingen verifisert SiGRUN-foto finnes.
- **Partnerlogoer.** SiG (`sig.svg`, hvit på svart) og USN (`usn.png`) er på plass.
  SSN, BEHA Sport og Høyt Under Taket mangler fortsatt; kortene viser navnet som tekst
  til offisielle filer legges i `public/images/partners/` (se README der).
- **Egne PSI-kontoer på Instagram/Facebook.** Finnes ikke verifisert. Siden lenker til
  SiG sine kanaler og sier det tydelig. Får PSI egne: bytt `url`, `owner` og sett
  `isDedicatedPsiAccount: true` i `site.social`.
- **Innendørsoppstart for volleyball** er ikke datert i data; teksten sier «fra innendørsoppstart».
