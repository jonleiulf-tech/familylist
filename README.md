# FamilyList

Norsk handleliste- og middagsplanlegger for én familie. Lærer familiens
handlemønster fra kvitteringer, henter priser fra Kassalapp, planlegger
middager med familietilpassede mengder, og synker mellom to enheter i sanntid.

Kjører på Supabase (gratisnivå) + statisk hosting. **Oppsett: se [SETUP.md](SETUP.md).**

---

## Arkitektur

```
React + Vite (statisk hosting)
  ├─ Supabase Auth ....... magic link, profil med visningsnavn
  ├─ Supabase Postgres ... alle tabeller, RLS på household_id
  ├─ Supabase Realtime ... shopping_items, custom_lists, meal_plan, meals
  ├─ Edge Function ....... /kassal-products — KASSALAPP_API_KEY kun her
  └─ localStorage ........ offline-cache for referansedata
```

### Husholdninger og deling

- Hver bruker får **sin egen husholdning** ved registrering, seedet med
  middagsbiblioteket.
- **Inviter** (under Lister) lager en engangslenke som varer 7 dager. Den som
  åpner lenken og logger inn blir medlem av samme husholdning.
- All husholdningsdata filtreres av RLS på `household_id`. Ingen data lekker
  mellom husholdninger — verifisert av `supabase/tests/rls_test.sql`.

Medlemskap opprettes **kun** gjennom `bootstrap_household()` og
`accept_invite()`, som begge er `SECURITY DEFINER`. Det finnes bevisst ingen
INSERT-policy på `members` eller `households`: en policy som spør sin egen
tabell kjører selv under RLS, og blir da lett å omgå.

---

## Kom i gang

```bash
npm install
cp .env.example .env      # fyll inn Supabase-URL og anon-nøkkel
npm run dev
```

| Kommando | Hva den gjør |
|---|---|
| `npm run dev` | Utviklingsserver på :5173 |
| `npm run build` | Produksjonsbuild til `dist/` |
| `npm run seed:generate` | Regenererer seed-SQL fra `design-reference/` |
| `npm run db:push` | `supabase db push` |
| `npm run fn:deploy` | Deployer Kassalapp-proxyen |
| `./scripts/test-db.sh` | Migrasjoner + RLS-regresjonstest mot lokal database |

---

## Kildekart

```
src/
  lib/         supabase-klient, Kassalapp, Matvaretabellen, katalogoppslag, formatering
  hooks/       auth, husholdning, handleliste (realtime), plukk-rekkefølge, middagsplan
  components/  Dialog, Toast, Stepper, ReviewDialog (delt gjennomgangsdialog), Nav
  views/       Hjem, Handel, Forslag, Middag, Regler, Tilbud, Lister
  styles/      Modernist-tokens og komponentklasser
supabase/
  migrations/  skjema, RLS, realtime, seed, invitasjoner
  functions/   kassal-products (Edge Function)
  tests/       RLS-regresjonstest
design-reference/  prototypen og datafilene fra handoff-en (ikke bygget kode)
```

---

## Design

Modernist: `#f3f2f2` bunn, `#201e1d` tekst, `#ec3013` aksent, Archivo,
0px hjørneradius, 2px delelinjer, knappetekst flush venstre.

Tokens ligger i `src/styles/tokens.css` — bruk variablene, aldri hex direkte.
Designsystemets egen `_ds/modernist-*/styles.css` fulgte ikke med handoff-en,
så klassene er rekonstruert fra token-spesifikasjonen i `design-reference/handoff-README.md`.

Layouten er responsiv: telefonkolonne med bunnavigasjon under 900px,
sidestilt meny og bredere innholdsflate over.

---

## Status

**På plass**

- Hele databaseskjemaet med RLS, Realtime og seed-data (465 varer, 134
  normaliseringsregler, 30 middager, 8 middagsmønstre, 7 butikker)
- Magic link-innlogging, husholdningsoppsett, invitasjonslenker
- Handel: autofullfør, Kassalapp-produktvalg, −/+ med pakkestepping,
  plukket-seksjon, lært plukk-rekkefølge, fullfør handletur, talelegging
- Middag: plan, middagvelger, ingrediens-gjennomgang, familieoppskrifter
- Forslag: lagrede lister, gjentaksvarer, tilbud
- Regler: CRUD med ukedager
- Tilbud: visning, filtrering på enhetspris, manuell import
- Lister: familiedeling med invitasjon

**Ikke bygget ennå**

- Kvitteringsopplasting med OCR (krever backend-jobb — se
  `design-reference/kassalapp-handoff.md`)
- `weeklyOfferScan()` mot eTilbudsavis/Tjek-API — tilbud legges inn manuelt inntil videre
- Google Keep-import med vaskeliste (`import_queue` finnes i skjemaet)
- «Generer plan» som fyller tomme dager fra regler + historikk
- Egne lister er lesevisning; oppretting og avhuking mangler
- Prisobservasjoner skrives ikke ennå til `price_observations`

---

## Merknader om datagrunnlaget

`design-reference/fl-data.js` kommer fra 51 ekte kvitteringer (mar–aug 2026).
To ting er verdt å vite:

- Feltet `b` er tvetydig: der `en` finnes er `b` merke/variant, ellers er `b`
  den engelske oversettelsen. `scripts/generate-seed.mjs` deler dem riktig.
- Én vare har ødelagt tegnkoding: `Ãm Tomater Finmost`. Den er tatt med
  uendret framfor å gjettes på. Rett den med
  `update item_catalog set name = '<riktig navn>' where name = 'Ãm Tomater Finmost';`

Varekatalogen er felles referansedata for alle husholdninger. Den bygger på
frekvensene fra deres egne kvitteringer, så en invitert husholdning ser hvilke
varer dere kjøper ofte (ikke hva dere har kjøpt når). Skal det være privat,
må `item_catalog` kopieres per husholdning i stedet.
