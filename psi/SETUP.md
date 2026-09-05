# Oppsett: Vercel + psiusn.no

Framgangsmåte fra repo til kjørende side. Regn med 15 minutter for selve siden.
Steg 1–5 trenger ingen database og ingen miljøvariabler. Steg 7 (admin) er
valgfritt og legger til 15 minutter.

## 1. Vercel-prosjekt

1. [vercel.com](https://vercel.com) → **Add New → Project** → velg dette repoet.
2. Ligger nettsiden i undermappen `psi/`, sett **Root Directory** til `psi`.
3. Framework: **Vite**. Build: `npm run build`. Output: `dist`. (Standard er riktig.)
4. Deploy. Du får en `*.vercel.app`-adresse med én gang.

`vercel.json` sørger for at alle stier går til `index.html` (SPA-ruting) og
setter sikkerhets- og cache-headere.

## 2. Domenet psiusn.no

1. Vercel → prosjektet → **Settings → Domains** → legg til `psiusn.no` og `www.psiusn.no`.
2. Hos registraren (Domeneshop eller der domenet ligger) legger du inn det Vercel
   viser: enten en `A`-post til Vercels IP og `CNAME` for `www`, eller bytt navnetjenere
   til Vercel.
3. La `www` videresende til `psiusn.no` (Vercel tilbyr det i samme skjerm).
4. HTTPS kommer av seg selv når DNS-en er på plass.

## 3. Etter første deploy

- Åpne `https://psiusn.no/bli-med` på mobil. Det er siden QR-koden på plakater skal peke til.
- Åpne `https://psiusn.no/stand` på en PC og skriv ut. Der ligger QR-kodene.
- Del `https://psiusn.no` i en melding og sjekk at delingskortet (bildet) dukker opp.
- Send `https://psiusn.no/sitemap.xml` til Google Search Console når dere vil.

## 4. Redigere innhold

Alt står i **`src/data/psi.js`**. Se tabellen i README. Arbeidsgang:

```bash
git pull
# rediger src/data/psi.js
npm test          # sier fra hvis noe er inkonsistent
git commit -am "Ny treningstid for volleyball"
git push          # Vercel bygger og publiserer på under et minutt
```

Har du ikke utviklingsmiljø: rediger fila rett i GitHub (blyantikonet), lagre
med en beskrivende melding, så bygger Vercel.

## 5. Regenerere delingsbildet

Delingsbildet (`public/og-image.png`) er tegnet fra HTML med tekst fra datafila.
Endrer dere slagord eller idretter:

```bash
npm i -D playwright && npx playwright install chromium   # én gang
npm run og:image
```

## 7. Admin for styret og gruppelederne (valgfritt)

Med dette redigerer styret og gruppelederne alt innhold i et skjema på
`psiusn.no/admin`, uten å røre kode: grupper, treningstider, nyheter,
arrangementer, bilder, partnere, tekster og hvem som har tilgang. Alt ligger
innenfor Supabases gratisnivå.

1. [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
   Region **Europe (Frankfurt)** eller **Stockholm**. Ta vare på databasepassordet.
2. Kjør migrasjonene (se «Databasen fra PowerShell» under — `npm run db`),
   eller lim inn filene i `supabase/migrations/` i rekkefølge i **SQL Editor → Run**.
   Bytt først ut `jon.l.leiulfsrud@usn.no` nederst i `0001_grunnlag.sql` med e-posten til den som
   skal være første PSI-admin, eller kjør etterpå:
   ```sql
   insert into public.members (email, role, title) values ('navn@student.usn.no', 'psi_admin', 'Leder, PSI');
   ```
3. **Authentication → URL Configuration**: Site URL `https://psiusn.no`,
   Redirect URLs `https://psiusn.no/admin` (og `http://localhost:5174/admin` for lokal utvikling).
4. **Project Settings → API**: kopier **Project URL** og **anon public**-nøkkelen.
5. Vercel → prosjektet → **Settings → Environment Variables** (type *Config*, ikke Secret):
   | Navn | Verdi |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | anon-nøkkelen |
   Deploy på nytt (Deployments → ⋯ → Redeploy). Nøklene er trygge i frontend;
   Row Level Security i SQL-filene er det som styrer tilgang. De samme to
   variablene brukes av `api/kalender/[slug].js` (kalenderabonnementet).
6. Gå til `psiusn.no/admin`, logg inn med e-post (lenke eller passord).
7. **Innstillinger → Verktøy**: klikk **«Kopier innholdet fra datafila hit»**
   første gang. Fra nå har databasen forrang, og `src/data/psi.js` er reserve.
8. **Tilgang**: gi resten av styret rollen *PSI-admin*, og gruppelederne rollen
   *Gruppeleder* på sin gruppe. De logger inn med sin egen e-post.

### Roller

| Rolle | Kan |
|---|---|
| PSI-admin | alt: alle grupper, nyheter, kalender, bilder, partnere, tekster, tilgang |
| Gruppeleder | sin gruppe: info, treningstider, nyheter, arrangementer, bilder, folk i gruppa |
| Gruppemedlem | logge inn og se, ikke endre |

Rollene håndheves i databasen (RLS), ikke bare i grensesnittet.

### Kalenderabonnement

`https://psiusn.no/api/kalender/psi.ics` gir hele PSI, `…/fotball.ics` én
gruppe, `…/fotball+klatring.ics` flere. `?type=match,event` filtrerer på type,
`?lang=en` gir engelsk. Treninger kommer fra grunnskjemaet på gruppene,
arrangementer fra kalenderen i admin. Publikum finner lenkene under
«Abonner» på `/kalender`.

### Bilder

Lastes opp under Bilder (maks 30 per gruppe, og 30 felles). Originalen
lagres urørt til trykk og SoMe, nettsiden får en nedskalert WebP laget i
nettleseren. Nye bilder er skjult til noen huker av «Vis i galleri»,
«Vis på forsiden» eller «Bruk som gruppebilde».

E-post fra Supabase: gratisnivået sender fra en generisk avsender med lav
ratebegrensning. Det holder for et styre på fem. Vil dere sende fra
`@psiusn.no`, sett opp egen SMTP (f.eks. Resend) under
**Authentication → SMTP Settings**.

Slår dere admin av igjen (fjerner miljøvariablene), går siden tilbake til
datafila uten andre endringer.

## 7b. Spond-synk (valgfritt)

Uten dette skriver dere kamper og arrangementer inn selv under Kalender, og
treningstidene kommer fra grunnskjemaet på hver gruppe. Det holder lenge.

Med dette henter en jobb i GitHub Actions arrangementene fra Spond hver time,
så nettsiden viser det som faktisk står i Spond.

**Før dere setter det opp, les dette.** Spond har ikke et offentlig API.
Jobben bruker [pypi.org/project/spond](https://pypi.org/project/spond/), som
snakker med det interne API-et deres. Det betyr tre ting:

- Det kan slutte å virke uten forvarsel. Da står nettsiden på grunnskjemaet
  og det dere har lagt inn selv — ingenting går tapt, og siden går ikke ned.
- Det er sannsynligvis i strid med Sponds vilkår. PSI må ta det valget selv.
- Det krever at en Spond-innlogging ligger som hemmelighet i GitHub. Bruk en
  **egen PSI-konto** som er medlem i gruppene, aldri din private konto, og
  gi den ikke mer tilgang i Spond enn den trenger.

Jobben leser **tittel, tid, sted og avlyst** fra arrangementer, og **teksten**
fra vegginnlegg. Aldri medlemmer, svar, oppmøte, betaling, kommentarer eller
meldinger — se `to_event_row()` og `to_news_row()` i
`psi/scripts/spond_sync.py`, som bygger radene fra en hviteliste, og testene
`test_tar_aldri_med_persondata` og `test_tar_aldri_med_kommentarer_eller_personer`.

### Hvilken konto?

Lag en **egen PSI-konto** i Spond og få den lagt til i alle fem gruppene,
i stedet for å bruke din private. Tre grunner: passordet ditt skal ikke ligge
i GitHub, synken skal ikke slutte å virke den dagen du gir deg i PSI, og
neste styre skal kunne overta uten å be deg om noe.

### Innlegg fra Spond-veggene

Innleggene blir nyheter på psiusn.no. De kommer inn som **utkast**, ikke
publisert: et innlegg skrevet til en lukket gruppe er ikke alltid ment for
åpen nett — navn, telefonnummer, Vipps-beløp, interne planer. Noen i styret
leser gjennom, retter det som ikke passer, og trykker publiser.

Vil dere heller ha alt rett ut, skru på **«Publiser dem automatisk»** under
Innstillinger → Spond. Da bør noen se over nyhetslista jevnlig.

Så snart et innlegg er publisert, rører ikke synken teksten igjen — har noen
strøket noe, blir det stått. Utkast som ingen har tatt i, oppdateres fra Spond
til de blir publisert. Slettes et innlegg i Spond, ryddes utkastet bort, mens
publiserte innlegg blir stående.

### Oppsett

1. **Supabase → SQL Editor**: kjør `psi/supabase/migrations/0003_spond_arrangementer.sql`, og
   `psi/supabase/migrations/0004_spond_innlegg.sql` hvis dere også vil ha vegginnleggene.
2. **Supabase → Project Settings → API**: kopier `service_role`-nøkkelen.
   Den går utenom alle tilgangsregler, så den skal **bare** ligge i GitHub
   Secrets — aldri i Vercel, aldri i koden, aldri i en e-post.
3. **GitHub → repoet → Settings → Secrets and variables → Actions**, fire stykker:
   | Navn | Verdi |
   |---|---|
   | `SPOND_USERNAME` | e-posten til PSIs Spond-konto |
   | `SPOND_PASSWORD` | passordet til den kontoen |
   | `PSI_SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `PSI_SUPABASE_SERVICE_ROLE_KEY` | service_role-nøkkelen |
4. **GitHub → Actions → «PSI – Spond-synk» → Run workflow**. Kryss av for
   «Bare vis hva som ville blitt skrevet» første gang, og se på loggen.
5. Gå til `/admin` → **Innstillinger → Spond**. Der ligger gruppene
   PSI-kontoen er medlem av, med ID. Kopier ID-en og lim den inn på riktig
   PSI-gruppe under **gruppa → Info → Spond → Spond-gruppe-ID**.
6. Kjør workflowen igjen uten tørrkjøring. Arrangementene dukker opp i
   Kalender, merket **Spond**.

Uten hemmelighetene hopper jobben pent over, så den blir ikke rød for andre
som forker repoet.

### Etterpå

- Arrangementer fra Spond kan ikke redigeres i admin — endre dem i Spond, så
  følger nettsiden etter innen en time. Enkeltposter kan skjules med «Skjul på
  nettsiden».
- Har en gruppe et Spond-arrangement en dag, skjules den genererte treningen
  fra grunnskjemaet den dagen, så uka ikke vises dobbelt. Det gjelder også i
  kalenderabonnementet (`EXDATE`).
- Slettes noe i Spond, forsvinner det fra nettsiden ved neste kjøring.
- Vil dere slutte: fjern `spondGroupId` fra gruppene («Koble fra» under
  Innstillinger → Spond), eller slett hemmelighetene i GitHub.

## 7c. Databasen fra PowerShell

Slipp å lime SQL inn i nettleseren. All SQL ligger i `psi/supabase/migrations/`
og kjøres i rekkefølge av ett skript.

**Én gang:**

```powershell
cd C:\...\familylist\psi
npm install
.\scripts\db.ps1 -SaveToken
```

Skriptet ber om et personlig tilgangstoken fra
[supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens)
(Generate new token → kopier verdien som starter med `sbp_`). Det lagres i
`C:\Users\<deg>\.psiusn\supabase-token.txt`, altså utenfor repoet, og blir
aldri pushet. Det er ikke det samme som anon-nøkkelen eller service_role.

**Etter det:**

```powershell
npm run db:status     # hva er kjørt, hva gjenstår
npm run db            # kjør det som gjenstår
```

Skriptet husker hva som er kjørt i tabellen `public.schema_migrations` og gjør
bare resten. Alle filene tåler å kjøres om igjen, så har du allerede limt inn
noen for hånd, skjer det ingenting galt — de blir bare notert som ferdige.

Flere valg: `-Status` (bare vis), `-DryRun` (ikke skriv noe), `-Force` (kjør
alle på nytt), `-Ref <prosjekt-id>` (annet prosjekt).

Feiler tilkoblingen, sier skriptet fra hva som er galt, og den gamle måten
virker fortsatt: åpne SQL Editor og lim inn filene i rekkefølge.

### Den vanlige arbeidsdagen

Selve nettsiden trenger ingen kommandoer i det hele tatt — `git push` er alt,
Vercel bygger og publiserer av seg selv:

```powershell
cd C:\...\familylist\psi
npm run dev            # se endringene lokalt på http://localhost:5174
npm test               # 66 tester
cd ..
git add .
git commit -m "Beskriv hva du endret"
git push
```

Nye SQL-filer legges i `psi/supabase/migrations/` med neste nummer
(`0005_…`, `0006_…`) og kjøres med `npm run db`.

## 8. Hvis strukturen endres senere

Blir PSI organisert annerledes, er dette stedene som beskriver dagens forhold til SiG:

- `src/data/psi.js` → `organization.currentRelationToSiG`, `organization.parent`, `site.membershipUrl`
- `src/i18n/strings.js` → `membership.body`, `membership.priority`, `newHere.steps`, `join.steps`
- `src/pages/About.jsx` → teksten `ABOUT`
- `index.html` → `parentOrganization` i JSON-LD

Ingenting annet på siden antar noe om organisasjonsformen. Med admin slått på
redigeres de samme tekstene under «Innstillinger og tekster».
