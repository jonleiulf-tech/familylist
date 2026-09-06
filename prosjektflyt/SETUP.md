# Oppsett – ProsjektFlyt

## 1. Opprett et Supabase-prosjekt

1. Gå til [supabase.com](https://supabase.com) og opprett et nytt prosjekt
   (gratisnivået er nok til å komme i gang).
2. Under **Project Settings → API** finner du:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (kun til `npm run
     seed` og andre server-only skript – del ALDRI denne, og legg den
     ALDRI i klientkode)

## 2. Konfigurer miljøvariabler

```bash
cp .env.example .env.local
```

Fyll inn de tre variablene fra steg 1.

## 3. Kjør databasemigrasjoner

Enklest med Supabase CLI:

```bash
npm install -g supabase
supabase login
supabase link --project-ref <din-project-ref>
supabase db push
```

Alternativt: lim innholdet i `supabase/migrations/0001_init.sql`,
`0002_rls.sql` og `0003_views.sql` inn i SQL-editoren i Supabase Studio, i
den rekkefølgen.

Dette oppretter:

- Alle tabeller (`projects`, `project_members`, `milestones`, `tasks`,
  `time_entries`, `time_entry_participants`, `deliverables`,
  `calendar_events`, `calendar_event_participants`, `activity_log`,
  `profiles`)
- En trigger som oppretter en `profiles`-rad automatisk når noen
  registrerer seg via Supabase Auth
- Row Level Security-policyer på alle tabeller

## 4. Slå på e-post/passord-innlogging

I Supabase Studio: **Authentication → Providers → Email** – sørg for at
den er aktivert. Standardoppsettet i denne appen bruker e-post + passord
(ikke magic link), for enklest mulig oppsett lokalt. "Confirm email" kan
gjerne skrus av i utvikling for å slippe å bekrefte e-post manuelt.

## 5. Installer avhengigheter og start appen

```bash
npm install
npm run dev
```

Åpne [http://localhost:3000](http://localhost:3000) – du sendes til
`/logg-inn`. Opprett en bruker der, eller kjør seed-scriptet under for å få
en ferdig demobruker.

## 6. (Valgfritt) Seed demoprosjekt

```bash
npm run seed
```

Krever `SUPABASE_SERVICE_ROLE_KEY` i `.env.local`. Oppretter:

- Demobruker: `demo@prosjektflyt.no` / `ProsjektFlyt123!`
- Prosjektet «Eksempelprosjekt – nytt kontor» med 5 medlemmer, 9 milepæler
  (inkl. minst én forsinket, én foran plan og én med timeoverskridelse),
  20 oppgaver, flere timeregistreringer (inkl. gruppetid) og
  kalenderhendelser – slik at dashboard, Gantt og analyser er meningsfulle
  ved første innlogging.

## 7. Deploy til Vercel

1. Importer repoet i Vercel, sett **Root Directory** til `prosjektflyt`.
2. Legg til de samme miljøvariablene som i `.env.local`
   (`SUPABASE_SERVICE_ROLE_KEY` trengs kun dersom du kjører
   administrasjonsskript fra Vercel – normal drift trenger den ikke).
3. Deploy.

## Feilsøking

- **"relation does not exist"** – migrasjonene er ikke kjørt, eller kjørt
  i feil rekkefølge. Kjør `0001_init.sql` → `0002_rls.sql` → `0003_views.sql`.
- **Tom prosjektliste etter innlogging** – helt forventet for en ny bruker
  uten prosjekter; klikk «Nytt prosjekt», eller kjør seed-scriptet.
- **RLS-feil ved innsetting** – sjekk at brukeren faktisk er lagt til som
  `project_members`-rad for prosjektet (dette skjer automatisk når du
  oppretter et prosjekt via UI-et, som rolle `owner`).
