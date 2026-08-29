# Kassalapp-integrasjon — utviklerspesifikasjon

Prototypen (`FamilyList.dc.html`) kaller `searchProducts(query, store, size)` fra `kassal-api.js`.
I dag returnerer den mock-data formet som backend-svaret under. Bytt implementasjonen til å kalle
`GET /api/kassal/products?search=&store=&size=` — frontend-koden trenger ingen andre endringer.

## Backend-endepunkt (bygges server-side)
GET /api/kassal/products?search={q}&store={code}&size={n}
→ kaller `GET https://kassal.app/api/v1/products?search={q}&store={code}&unique=true&size={n}`
→ header `Authorization: Bearer ${KASSALAPP_API_KEY}` (kun server-side, aldri i browser)

Miljøvariabel: `KASSALAPP_API_KEY` (aldri i frontend, aldri i logger/feilmeldinger).

## Forenklet svarformat (det frontend bruker)
```json
{ "products": [ {
  "kassal_product_id": 123, "name": "Norvegia Original 1kg", "brand": "Tine",
  "vendor": "Tine SA", "ean": "7038010055720", "category": "Ost",
  "store": "COOP_EXTRA", "current_price": 119.9, "current_unit_price": 119.9,
  "weight": 1000, "weight_unit": "g", "image": "https://...", "url": "https://kassal.app/...",
  "last_checked": "2026-08-26T09:00:00Z"
} ] }
```

## Feilhåndtering (tekster brukt i prototypen)
- API-feil: «Kunne ikke hente priser akkurat nå.»
- Tomt resultat: «Ingen produkter funnet. Prøv et annet søk.»
- Manglende nøkkel (kun dev): «KASSALAPP_API_KEY mangler i miljøvariabler.»

## Datamodell-utvidelser (lokalt)
Items += kassal_product_id, ean, brand, vendor, kassal_url, image_url, current_price,
current_unit_price, current_price_store, current_price_checked_at, weight, weight_unit, price_confidence.
PriceObservations(id, item_id, kassal_product_id, ean, store_code, store_name, price,
unit_price, unit_price_unit, observed_at, source ∈ {kassalapp, receipt, manual, estimate}).
Stores(id, name, store_code, store_type, is_default) — COOP_EXTRA, KIWI, REMA_1000, MENY_NO, COOP_OBS, SPAR_NO.

## Prisestimat-prioritet (implementert i prototypen)
1. Kassalapp-pris for valgt butikk (uten «ca.»)
2. Nyeste kvitteringspris («ca.»)
3. Snitt kvitteringspris («ca.»)
4. Manuelt estimat («ca.»)
5. Ukjent («—»)

## Senere steg
- `GET /products/ean/{ean}` — sammenlign på tvers av butikker
- `POST /products/prices-bulk` — prishistorikk ({"eans": [...], "days": 30, "aggregation": "min"})
- `GET /physical-stores?group=&lat=&lng=&km=` — finn fysiske butikker

## Kvitteringsopplasting (mønster + felles prisdatabase)
Bruker laster opp PDF/PNG/JPG/TXT. Pipeline:
1. Parsing: Coop-PDF → tekstlag direkte; bilder → OCR (Tesseract/Google Vision); TXT → rått.
2. Validering FØR noe skrives (kritisk): kjent butikk, gyldig dato (ikke frem i tid, ≤12 mnd),
   ≥2 summerbare varelinjer, totalsum innen 15 % av linjesum. Avvist → ingenting oppdateres.
3. Først: oppdater brukerens eget handlemønster (frekvens, butikkfordeling, prisobservasjoner
   med source_type + confidence_score — OCR lavere enn PDF).
4. Deretter: anonymiserte prisobservasjoner til felles prisdatabase (crowdsourcing for
   fremtidige brukere). Kvitteringslinjer knyttes til produkt via normalisering + EAN når mulig.
5. Prisvisning: jevn prisforskjell mellom butikker → vis pris for brukerens valgte butikk;
   ellers snitt. Tilbud denne uken → vis tilbudspris med opprinnelig pris i bakgrunnen
   (strikethrough), og merk observasjonen som `offer` så den ikke forurenser snittet.
Prototypen implementerer validering + mønsteroppdatering klientside (TXT ekte, PDF/bilde demo);
OCR og felles database krever backend.

