# ProsjektFlyt – arkitektur

Dette dokumentet beskriver domenemodellen, databasen, beregningsreglene,
rutestrukturen og tilgangsstyringen i ProsjektFlyt. Skrevet før
implementering (jf. punkt 36 i kravspesifikasjonen) og oppdatert etter
hvert som modellen har blitt presisert underveis.

## 1. Fra Excel til relasjonell modell

Den opprinnelige Excel-malen har seks faner. De blir IKKE seks separate
tabeller/skjermbilder – de representerer seks domener som kobles sammen
via fremmednøkler:

| Excel-fane        | Domene                          | Tabell(er)                                    |
| ----------------- | -------------------------------- | ---------------------------------------------- |
| Fyll ut tabeller   | Prosjekt-/masterdata              | `projects`, `project_members`, `deliverables`  |
| Fremdriftsplan     | Milepæler og planlegging          | `milestones`                                   |
| TODO               | Operative oppgaver                | `tasks`                                        |
| Timeregistrering   | Faktisk arbeid                    | `time_entries`, `time_entry_participants`      |
| Timeoppsummering   | Analyser og nøkkeltall            | Beregnes dynamisk – ingen egen tabell           |
| Kalender           | Hendelser og koordinering         | `calendar_events`, `calendar_event_participants`|

Se punkt 27 i kravspesifikasjonen for hvilke konkrete Excel-svakheter dette
skjemaet bevisst unngår (radnummer-referanser, "Ikke startet" som teller
"Ferdig", ukenummer uten år, "Student"-navn som gruppeworkaround, osv.).

## 2. Domenemodell (kjerneentiteter)

```
Project 1───* ProjectMember
Project 1───* Milestone
Project 1───* Task ──── (nullable) ──> Milestone
Project 1───* TimeEntry ──(nullable)──> Milestone, Task, Deliverable
TimeEntry *───* ProjectMember  (via TimeEntryParticipant, kun ved participant_mode='selected')
Project 1───* CalendarEvent ──(nullable)──> Milestone, Task
CalendarEvent *───* ProjectMember (via CalendarEventParticipant)
Project 1───* Deliverable
Project 1───* ActivityLog
```

Alle kryssreferanser skjer via UUID-fremmednøkler. `title`/navn er ALLTID
kun visningstekst – aldri en nøkkel noe annet slår opp i (jf. punkt 27G).

### Sentrale enums (`src/types/enums.ts`)

Statusverdier, roller og prioriteter er modellert som `as const`-arrays i
TypeScript (speilet som CHECK-constraints i databasen), ikke Postgres
ENUM-typer. Det gjør det billig å legge til en ny verdi (én migrasjon som
endrer én CHECK-constraint) uten å måtte `ALTER TYPE` en ENUM, som er en
langt mer invasiv operasjon i Postgres.

- `ProjectStatus`: planning → active → on_hold / completed → archived
- `ProjectMemberRole`: owner, admin (prosjektleder), member, viewer
- `MilestoneStatus`: not_started, in_progress, completed, delayed
- `TaskStatus`: not_started, in_progress, blocked, done
- `Priority`: low, medium, high, critical
- `ParticipantMode`: single, selected, all
- `ProjectHealth`: green, yellow, red

## 3. Tid og datoer – de tre viktigste reglene

1. **Varighet lagres alltid som hele minutter** (`time_entries.duration_minutes
   integer`). Aldri desimaltimer. `08:00–12:15` → 255 minutter → vises som
   "4 t 15 min", og kun i analyser konverteres det til desimaltimer (4,25 t).
   Se `src/lib/time/duration.ts`.

2. **Ukenummer avledes alltid fra datoer, aldri lagret rått.** Milepæler
   lagrer `planned_start_date`/`planned_end_date` m.fl. som ekte datoer.
   ISO-8601-uke (mandag som ukestart, korrekt ISO-år) beregnes on-the-fly
   med `src/lib/dates/iso-week.ts`. Dette gjør modellen robust rundt
   nyttår, i motsetning til Excel-malens rå 1–52.

3. **Individuell tid vs. gruppetid er to forskjellige størrelser.**
   - *Session hours*: hvor lenge selve aktiviteten/møtet varte
     (`time_entries.duration_minutes`).
   - *Person-hours / arbeidsinnsats*: session hours × antall deltagere.
   Et møte på 1 time med 3 deltagere gir 1 t session hours, men 3 t
   arbeidsinnsats, og hver deltager får 1 t gruppetid i sin oppsummering.
   Se `src/lib/calculations/hours.ts`.

## 4. Beregningslag (`src/lib/calculations`)

All forretningslogikk for fremdrift/tid bor her, ikke spredt i
React-komponenter. Hver fil har tilhørende `*.test.ts`.

- `milestone.ts` – planlagt/faktisk varighet, planlagt estimert tid
  (`estimated_hours`, evt. `estimated_hours_per_week × planlagt varighet`),
  referansetimer basert på faktisk varighet, avvik (verdi + prosent),
  forsinkelse i dager.
- `gantt.ts` – ren geometri: oversetter planlagt/faktisk periode til
  offset/bredde i "dag-enheter" for en gitt tidslinje, splitter faktisk
  periode i "innenfor plan" og "utover plan", beregner progress-fill og
  today-markør. UI-laget (`GanttChart`) skalerer dette til piksler per
  dag/uke/måned.
- `tasks.ts` – statustelling FRA FAKTISKE VERDIER (ingen av Excel-feilen der
  "Ikke startet" teller med "Ferdig"), forfalt/forfaller-snart-logikk.
