# Prisintelligens, kjøpshistorikk og handlekurv-optimalisering — plan

Svar på spesifikasjonen «price intelligence, purchase-history and
basket-optimization», punkt 30: **inspiser før du bygger.** Dette dokumentet
er inspeksjonen og migrasjonsplanen.

## Status

**Fase 1 er implementert** (4. sept 2026), med §2a–2d slik de er anbefalt
under. Migrasjon: `20260904090000_prisintelligens_fase1.sql`.

Det som kom inn:

- `products` + `product_aliases` under `item_catalog`; `kassal_matches` er
  flyttet inn og droppet
- `physical_stores` under kjedene
- `price_observations` utvidet (produkt, fysisk butikk, pakning, førpris,
  `is_offer`, gyldighet, kildereferanse) — ingen kolonne fjernet
- `household_purchases`: husholdningens egne kjøpslinjer, privat med RLS,
  med `match_confidence`, `match_method` og `purchase_reason`
- `record_price_observations()` v2 skriver begge tabellene i én transaksjon;
  Kassalapp-rader blir observasjoner men ikke kjøp
- `price_history()`: lesevei for én vare, høyst 60 rader
- `saved_trips` importert som kjøpslinjer (`source = 'saved_trip'`)
- klient: `resolveCatalogItem()` sier `confidence` og `method`; ukjente
  kvitteringslinjer går til vaskelista; et valgt Kassalapp-produkt blir en
  observasjon med EAN; anslaget viser splitt per butikk og «Prisdekning»
- `src/lib/prices/provider.js`: PriceProvider-grensesnittet (§22) med
  kvittering, Kassalapp, tilbud og manuell, og `pickPrice()` etter §23

Verifisert lokalt mot alle 38 migrasjoner: idempotent, RLS holder (annen
bruker ser 0 kjøpslinjer og nektes direkte lesing av observasjoner),
ikke-medlem får observasjon men ikke kjøpslinje, `is_offer` utledes av
ordinærpris > betalt pris.

**Åpent inne i fase 1** (små, hver for seg):

- `physical_store_id` fylles ikke ennå — kvitteringsparseren gir bare kjede
- Kassalapp-observasjoner får `store_code` bare hvis Edge-funksjonen sender
  koden (den sender navnet i dag)
- `learn-prices` leser fortsatt bare `source = 'receipt'`; Kassalapp-rader
  bør telle med lavere vekt

**Kjøres av Jon:** `git pull` → `npx supabase db push` → `npm run fn:deploy`
(kopien `catalogMatch.ts` er regenerert) → Vercel-deploy → deretter
`supabase/rapport/prisrapport.sql` i SQL-editoren.

**Fase 2 og 3 er påbegynt** (5. sept 2026). Migrasjon:
`20260905090000_prisintelligens_fase2_3.sql`.

- Fase 2: `priceThresholds()`, `priceTrend()`, `priceConfidence()` +
  `confidenceLabel()` i `priceLearning.js`; nattjobben skriver
  `good_price_threshold`, `excellent_price_threshold`, `recent_avg_price`,
  `price_trend(_pct)` på `item_catalog`. Tilbud vurderes som «God pris» /
  «Svært god pris» mot det dere pleier å betale (`offers.priceVerdict`).
  Kjøpsfrekvens, butikkpreferanse (tilbudskjøp vektet 0,35) og foretrukket
  produkt regnes i klienten fra `household_purchases`
  (`purchaseStats.js`, `usePurchaseStats`).
- Fase 3: `households` har handleinnstillingene (`max_extra_stores`,
  `min_saving_extra_store`, `min_saving_pct`, `convenience_weight`);
  `price_snapshot()` gir siste pris per vare og kjede i ett kall;
  `basketOptimizer.js` gir alternativ A/B/C og ÉN anbefaling som
  respekterer friksjonen; Handel viser «Del opp handelen?» med «Flytt N
  til MENY» — som setter `store` på radene, så hver butikk får sin lærte
  rute (§15) via den eksisterende sorteringen.

**Fase 4 er implementert** (6. sept 2026). Migrasjon:
`20260906090000_prisintelligens_fase4.sql`.

- §18: `item_catalog.stock_up_suitability` (high/medium/low), seedet fra
  `major_category` — tørrvarer, frys og husholdning er high; frukt, meieri
  og brød er low. Bare der ingen har satt noe.
- §24: `household_purchases.reference_price / estimated_saving /
  saving_confidence`. `household_reference_price()` gir husholdningens egen
  medianpris siste 180 dager fra vanlige kjøp; `record_price_observations`
  v3 regner sparingen når linjen skrives — mot kjøp FØR denne, aldri mot
  en «førpris», aldri negativ. Hjem viser «Spart ca. kr X denne måneden»
  (`savingsSummary`, bare linjer med sikkerhet ≥ 0,5).
