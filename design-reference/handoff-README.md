# Handoff: FamilyList — smart handleliste- og middagsplanlegger for én familie

## Overview
FamilyList er en norsk handleliste- og middagsplanleggingsapp for en småbarnsfamilie (2 voksne + 2 barn, 6 og 8 år). Den lærer familiens handlemønster fra Coop/MENY/REMA-kvitteringer, henter ekte priser fra Kassalapp, planlegger middager med familietilpassede mengder, og synker mellom mann og kone i sanntid.

Målmiljø: **Supabase (gratisnivå) + statisk hosting (Vercel/Netlify/Cloudflare Pages)**. Brukeren har opprettet Supabase-konto. Totalkostnad skal være 0 kr/mnd for 2 brukere.

## About the Design Files
Filene i denne pakken er **designreferanser laget i HTML** — en fungerende prototype som viser tiltenkt utseende og oppførsel, ikke produksjonskode som kopieres direkte. Oppgaven er å **gjenskape designet i en ekte app** — anbefalt: React + Vite (eller Next.js) med Supabase som backend. `FamilyList.dc.html` inneholder all UI og logikk; `*.js`-filene er datamoduler og API-klienter som kan gjenbrukes nesten direkte.

## Fidelity
**High-fidelity.** Prototypen er bygget på Modernist-designsystemet (se Design Tokens) og all logikk er implementert og testbar i prototypen. Gjenskap UI-en trofast: flat, arkitektonisk, Archivo-font, 0px hjørneradius, 2px delelinjer, rød aksent #ec3013, knappetekst venstrejustert.

## Arkitektur (målbilde)

```
React-app (statisk hosting, gratis)
  ├─ Supabase Auth: 2 faste brukere (magic link), én husholdning
  ├─ Supabase Postgres + Realtime: alle tabeller under
  ├─ Supabase Edge Function: /api/kassal/products  ← KASSALAPP_API_KEY ligger KUN her
  └─ localStorage kun som offline-cache
```

### Supabase-tabeller
```sql
households(id, name)
members(household_id, user_id, display_name)
shopping_items(id, household_id, name, qty, unit, pack_size, variant, category,
  store, price, price_source,         -- 'kassalapp' | 'receipt' | 'manual' | 'estimate'
  kassal_product_id, ean, brand, kassal_name, checked, checked_at,
  created_by, updated_at)
picked_order(household_id, store, category, position)   -- lært plukk-rekkefølge per butikk
custom_lists(id, household_id, name, type, shared, items jsonb)  -- pakkelister m.m.
saved_trips(id, household_id, name, date, items jsonb)   -- lagrede handlelister
meals(id, household_id, name, category, ingredients jsonb) -- {n, qty}[] per middag
meal_plan(household_id, date, meal_id, done, locked)
rules(id, household_id, ...)                              -- middagsregler
price_observations(id, item_name, kassal_product_id, ean, store_code, price,
  unit_price, observed_at, source, confidence)
offers(id, store_code, product_name, price, original_price, unit_price,
  valid_to, source, source_url)
import_queue(id, household_id, raw_text, suggestion, created_at) -- vaskeliste
```
RLS: alle tabeller filtreres på `household_id` via `members`-oppslag.
Realtime: abonner på `shopping_items`, `custom_lists`, `meal_plan` — endringer fra
den andre vises umiddelbart; vis toast «Marte plukket Melk» ved checked-endring.

### Edge Function: Kassalapp-proxy
Se `kassalapp-handoff.md` (vedlagt) for full spesifikasjon. Kjerne:
- `GET /api/kassal/products?search=&store=&size=` → `https://kassal.app/api/v1/products?search=&store=&unique=1&size=` med `Authorization: Bearer ${KASSALAPP_API_KEY}` (env-secret i Supabase).
- NB: `unique=1` (ikke `true`), og butikkfilter gir ofte 0 treff — default er «alle butikker», med butikkvelger i UI.
- Nøkkelen brukeren har i dag ligger i `kassal-api.js` i TESTMODUS og MÅ roteres + flyttes til Edge Function-secret før bruk.

## Screens / Views

### 1. Hjem
- Hilsen + dagens middag (fra planen) + «Neste handletur»-kort med estimert total.
- «Estimert total»: sum av price×qty; prefiks «ca.» hvis noen pris ikke er fra Kassalapp.
- Snarveier til Handel/Middag.

### 2. Handel (hovedskjermen)
- Søkefelt med autofullfør fra varedatabasen (465 varer, `fl-data.js`): rangert etter
  kjøpsfrekvens-score, prefiks-treff først; viser «fra ca. kr X (N størrelser)» for
  varer med størrelsesvarianter, ellers «ca. kr X snitt».
