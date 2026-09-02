# MatPrat: hvorfor den står stengt, og hvordan den åpnes

## Kort svar

Det er **ikke** teknisk umulig, og det er ikke robots.txt som stopper oss.
`npm run recipes:audit` bekrefter at MatPrats robots.txt *tillater*
oppskriftsstiene. Det som stopper oss er vilkårene: MatPrat tilbyr ikke
tredjeparts-API og tillater ikke uttrekk av oppskriftsbasen uten avtale.

Husregelen i dette prosjektet er at robots.txt-tillatelse ikke er en
innholdslisens. En side kan være åpen å lese uten at vi har lov å kopiere
databasen bak den. Derfor står MatPrat med `DISABLED_PENDING_PERMISSION`
til det finnes et skriftlig ja.

Og her er poenget som gjør dette verdt å prøve: **MatPrat drives av
Opplysningskontoret for egg og kjøtt.** Formålet deres er at folk skal lage
mer norsk mat oftere. Det er ikke en konkurrent som skal beskytte en
betalingsmur — det er en aktør med samme mål som Plukkelisten. En
henvendelse har reell sjanse til å bli et ja, og kanskje mer enn det.

## Hva vi ber om — tre nivåer

Spør om det minste først. Et lite ja er lettere å gi enn et stort, og det
minste er nok til at Plukkelisten blir nyttig.

| Nivå | Vi lagrer | Vi viser | Hva de får |
|---|---|---|---|
| **1. Lenking** (har vi alt) | ingenting | tittel + lenke | trafikk |
| **2. Ingredienser** | ingredienslisten, normalisert til handlemodellen | handleliste + «se oppskriften hos MatPrat» | trafikk, og at maten faktisk blir handlet inn |
| **3. Fremgangsmåte** | stegene | hele oppskriften i appen | mest bruk, minst trafikk til dem |

Nivå 2 er det vi egentlig trenger. Nivå 3 er hyggelig, men det er også
det som er vanskeligst å få — og appen fungerer godt uten, siden den
allerede viser lenken pent når stegene mangler.

## Ferdig e-post

Send til kontaktadressen på matprat.no/om-oss (eller
Opplysningskontoret for egg og kjøtt direkte).

> **Emne:** Forespørsel om å vise MatPrat-oppskrifter i handleliste-appen Plukkelisten
>
> Hei,
>
> Jeg heter Jon Leiulfsrud og har laget Plukkelisten, en norsk app som
> hjelper familier med å planlegge middager og handle inn til dem. Appen
> setter opp en ukemeny, regner ut hva den koster, og lager handlelisten
> sortert etter hvordan man faktisk går i butikken.
>
> Jeg ønsker å kunne hente inn oppskrifter fra matprat.no. Jeg har lest
> vilkårene deres og forstår at uttrekk av oppskriftsbasen krever avtale,
> og derfor står MatPrat i dag avslått i systemet mitt — vi henter
> ingenting fra dere før vi har fått et ja.
>
> Konkret ber jeg om lov til å:
>
> 1. lagre **ingredienslisten** til en oppskrift, oversatt til
>    handlelistemodellen vår (mengde, enhet, vare),
> 2. vise **tittel, bilde og kildehenvisning**, med en tydelig lenke til
>    oppskriften hos dere for fremgangsmåten.
>
> Fremgangsmåten trenger jeg ikke å gjengi — brukeren sendes til MatPrat
> for å lese den. Slik blir MatPrat kilden, og appen blir grunnen til at
> maten faktisk havner i kurven.
>
> Om det er interessant kan jeg også:
>
> - merke MatPrat-oppskrifter tydelig som deres, med logo,
> - respektere en øvre grense for hvor mange oppskrifter vi henter, og
>   hvor ofte,
> - fjerne en oppskrift på forespørsel, umiddelbart.
>
> Boten vår identifiserer seg som `PlukkelistenBot/1.0
> (+https://plukkelisten.no/bot)`, følger robots.txt fullt ut inkludert
> Crawl-delay, og henter maksimalt én side i sekundet.
>
> Er dette noe vi kan få til? Jeg tar gjerne en telefon eller et møte.
>
> Vennlig hilsen
> Jon Leiulfsrud
> Plukkelisten — plukkelisten.no
> jon.leiulfsrud@gmail.com

## Slik skrur du den på når svaret kommer

Ingen kodeendring. Tre flagg i `src/lib/recipes/sources.js`, og de samme
tre i databasen.

**Får vi nivå 2** (ingredienser og lenke — det vi ber om):

```js
integration_modes: ['STRUCTURED_DATA', 'HTML_RECIPE', 'LINK_DISCOVERY_ONLY'],
enabled: true,
can_fetch_recipe: true,
can_store_ingredients: true,
can_store_instructions: false,     // står som nei til de sier noe annet
terms_status: 'tillatt_med_avtale_2026',
notes: 'Skriftlig tillatelse fra Opplysningskontoret for egg og kjøtt, <dato>. Ingredienser + kildehenvisning. Fremgangsmåte lenkes, ikke lagres.',
```

**Får vi nivå 3 i tillegg:** sett `can_store_instructions: true`. Det er
det ENE flagget som bestemmer om `fetch-recipe` returnerer stegene —
funksjonen sjekker det selv, så ingenting annet trengs.

Så i databasen (SQL-editoren):

```sql
update public.recipe_sources
   set enabled = true,
       can_fetch_recipe = true,
       can_store_ingredients = true,
       can_store_instructions = false,
       integration_modes = array['STRUCTURED_DATA','HTML_RECIPE','LINK_DISCOVERY_ONLY'],
       terms_status = 'tillatt_med_avtale_2026',
       notes = 'Skriftlig tillatelse <dato>. Ingredienser + kildehenvisning.'
 where id = 'matprat';
```

Merk at reseed-migrasjonen bevisst **ikke** overskriver `enabled` og
`can_*` (`20260902200000_reseed_recipe_sources.sql`), så en tillatelse du
har satt i databasen overlever en ny deploy.

Legg svaret deres i `docs/` sammen med denne filen. Om noen spør et år
fram i tid hvorfor MatPrat er påslått, skal svaret finnes.

## Kilder som venter på det samme

MatPrat er ikke alene. Disse står også `enabled: false` med
`terms_status: 'unreviewed'`, og samme e-post kan gjenbrukes:

- **Norsk Tradisjonsmat** — har alt sagt ja i vilkårene sine
  (`tillatt_med_kildehenvisning`). Denne kan slås på nå, uten å spørre
  noen. Det er den enkleste gevinsten i hele registeret.
- **Melk.no** — Opplysningskontoret for meieriprodukter. Samme type aktør
  som MatPrat, samme argument. Bildene krever egen avklaring.
- **Brød og Korn**, **Godfisk**, **PRIOR**, **Mills**, **HOFF**,
  **Gladkokken** — opplysningskontorer og merkevarer. HOFF har eksplisitt
  bildebeskyttelse; be om ingredienser og lenke, ikke bilder.

Og en ærlig merknad om de tolv som står påslått i dag (REMA, TINE, MENY,
KIWI, Coop, Oda, Gilde, FRUKT.no og fire matblogger): de har
`terms_status: 'unreviewed'`. robots.txt er sjekket for hver av dem, men
vilkårene er ikke lest. Det bør gjøres før softlansering — særlig for de
fire bloggene, der én person eier innholdet og en henvendelse er både
enkel og god folkeskikk.