- §19: `nextPurchase()` — sannsynlighet for neste kjøp fra medianintervall
  og dager siden sist; over tre intervaller = «sluttet med». Forslag-fanen
  har «Snart tid for» (`dueItems`), aldri auto-legg-til.
- §17: `buyEarly.js` — «Kjøp nå, før tilbudet går ut»: bare når neste
  kjøp kommer etter at tilbudet er over, varen tåler å ligge (ikke low) og
  prisen er under det dere pleier å betale (egen historikk). Antall
  dobles for high.
- §21: `coOccurrence()` — varer som opptrer på samme kvittering (≥3 turer,
  ≥50 %). Vises bare som «Pleier å følge med» på merkelappene i «Snart tid
  for». Svakt signal, brukes aldri til å legge til.
- Åpne punkter fra fase 2–3 lukket: handleinnstillingene redigeres i
  Listeinnstillinger («Butikker og besparelse»); Handel viser «Prisdekning
  … · høy/middels/lav sikkerhet»; `learn-prices` teller Kassalapp-oppslag
  når varen har færre enn 3 kvitteringslinjer; Kassalapp-observasjoner får
  kjedekode (`storeCodeFrom`). Og en feil: `useReferenceData` hentet ikke
  `good_price_threshold` m.fl., så «God pris»-merket sto aldri på noe
  tilbud — nå gjør det det.

Verifisert lokalt mot alle migrasjoner: idempotent; RPC v3 gir referanse
22,90 etter to vanlige kjøp, sparing 8,00 på et tilbudskjøp à 18,90 × 2,
0,00 (ikke negativ) når det var dyrere; ikke-medlem får observasjon men
ikke kjøpslinje. Rapporten har fått seksjon G (hamstre-egnethet, sparing).

Fortsatt åpent: `physical_store_id` fylles ikke (kvitteringen gir bare
kjede); eldre kjøpslinjer får ikke sparing etterberegnet (bare nye).

**Herding etter gjennomgang** (6. sept 2026, `20260907090000_prisintelligens_herding.sql`):
`household_reference_price()` er ikke lenger kallbar av innloggede (den
lakk medianpris per vare på tvers av husholdninger — kalles bare fra
RPC-en); indekser for `lower(item_name)` og `purchased_at`; den partielle
EAN-indeksen får eget navn; kvoteradene ryddes av `expire_subscriptions()`.
I nattjobben: observasjonene hentes i sider (PostgREST kutter stille ved
1000), enhetsgruppen for terskler/trend er faktisk samme enhet, tersklene
nulles ikke når en runde har for få priser, `recent_avg_price` er den
nylige medianen uten tak, og trenden måles på ordinærpris som tersklene.
Kassalapp-observasjoner sendes som «1 stk» med pakningen i
`package_qty/package_unit` (før ble en 500-grams ost «1 g for 89 kr»).

Ikke avhengig av SeSum. Alt bygger på egen base, egne kvitteringer,
Kassalapp, tilbudskildene og husholdningens vaner. En ekstern leverandør kan
legges til som én `PriceProvider` til senere, uten å endre modellen.

---

## 1. Det som finnes — begrep for begrep

Spesifikasjonen bruker sine egne navn. Her er hva hvert av dem heter i basen
i dag, og hvor mye som mangler.

