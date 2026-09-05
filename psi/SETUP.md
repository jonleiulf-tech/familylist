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

## 7. Admin for styret (valgfritt)

Med dette kan styret redigere ledere, treningstider, Spond-lenker, partnere,
tekster og tall i et skjema på `psiusn.no/admin`, uten å røre kode. Alt ligger
innenfor Supabases gratisnivå.

1. [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
   Region **Europe (Frankfurt)** eller **Stockholm**. Ta vare på databasepassordet.
2. **SQL Editor** → lim inn hele `supabase/schema.sql` → **Run**.
   Bytt først ut `leder@sig.no` nederst i fila med e-posten til den som skal være
   første admin, eller kjør etterpå:
   ```sql
   insert into public.admins (email) values ('navn@student.usn.no');
   ```
3. **Authentication → URL Configuration**: Site URL `https://psiusn.no`,
   Redirect URLs `https://psiusn.no/admin` (og `http://localhost:5174/admin` for lokal utvikling).
4. **Project Settings → API**: kopier **Project URL** og **anon public**-nøkkelen.
5. Vercel → prosjektet → **Settings → Environment Variables**:
   | Navn | Verdi |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | anon-nøkkelen |
   Deploy på nytt (Deployments → ⋯ → Redeploy). Nøklene er trygge i frontend;
   Row Level Security i `schema.sql` er det som styrer tilgang.
6. Gå til `psiusn.no/admin`, skriv inn e-posten, klikk lenken i e-posten.
7. Under **Idretter** står det at databasen er tom: klikk
   **«Kopier innholdet fra datafila hit»**. Fra nå har databasen forrang, og
   `src/data/psi.js` er fallback og startpunkt.
8. **Tilgang**: legg til e-postene til resten av styret.

E-post fra Supabase: gratisnivået sender fra en generisk avsender med lav
ratebegrensning. Det holder for et styre på fem. Vil dere sende fra
`@psiusn.no`, sett opp egen SMTP (f.eks. Resend) under
**Authentication → SMTP Settings**.

Slår dere admin av igjen (fjerner miljøvariablene), går siden tilbake til
datafila uten andre endringer.

## 8. Hvis strukturen endres senere

Blir PSI organisert annerledes, er dette stedene som beskriver dagens forhold til SiG:

- `src/data/psi.js` → `organization.currentRelationToSiG`, `organization.parent`, `site.membershipUrl`
- `src/i18n/strings.js` → `membership.body`, `membership.priority`, `newHere.steps`, `join.steps`
- `src/pages/About.jsx` → teksten `ABOUT`
- `index.html` → `parentOrganization` i JSON-LD

Ingenting annet på siden antar noe om organisasjonsformen. Med admin slått på
redigeres de samme tekstene under «Innstillinger og tekster».
