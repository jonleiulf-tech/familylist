# ProsjektFlyt

Enkel, rask og visuelt oversiktlig prosjektkoordinering for små og
mellomstore prosjekter – erstatter en Excel-basert prosjektmal (milepæler,
Gantt, TODO, timeføring, timeoppsummering, kalender) med en normalisert
relasjonell webapplikasjon der informasjon registreres én gang og
gjenbrukes overalt.

> Dette er et frittstående delprosjekt i dette repoet (`prosjektflyt/`),
> uavhengig av resten av innholdet i repoet.

Se [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for domenemodell,
databaseskjema, beregningsregler og rutestruktur. Se [`SETUP.md`](SETUP.md)
for hvordan du setter opp Supabase og kjører appen lokalt.

## Teknologi

- Next.js 14 (App Router) + TypeScript (strict mode)
- Tailwind CSS + egne shadcn/ui-stil-primitiver (ingen tung ekstern
  komponent-avhengighet)
- Supabase (PostgreSQL, Auth, Row Level Security)
- Zod + React Hook Form for skjemavalidering
- date-fns (norsk locale, ISO-8601-uker)
- Recharts for de få grafene som faktisk gir verdi
- Egen, lettvekts Gantt-komponent (ingen kommersiell Gantt-pakke)
- Vitest for enhetstester av all forretningslogikk

## Kom i gang

```bash
npm install
cp .env.example .env.local   # fyll inn Supabase-nøkler, se SETUP.md
npm run dev
```

Kjør migrasjonene i `supabase/migrations/` mot ditt Supabase-prosjekt
(`supabase db push` eller lim inn i SQL-editoren), og kjør deretter
`npm run seed` for å opprette demoprosjektet «Eksempelprosjekt – nytt
kontor» med realistiske data (5 medlemmer, 9 milepæler i ulike
fremdriftstilstander, 20 oppgaver, timeregistreringer og
kalenderhendelser).

## Kommandoer

| Kommando            | Beskrivelse                                      |
| -------------------- | ------------------------------------------------- |
| `npm run dev`         | Start utviklingsserver                             |
| `npm run build`       | Produksjonsbygg                                   |
| `npm run lint`        | ESLint                                             |
| `npm run typecheck`   | `tsc --noEmit`                                     |
| `npm test`            | Kjør alle enhetstester (Vitest)                    |
| `npm run seed`        | Opprett demoprosjekt (krever service-rolle-nøkkel) |

## Status – MVP-kjeden (punkt 31/37 i kravspesifikasjonen)

Den vertikale kjeden Prosjekt → Team → Milepæl → TODO → Timeføring →
Dashboard/Timeoppsummering → Gantt → Kalender er implementert mot ekte
database (Supabase/PostgreSQL + RLS), ikke mock-state. Excel-import og
PDF/Excel-eksport er bevisst utsatt til etter denne kjeden, se
"Kjente forenklinger" i ARCHITECTURE.md.