| Spesifikasjonen sier | Finnes som | Status |
|---|---|---|
| **PriceObservation** | `price_observations` — `item_name, kassal_product_id, ean, store_code, price, qty, unit, unit_price, regular_unit_price, observed_at, source, confidence` | **Finnes.** Én rad per observasjon, aldri overskriving. Skrives kun via `record_price_observations()` med dagskvote. Mangler: `valid_from/valid_to`, `source_reference`, `is_offer`, pakningsstørrelse, og fysisk butikk |
| `source` verdier | `kassalapp · receipt · manual · estimate · offer` | Finnes. Mangler `weekly_offer`, `imported_receipt`, `future_external_provider` — men bare `receipt` skrives i dag |
| **Item** («Gulost») | `item_catalog` — felles for alle husholdninger, `name` unik, `avg_price/price_low/price_high/primary_store/score` | **Finnes.** Dette er det kanoniske varenivået |
| **ProductAlias** («NORVEGIA 1KG» → Norvegia) | `norm_rules (from_text → to_text)` + `resolveCatalogItem()` + `foodConcepts.js` | **Finnes**, men aliaser peker til *Item*, ikke til et *Product* — fordi Product-nivået mangler |
| **Product** («Norvegia Original 1 kg») | — | **Mangler.** `kassal_matches` har feltene (`kassal_product_id, ean, brand, weight`) men er per husholdning, og **ingen kode leser eller skriver den**. Død tabell |
| **EAN** | kolonner på `price_observations` og `kassal_matches` | Finnes som felt. Fylles aldri: Kassalapp-svar lagres ikke som observasjoner |
| **Matching pipeline** (§4) | `receipt.js` (rens, mengde, rabatt) → `resolveCatalogItem()` (alias, fuzzy, kategori) | Finnes i det store. Mangler: `match_confidence` lagres ikke, og usikre treff blir stille permanente — akkurat det §4 sier ikke skal skje |
| **Kjøpsstatistikk per husholdning** (§5) | `item_habits` — `usual_qty, times_bought, last_bought_at` per `(household, item_name)` | **Delvis.** Mengdevane og sist kjøpt finnes. Mangler: intervaller mellom kjøp, per-butikk-splitt, snittpris betalt |
| **Butikkpreferanse per vare** (§6) | `item_catalog.primary_store` (globalt), `households.default_store` | **Mangler per husholdning.** `store_dist` ble bevisst slettet av personvernhensyn |
| **Kjøpsårsak** (§7) | — | Mangler |
| **God pris / utmerket pris** (§8) | `priceLearning.js` (median, persentiler, distinkte dager, enhetsgruppe) → `item_catalog.avg_price/price_low/price_high`; `priceDrop.js` og `offers.js` sammenligner tilbud mot dem | **Finnes i kjernen.** Terskler («god» / «svært god») er ikke definert som egne verdier |
| **Pristrend** (§9) | — | Mangler, men dataene ligger i `price_observations` |
| **Kvitteringer = sannhet** (§10) | `applyReceipt.js`: kvittering → observasjoner → vaner; `receipt_uploads` logger butikk, dato, sum, antall linjer per husholdning | Finnes. Se punkt 2 — linjene er anonymisert med vilje |
| **Estimat per handlelinje** (§11) | `packSizeFor()`, `purchases()`, `estimateCost()` — hele pakker, ikke brøker | **Finnes.** 600 g kjøttdeig = 2 pakker × pakkepris |
| **Estimert handlekurv** (§12) | `estimatedTotal()` → `{sum, counted, missing, exact, label}` — «minst kr X» når noe mangler | **Finnes.** Mangler: splitt per butikk, «Prisdekning %» |
| **BasketOptimizer** (§13–14) | — | Mangler |
| **Butikkfriksjon / HouseholdShoppingSettings** (§14) | `households.default_store` | Mangler resten |
| **Fysisk rute per butikk** (§15) | `picked_order (household, store, category, position)` + `storeRoutes.js` + `sortItems('plukk')` | **Finnes.** Én rute per butikk per husholdning, brukes alt i Handel og butikkmodus |
| **Tilbud mot historikk** (§16) | `offers.js` «under deres vanlige pris (ca. kr X)», `priceDrop.js` | Finnes i enkel form |
| **Kjøp-tidlig, lagringsegnethet, sannsynlighet, klynger, sparing** (§17–21, 24) | — | Mangler |
| **PriceProvider** (§22) | `kassal.js`, `applyReceipt.js`, `offers/webOffers.js`, `tjek.js` — hver sin form | Mangler felles grensesnitt |
| **Kildeprioritet** (§23) | `learn-prices` leser bare `source = 'receipt'`; estimatet bruker `price_source` på raden | Delvis |
| **Personvern** (§27) | `price_observations` er **anonym** (ingen `household_id`), RLS stenger lesing for klienter; `item_habits`, `picked_order`, `receipt_uploads`, `saved_trips` er per husholdning med RLS | **Finnes, og er strengere enn spesifikasjonen** |

Fasit: av fase 1 (punkt 1–6) mangler bare Product/EAN-nivået. Punkt 2, 3, 5 og
6 er i produksjon.

---

## 2. Det som kolliderer — og må avgjøres først

### 2a. Anonyme prisobservasjoner mot husholdningsstatistikk

`price_observations` har **ingen `household_id`**. Det var et valg: prisene
er felles kunnskap for alle familier, og ingen skal kunne lese ut av en
prisrad at *denne* familien kjøpte *dette* på MENY den datoen. `store_dist`
ble slettet av samme grunn.

Spesifikasjonens §5–7 og §19–20 (kjøpsintervaller, butikkpreferanse per
vare, kjøpsårsak, neste-kjøp-sannsynlighet) krever nettopp den koblingen.

