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
«Admin») logger styret inn på `/admin` med e-post og redigerer det samme
innholdet i skjemaer: ledere, treningstider, Spond-lenker, partnere,
tekster og tall. Databasen har da forrang; fila er fallback og startpunkt
(«Kopier innholdet fra datafila hit» i admin fyller databasen første gang).

Uansett måte er dette feltene:

| Vil du …                          | Rediger i `src/data/psi.js`                       |
|-----------------------------------|---------------------------------------------------|
| bytte gruppeleder                 | `sports[].leader`                                 |
| endre gruppe-e-post               | `sports[].email`                                  |
| flytte eller legge til treningstid | `sports[].schedule[]` (dag 1–7, `from`, `to`, `venue`) |
| endre Spond-kode eller -lenke     | `sports[].spondCode`, `sports[].spondInviteUrl`   |
| legge inn bilde fra aktiviteten   | `sports[].image` → sti under `public/img/`        |
| endre medlemslenke                | `site.membershipUrl`                              |
| endre felles kontakt              | `site.mainContact`                                |
| oppdatere deltakertall            | `stats.uniqueParticipants` og `stats.asOf`        |
| bytte PSI-leder                   | `organization.leader`                             |
| legge til samarbeidspartner       | `partners[]`                                      |
| legge inn PSI-logo                | `site.logo` → sti under `public/`                 |
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
  ├─ src/lib/content.jsx ... useContent(): fila først, Supabase over hvis satt opp
  ├─ src/pages/ ............ Hjem, Idretter, SportPage (én mal), Treningstider,
  │                          Bli med, Om, Kontakt, Partnere, Stand (QR til utskrift)
  ├─ src/admin/ ............ /admin: skjemaer for styret (krever Supabase)
  ├─ supabase/schema.sql ... tabeller, RLS og første admin. Limes inn i SQL Editor
  ├─ scripts/sitemap.mjs ... sitemap.xml fra rutene (kjøres før build)
  └─ scripts/og-image.mjs .. og-image.png + apple-touch-icon.png fra HTML
```

### Sider

| Sti | Innhold |
|---|---|
| `/` | Hero, fem idrettskort, Spond, «Ny i PSI?», «Savner du en idrett?», kort om PSI, partnere |
| `/idretter`, `/idretter/<slug>` | Liste og én gjenbrukbar idrettsside |
| `/treningstider` | Hele uka fra `weeklySchedule()` |
| `/bli-med` | Fem steg og store Spond-knapper. Målet for den generelle QR-koden |
| `/om`, `/kontakt`, `/partnere` | Struktur, ledere, gruppekontakter, partnere |
| `/stand` | QR-koder til utskrift for stand og plakater (ikke i meny, ikke indeksert) |
| `/admin` | Redigering for styret. Viser en forklaring hvis Supabase ikke er satt opp |
| `/en/…` | Samme sider på engelsk |

### Spond

Spond har ikke et offentlig API for å hente arrangementer fra vanlige grupper.
Siden bruker derfor bare offisielle invitasjonslenker (`spond.com/invite/<kode>`)
og koder, og sier eksplisitt at Spond overstyrer nettsiden ved avvik. QR-koder
genereres i nettleseren fra `spondInviteUrl`, ikke lagret som bilder.
Kommer et offisielt API, er `sports[]` stedet å koble det på.

Ingen Spond-passord, tokens eller medlemsdata finnes i repoet.

### Innholdslaget

Alle sider leser gjennom `useContent()` i `src/lib/content.jsx`. Den starter
med `psi.js` (siden tegnes umiddelbart) og legger databasens rader over hvis
`VITE_SUPABASE_URL` og `VITE_SUPABASE_ANON_KEY` er satt. Tabellene i
`supabase/schema.sql` har samme form som fila: `sports` (én rad per gruppe,
jsonb) og `content` (site, organization, stats, partners). Publikum leser,
bare e-poster i `admins` skriver, håndhevet med Row Level Security.

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

## Det som mangler

- **PSI-logo.** Legg fila i `public/` og sett `site.logo`. Til da vises en tekstmerkelapp.
- **Bilder fra ekte PSI-aktivitet.** Legg dem i `public/img/` og sett `sports[].image`.
  Til da vises en tydelig plassholder. Ikke bruk genererte bilder av «medlemmer».
- **Partnerlogoer.** `partners[].logo`. Til da vises navnet som tekst.
- **Instagram/Facebook.** `site.instagram`, `site.facebook` (vises bare når satt).
- **BEHA Sport** har ingen lenke i data (`url: null`) fordi ingen er oppgitt.
- **Innendørsoppstart for volleyball** er ikke datert i data; teksten sier «fra innendørsoppstart».