## Familiedeling (to personer, sanntid)
Kravet: mann og kone deler handlekurv og delte lister; begge kan legge til, begge ser
hva som er plukket, live — «hun legger til melk hjemmefra mens jeg står i butikken».
- Enklest robuste løsning for 2 brukere: én delt husholdning i en liten backend
  (Supabase/Firebase er nok — realtime-abonnement på `shopping_items` og `custom_lists`).
- Datamodell: Households(id), Members(household_id, user_id, name), alle lister og varer
  får `household_id` + `updated_by` + `updated_at`. Klienten abonnerer på endringer
  (websocket/realtime channel) og merger på `updated_at` (last-write-wins per vare er nok).
- Plukk-hendelser: `chk`-toggle sendes som egen event så den andre ser plukk umiddelbart;
  vis «Marte plukket Melk nå nettopp» som toast.
- Auth: to faste brukere, magic-link eller Google-innlogging. Ingen offentlig deling.
- Erstatter dagens Keep-arbeidsflyt; Keep-import beholdes som engangs-migrering.

## Ukens tilbud — weeklyOfferScan() (backend, IKKE frontend-scraping)
Frontend leser ferdig normaliserte tilbud fra `offers-data.js` (prototypens Offers-tabell) og gjør
relevans-scoring + visning. Backend-jobben som skal erstatte mock-filen:

- Cron: mandag 06:00. Én kilde feiler → fortsett med resten; logg alt i OfferFetchLogs.
- MVP-kilder: Kassalapp API først, deretter én kundeavis (Meny eller Coop Extra), pluss
  manuell lim-inn-import som fallback. Senere: Kupp/VG, eTilbudsavis, Tilbudsuken, REMA/KIWI-aviser.
- **eTilbudsavis (anbefalt neste kilde):** drives av Tjek/ShopGun. Selve siden er en JS-app,
  men API-et er strukturert og dekker mange butikker (Joker, Spar, Meny, Rema m.fl.):
  `GET https://squid-api.tjek.com/v2/catalogs?dealer_ids=...` → kataloger,
  `GET /v2/catalogs/{id}/hotspots` → varenavn, pris og posisjon per tilbud (de «aktive lenkene»).
  Krever gratis API-nøkkel fra developers.tjek.com. Joker business-id: b3e8Fm.
  Jokers egen digitale avis (publ.joker.no, Publitas) er kun bilder — bruk eTilbudsavis i stedet.
- Respekter robots.txt/vilkår, cache, aldri oftere enn daglig. Blokkert kilde → manual_import.
- Modulære parsere per kilde (source_type: api | html_page | customer_flyer | manual_import | rss | partner_feed).

Tabeller: OfferSources(id,name,url,source_type,enabled,fetch_frequency,last_fetched_at,notes) ·
Offers(id,source_id,store_code,store_name,product_name,normalized_product_name,brand,category,price,
original_price,discount_percentage,unit_price,unit,valid_from,valid_to,url,image_url,raw_data,timestamps) ·
OfferMatches(id,offer_id,item_id,kassal_product_id,ean,match_type,match_score,relevance_score,reason,
status ∈ {new,suggested,accepted,dismissed,not_relevant,expired},timestamps) · OfferFetchLogs.

Matching-prioritet: EAN → Kassalapp-ID → eksakt normalisert navn → merke+type → fuzzy → kategori+preferanse
(«Norvegia»→gulost, «Alpro soyadrikk usøtet»→soyamelk uten sukker, «Old El Paso tortilla»→tacolefser).

Relevans-score (implementert likt i prototypen): +40 kjøpes ofte · +25 i middagsplanen ·
+20 husholdnings-stift · +15 melkefritt/vegansk · +20 rabatt ≥25 % · +15 under historisk kvitteringspris ·
+10 Coop Extra / +5 andre · −30 ligger alt på listen · −50/skjul «ikke relevant» (lagres per bruker).
Terskel: vis kun score ≥ 45. Utløpte tilbud vises aldri. Aldri auto-innlegging — alltid brukerbekreftelse.

## Matvaretabellen (Mattilsynet)
Kildekode: https://github.com/mattilsynet/matvaretabellen-deux (API-ene er uversjonerte, bakoverkompatible).
`matvare-api.js` henter https://www.matvaretabellen.no/api/nb/foods.json (2121 matvarer, åpne data,
CORS-vennlig, årlig oppdatering → kan mellomlagres). `lookupFood(navn)` gir kcal/protein/fett/karbo/fiber/salt
per 100 g; vises i rediger vare-dialogen. Oppgi «Matvaretabellen (Mattilsynet)» som kilde i UI.