**Forslag:** to tabeller, to formål, aldri blandet.

- `price_observations` forblir anonym og felles. Den svarer på «hva koster
  Norvegia hos Coop Extra».
- Ny `household_purchases` er husholdningens egen kjøpslinje-logg, med
  RLS som alt annet husholdningseid. Den svarer på «hva kjøper *vi*, hvor,
  hvor ofte».

Én kvittering skriver til begge, i én transaksjon, via samme RPC. Den
anonyme raden får aldri en peker tilbake til husholdningen.

### 2b. Kjede mot fysisk butikk

`stores` er kjeder (`COOP_EXTRA`). Spesifikasjonen vil ha `physical_store_id`
(«MENY Hovenga»). I dag skiller `picked_order.store` og `shopping_items.store`
på fritekst-navnet, og rutene er derfor allerede per *fysisk* butikk der
brukeren har kalt dem ulikt.

**Forslag:** ny `physical_stores (id, chain_code → stores.code, name,
household_id null = felles)`. Kvitteringsparseren kjenner ofte butikknavnet
(«Coop Extra Kilen»). Kjede beholdes som fall-back overalt.

### 2c. Item mot Product

Alt i appen — handleliste, middager, tilbud, vaner — er koblet på
`item_catalog.name`. Å bytte fremmednøkler til et Product-nivå ville berørt
hver tabell og hver skjerm.

**Forslag:** Product blir et *tillegg* under Item, ikke en erstatning.
`products (id, item_id → item_catalog, name, brand, ean, package_qty,
package_unit, kassal_product_id)`. Observasjoner og kjøpslinjer får valgfri
`product_id`. Handlelisten fortsetter å be om «Gulost»; estimatet kan velge
`preferred_product` når den finnes. `kassal_matches` avvikles inn i dette.

### 2d. `match_confidence` og usikre treff

`resolveCatalogItem()` returnerer et treff eller ingenting. Ingen vet i
ettertid om «Gulost» kom fra et eksakt alias eller et fuzzy-gjett.

**Forslag:** funksjonen returnerer `{name, item, confidence, method}`.
Verdien lagres på kjøpslinjen. Under en terskel legges linjen i
`import_queue` (finnes) til bekreftelse, i stedet for å bli permanent.

---

## 3. Migrasjonsplan

Rekkefølgen er spesifikasjonens, justert for det som alt finnes. Hver fase
er én migrasjon + kode, og kan stoppe der.

### Fase 1 — modellen (punkt 1–6)

1. `products` + `product_aliases` (§3). `norm_rules` beholdes for Item-nivå;
   `product_aliases` tar «Norvegia 1kg» → produkt. `kassal_matches` droppes
   etter at innholdet er flyttet (den er tom i praksis — ingen skriver den).
2. `price_observations` utvides: `product_id`, `physical_store_id`,
   `package_qty`, `package_unit`, `original_price`, `is_offer`,
   `valid_from`, `valid_to`, `source_reference`. `source`-listen får
   `weekly_offer`. Ingen kolonne fjernes.
3. `physical_stores` (§2b).
4. `household_purchases` (§2a): `household_id, purchased_at, physical_store_id,
   chain_code, item_name, product_id, qty, unit, price_paid, unit_price,
   discount_amount, purchase_reason, match_confidence, match_method,
   source, receipt_upload_id`. RLS = husholdningens medlemmer.
5. `record_price_observations()` skriver begge tabeller. `applyReceipt.js`
   sender `match_confidence` og `match_method`.
6. Kassalapp-svar lagres som observasjoner med `source='kassalapp'` og
   `ean`/`kassal_product_id` (i dag kastes de etter visning). Da fylles
   EAN-feltet for første gang.
7. Estimatet viser splitt per butikk og «Prisdekning» — begge er én
   utvidelse av `estimatedTotal()`.

**Import av eksisterende data:** de rå kvitteringslinjene fra
arbeidsbøkene (mars–august 2026) finnes ikke i basen — bare aggregatene i
`item_catalog` (`line_count`, `receipt_count`, `avg_price`). De kan ikke
gjøres om til observasjoner i ettertid. Det som *kan* importeres til
`household_purchases`: `saved_trips.items` (fullførte handleturer med navn,
mengde og pris) og `receipt_uploads` (butikk, dato, sum). Observasjonene
siden 2. september ligger alt i `price_observations`.

### Fase 2 — læring (punkt 7–12)

8. `household_item_stats` (materialisert, oppdatert av `learn-prices`):
   `first/last_purchased_at, purchase_count, avg_days_between,
   median_days_between, avg_paid, recent_avg_paid, lowest, highest`.