- Autofullfør-klikk åpner «Legg til»-dialog: lokal vare øverst (med størrelses-dropdown
  for brus/melk/øl — literpris pr. størrelse: «4×1,5 l – ca. kr 115 (kr 19,2/l)»),
  under: Kassalapp-treff (navn, merke, EAN, pris, enhetspris, butikkvelger) med «Velg».
- Valgt Kassalapp-produkt lagres som match for varenavnet (gjenbrukes neste gang).
- Liste gruppert etter kategori, sortert i **lært plukk-rekkefølge** (per butikk):
  hver fullført handletur lagrer rekkefølgen kategoriene ble plukket i og vekter
  gjennomsnittet (75/25) mot gammel rekkefølge.
- Varelinje: checkbox → flytter til «Plukket»-seksjon nederst (grå, gjennomstreket, angre).
  Til høyre: **− [antall/pris] +** — minus/pluss justerer antall direkte;
  gram/kg/liter-varer stepper i PAKKER (mengden varen ble lagt til med = 1 pakke;
  «800 g (2 pk)»); stk stepper 1. − under 1 pakke fjerner varen (med angre-toast).
  Trykk på midten åpner redigeringsdialog.
- Redigeringsdialog: antall, enhet, butikk, pris, størrelse/variant-velger,
  «Finn pris i Kassalapp», næringsinfo (Matvaretabellen), slett.
- «Fullfør handletur»-knapp → dialog: viser antall kjøpt, avkrysset forvalg
  «Lagre handlelisten til senere» med navnefelt («Handletur onsdag 27. august»).
  Fullføring: lærer plukk-rekkefølge, nullstiller HELE listen, lagrer evt. til saved_trips.
- Talelegging (Web Speech API, no-NO): parser «2 liter melk og brød» → varer m/antall.

### 3. Forslag
- «Bruk en av dine tidligere lister» (saved_trips): navn, antall, dato, ca.-sum,
  forhåndsvisning; «Bruk listen» åpner standard gjennomgangsdialog.
- «X varer dere kjøper igjen og igjen»: varer med frekvenssignal «Ofte/Svært ofte»
  fra kvitteringene som mangler på listen; 8 vises som tags + «+N flere»;
  «Gjennomgå og legg til» åpner gjennomgang (alle forhåndsavhuket, −/+ antall).
- Ukens relevante tilbud (topp 3 mest relevante) + lenke til Tilbud-fanen.
- Middagsbaserte forslag («Til tacofredag mangler dere: …»).
- Alle «legg til»-flyter går gjennom samme gjennomgangsdialog: avhukbar liste
  med −/+ antall og pris; varer som alt er på listen merkes «Ligger på listen – økes».

### 4. Middag
- Middagsplan N dager (default 7): dagskort med middag, begrunnelse, tags.
  Knapper per dag: «Endre middag» (åpner ingrediens-gjennomgang), «Hopp over», «Velg».
  Nederst: «+ Legg til en dag» / «+ Legg til en uke» (planlegg 2+ uker).
- «Velg» åpner middagvelger; valgt middag åpner UMIDDELBART ingrediens-gjennomgangen
  (samme mønster overalt: avhuking + −/+ antall).
- «Generer plan» fyller tomme dager fra regler + historikk (fisk 2×/uke, taco fredag …).
- «Ingredienser →» samler alle planlagte middagers ingredienser (mengder fra
  familieoppskrifter, flere middager = summert) → gjennomgangsdialog → handleliste.
- Lagrede middager som tags + «Legg til ny middag»-knapp:
  dialog med eget navn-felt ØVERST + 30 vanlige familiemiddager fra `meals-library.js`
  (mengder for 2+2, f.eks. Taco: 1 kjøttdeig, 2 tacolefser, 2 avokado, 1 tacoskjell …).
- Redigert mengde per middag lagres som familieoppskrift (meals.ingredients) og
  gjenbrukes alle steder middagen refereres.

### 5. Regler
- Regelliste med på/av, redigering (ingrediens, antall/frekvens, ukedager med NAVN,
  flere dager avhukbare), slett, «+ Ny regel».
- Foreslåtte nye regler basert på mønster («Dere kjøper fisk hver uke — lag regel?»).

### 6. Tilbud
- Alle relevante tilbud, smartfilter-chips (Brød, Melk, Kaffe, Cola …) + fritekst.
- Sortert på literpris/enhetspris når man filtrerer (billigst cola zero øverst).
- Hver rad: pris, før-pris (gjennomstreket), enhetspris, gyldighet, «Se tilbudet ↗»
  → digital tilbudsvisning (kundeavis-kort med butikkheader, stor pris, før-pris,
  literpris) + lenke til butikkens sider. I produksjon: eTilbudsavis deep-link.
- Manuell tilbudsimport nederst (butikkvelger + «navn pris»-linjer) for aviser
  som ikke kan leses automatisk.