- `hours.ts` – session hours vs. person-hours, `summarizeMemberHours()`
  bygger individuell/gruppe/total-fordeling per medlem fra rå TimeEntry-rader.
- `health.ts` – transparent regelmotor for prosjekthelse (grønn/gul/rød)
  med eksplisitte terskler og en forklaringstekst ("Gul – 2 oppgaver er
  forfalt og …") – ingen skjult KI-vurdering.
- `progress.ts`, `milestone-summary.ts`, `weekly-report.ts` – aggregering
  for hhv. prosjektfremdrift, per-milepæl-oppsummeringen og ukesrapporten.

## 5. Database (`supabase/migrations`)

- `0001_init.sql` – tabeller, CHECK-constraints, indekser, `updated_at`-triggere.
- `0002_rls.sql` – Row Level Security. Hjelpefunksjoner
  (`is_project_member`, `project_role`, `is_project_manager`,
  `can_edit_project`) er `security definer` for å unngå rekursive
  RLS-oppslag når policyer selv spør `project_members`.
- `0003_views.sql` – to views (`milestone_logged_minutes`,
  `milestone_task_counts`) for enkel aggregering i SQL der det er naturlig;
  det meste av aggregeringen skjer likevel i `src/lib/calculations` på
  ferske rader hentet fra klienten/serveren, IKKE i materialiserte
  summeringsfelt (jf. punkt 27D).

### Tilgangsmodell

- **Owner/Admin** (prosjektleder): full prosjektstyring, inviterer medlemmer.
- **Member**: kan opprette/redigere milepæler, oppgaver, timeregistreringer,
  kalenderhendelser – kan ikke slette prosjektet eller endre medlemslisten.
- **Viewer**: kun lesetilgang.

Alt håndheves i databasen via RLS (`can_edit_project`,
`is_project_manager`), ikke bare i frontend – en bruker kan aldri hente
data fra et prosjekt de ikke er medlem av.

## 6. Rutestruktur (Next.js App Router)

```
/logg-inn                                   – innlogging/registrering
/prosjekter                                 – prosjektliste + opprett
/prosjekter/[projectId]/oversikt            – Dashboard
/prosjekter/[projectId]/fremdrift           – Milepæler + Gantt
/prosjekter/[projectId]/oppgaver            – TODO (liste/kanban/mine)
/prosjekter/[projectId]/timer               – Timeføring + oppsummeringer
/prosjekter/[projectId]/kalender            – Måned/uke/agenda
/prosjekter/[projectId]/team                – Medlemmer + per-person timer
/prosjekter/[projectId]/team/[memberId]     – Personens aktivitet
/prosjekter/[projectId]/rapporter           – Analyser + ukesrapport
/prosjekter/[projectId]/innstillinger       – Prosjektinnstillinger
```

`src/app/prosjekter/[projectId]/layout.tsx` henter prosjekt, medlemmer og
milepæler én gang og rendrer sidemeny + topplinje (med globale
hurtighandlinger "Registrer tid"/"Oppgave", tilgjengelig fra hele
prosjektet, jf. punkt 32).

## 7. Kodestruktur

```
src/
  app/                     – Next.js-ruter (kun sideoppsett + datainnhenting)
  components/ui/           – Designsystem-primitiver (shadcn-stil, lokalt eid)
  components/layout/       – Sidemeny, topplinje
  features/<domene>/       – Skjemaer, dialoger, klientkomponenter per domene
  lib/calculations/        – All beregningslogikk (rene funksjoner, testet)
  lib/dates/               – ISO-uke og datohjelpere
  lib/time/                – Minutt-/timekonvertering
  lib/supabase/            – Browser-/server-klienter
  lib/data/                – Datahenting (server-side Supabase-spørringer)
  types/                   – Enums + databaserad-typer
```

Business-logikk ligger ALDRI i `page.tsx` – sidene henter data og delegerer
beregning til `lib/calculations` og presentasjon til `features/*`.

## 8. Internasjonalisering

UI-teksten er på norsk bokmål, men er ikke hardkodet med tanke på i18n:
alle labels for enums ligger i egne `*_LABELS`-oppslag i
`src/types/enums.ts`, og dato/tid-formatering går via
`src/lib/utils/format.ts` (dd.MM.yyyy, HH:mm, `date-fns` med `nb`-locale).
Å bytte til flerspråklig UI senere er en avgrenset jobb: bytt ut disse
oppslagene med et i18n-bibliotek uten å røre datamodell eller
beregningslag.

## 9. Kjente forenklinger i denne MVP-versjonen

Dokumentert bevisst, ikke glemt:

- **Invitasjoner** oppretter en "pending" `project_members`-rad
  (`invited_email` satt, `user_id` null). Reelt e-post-utsendt
  invitasjonslenke og automatisk kobling ved registrering er ikke
  implementert ennå – neste steg er en Supabase Edge Function som sender
  e-post og kobler `user_id` ved første innlogging med samme adresse.
- **Excel-import** (punkt 18) og **PDF/Excel-eksport** (punkt 19) er ikke
  implementert i denne versjonen – jf. prioriteringsrekkefølgen i punkt 31,
  der kjeden Prosjekt→Team→Milepæl→TODO→Timeføring→Dashboard→Gantt→Kalender
  skulle stå ferdig først. Datamodellen (fremmednøkler, ikke
  radnummer-referanser) er lagt opp slik at en importer trygt kan skrive
  rett inn i de samme tabellene.
- **Ukesrapport-generering** er implementert som ren datauttrekk
  (`generateWeeklyReport`), uten språkmodell-forbedret tekst – i tråd med
  punkt 17 ("ikke bruk AI i første versjon dersom det ikke trengs").