9. `household_item_store_preference` (§6): `share_of_purchases,
   preference_score` — med `purchase_reason` som vekt, så ett tilbudskjøp
   på MENY ikke flytter preferansen (§7).
10. `preferred_product` per `(household, item)`.
11. `price_confidence_score` 0–100 (§2) regnet i `priceLearning.js`, vist
    som «Høy / Middels / Lav sikkerhet». Faktorene finnes alt som data:
    alder, kilde, samme butikk, antall uavhengige, enighet kvittering ↔
    Kassalapp.
12. `good_price_threshold` / `excellent_price_threshold` per vare (§8) som
    kolonner på `item_catalog`, regnet av `learn-prices`. `priceDrop.js`
    bruker dem i stedet for `avg_price` alene.
13. `price_trend` (§9) — 30 dager mot 31–90, lagres, vises ikke ennå.

### Fase 3 — handlekurven (punkt 13–16)

14. `household_shopping_settings` (§14): `max_extra_stores`,
    `minimum_saving_for_extra_store`, `minimum_saving_percentage`,
    `convenience_weight`. Standard: 1 ekstra butikk, 60 kr.
15. `basketOptimizer.js` — ren funksjon, testbar uten base. Inn: liste,
    priser med sikkerhet, tilbud, preferanser, innstillinger. Ut: 2–3
    alternativer med besparelse, og **én** anbefaling som respekterer
    friksjonen. Aldri anbefal tre butikker for 103 kr.
16. Splitt-lister sorteres med `picked_order` for *hver* butikk (§15).
    Rutene blandes aldri — `sortItems('plukk')` gjør det alt per butikk.

### Fase 4 — det som bygger på alt over (punkt 17–20)

17. `stock_up_suitability` på `item_catalog` (§18), seedet fra kategori.
18. Neste-kjøp-sannsynlighet fra intervallene i fase 2 (§19).
19. Varer som opptrer sammen, fra `household_purchases` (§21) — svakt
    signal, aldri auto-legg-til.
20. Sparing (§24): `reference_price, paid_price, estimated_saving,
    saving_confidence` på kjøpslinjen. Bare når referansen er husholdningens
    egen historikk, aldri en «førpris».

### PriceProvider (§22) — går på tvers

Ett grensesnitt i `src/lib/prices/provider.js`:
`searchProducts(q)`, `getCurrentPrice(item, store)`, `getPricesByEAN(ean)`,
`getPriceHistory(item)`. Leverandører: `ReceiptPriceProvider`
(`price_observations`), `KassalappPriceProvider` (`kassal-products`),
`WeeklyOfferPriceProvider` (`offers`), `ManualPriceProvider`. En
`SesumPriceProvider` kan legges til **bare** med autorisert tilgang og
dokumentasjon — aldri ved å hente fra deres private endepunkter.

---

## 4. Rapporten (punkt 30.6)

Tallene må komme fra basen, og basen er ikke tilgjengelig herfra.
`supabase/rapport/prisrapport.sql` gir hele rapporten i én spørring — lim
inn i SQL-editoren, kjør, ta skjermbilde.

Tre av tallene spesifikasjonen ber om kan ikke gis ennå, og rapporten sier
det eksplisitt:

- **Eksakte EAN-treff:** 0 — Kassalapp-svar lagres ikke som observasjoner
  (fase 1, punkt 6).
- **Fuzzy mot eksakt:** ukjent — `match_confidence` lagres ikke (§2d).
- **Sterkeste butikkpreferanse per husholdning:** ikke mulig —
  observasjonene er anonyme (§2a). Rapporten viser den *globale*
  fordelingen per vare i stedet, og sier at det er noe annet.

Uløste kvitteringslinjer måles som observasjoner med et `item_name` som
ikke finnes i `item_catalog` — det er den beste tilnærmingen dataene gir.

---

## 5. Prinsippet som styrer alt (§29)

Spørsmålet er ikke «hvor er hver vare billigst», men «hva er den mest
fornuftige handleplanen for *denne* familien». Pris, vaner, ukeplan,
tilbud, butikkpreferanse, fysisk rute og tid veies sammen. Sluttresultatet
skal kunne leses opp høyt:

> Handle hovedhandelen på Coop Extra.
> Kjøp disse tre på MENY Hovenga: Norvegia, Gryr fløte, kjøttdeig.
> Estimert besparelse: 112 kr.
> Resten er ikke billig nok til at en ekstra butikk er verdt det.

Appen skal ikke bli en prissammenligningstjeneste. Den skal bli bedre til
det den alt er.