### 7. Lister
- Kvitteringsopplasting (PDF/PNG/JPG/TXT): validering FØR noe skrives —
  kjent butikk, dato ≤12 mnd og ikke frem i tid, ≥2 varelinjer, totalsum ±15 %.
  Godkjent → oppdater frekvens + priser (75/25-vekting) + del anonymt til
  price_observations. Avvist → ingenting endres. PDF/bilde krever OCR i backend.
- Google Keep-import med vasking: eksakte treff (etter normalisering, 134 regler
  i fl-data.js NORM) matches stille; usikre → «Trenger avklaring» med forslag /
  Ny vare / Senere / Dropp; «Senere» → venteliste (import_queue).
- Egne lister (pakking, sport, verktøy): klikkbare kort, avhuking → «Plukket»-seksjon,
  kopier liste («Navn (kopi)», alt uplukket), del med partner, slett.
  «Opprett ny liste»-dialog: navn, type, lim inn tidligere liste (én ting per linje).
  Kobles IKKE mot varedatabasen.
- Familiedeling-kort: 2 medlemmer, sanntidssynk-status.

## Interactions & Behavior
- Alle dialoger: `.dialog-backdrop` + `.dialog`, klikk utenfor lukker.
- Toast nederst med angre-knapp der handlingen er destruktiv (fjern vare, fullfør tur).
- Gjennomgangsdialogen (ingredienser/forslag/lagrede lister) er ETT delt mønster:
  avhukbar vareliste, −/+ antall, pris per vare, «Ligger på listen – økes»-merking,
  «Send til handlelisten»-knapp med antall.
- Ingen animasjoner utover enkle transitions; systemet er flatt og rolig.

## State Management
Prototypen holder alt i én komponentstate + localStorage-nøkler:
`fl-kassal-matches-v1`, `fl-import-queue-v1`, `fl-manual-offers-v1`,
`fl-custom-lists-v1`, `fl-saved-trips-v1`, `fl-custom-meals-v1`, `fl-meal-recipes-v1`,
`fl-pick-order-v1`. I målappen erstattes disse av Supabase-tabellene over;
behold localStorage som offline-cache med `updated_at`-merge (last-write-wins per rad).

## Design Tokens (Modernist)
- Grunn: `--color-bg` #f3f2f2; tekst: `--color-text` #201e1d; aksent: #ec3013
  (ramper 100–900 finnes i `_ds/.../styles.css` — bruk variablene, aldri hex direkte).
- Font: Archivo (headings 800, brødtekst 400); 0px radius overalt; 2px delelinjer
  (`--color-divider`); skygger `--shadow-sm/md/lg`.
- Knappetekst flush venstre; ingen sentrert hero-tekst; bilder i `.grayscale`.
- Klasser: `.btn(-primary/-secondary/-ghost/-block)`, `.tag(-accent/-neutral/-outline)`,
  `.card(-kicker/-title/-body/-meta)`, `.field`, `.input`, `.seg`+`.seg-opt`,
  `.dialog*`, `.table`, `.nav`. Lucide-ikoner.

## Assets & Data
- `fl-data.js` — 465 varer med frekvens-score, snittpris, prisspenn, primærbutikk
  (fra 51 ekte kvitteringer: 22 Coop, 19 MENY, 10 REMA, mar–aug 2026), 134
  normaliseringsregler, middagsmønstre, butikkfordeling per vare. **Seed-data til DB.**
- `meals-library.js` — 30 familiemiddager med 2+2-mengder. Seed til `meals`.
- `offers-data.js` — eksempeltilbud med source_url. Erstattes av tilbudsjobb.
- `kassal-api.js` — Kassalapp-klient (flyttes til Edge Function; mock-fallback beholdes).
- `matvare-api.js` — Matvaretabellen-oppslag (åpent API, kan kalles fra klient).
- `kassalapp-handoff.md` — full backend-spesifikasjon: Kassalapp-endepunkter,
  datamodell, prisprioritet, kvitteringspipeline, eTilbudsavis (Tjek-API, Joker
  business-id b3e8Fm), familiedeling.

## Files
- `FamilyList.dc.html` — hele prototypen (UI + logikk). Template-delen er markup,
  `class Component`-delen er all logikk — les den som fasit for oppførsel.
- Øvrige filer som over. Designsystemet ligger i `_ds/modernist-*/styles.css`.

## Implementeringsrekkefølge (anbefalt)
1. Vite + React-skall med Modernist-tokens, statisk hosting.
2. Supabase: auth (2 brukere), households/members, shopping_items + Realtime → Handel-fanen komplett med synk.
3. Edge Function for Kassalapp (roter nøkkelen!) + produktvalg-dialogen.
4. Middag: meals, meal_plan, gjennomgangsdialogen, 30-middagsbiblioteket.
5. Forslag + saved_trips + gjentaksvarer.
6. Tilbud (manuell import først, eTilbudsavis-jobb senere) + kvitteringsopplasting med OCR.
