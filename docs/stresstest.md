# Stresstest av Plukkelisten

Dette er de tre testene som kjører appen som ekte brukere, i en ekte
nettleser, mot en falsk database. De finner en annen slags feil enn
enhetstestene: de som først oppstår når komponenter møter ekte tilstand.

Alt av nettverk er fakset (`scripts/uitest/fakeSupabase.mjs`). Ingen av
testene skriver til noe ekte. Prisobservasjonene i den ekte basen er
FELLES for alle familier — en test som klikker tusen ganger i dem ville
vært en dårlig idé.

---

## 1. Apekatt-testen — `monkey.mjs`

```powershell
npm run build
node scripts/uitest/monkey.mjs 100
```

Åpner appen som en tilfeldig trukket bruker, på en tilfeldig
skjermstørrelse, med et tilfeldig handlemønster, og trykker rundt.

### De tolv profilene

| Profil | Hva den svarer på |
|---|---|
| `ny` | Alt er tomt. Ingen varer, middager, plan, tilbud eller poeng. |
| `liten` | Én person, tre varer. |
| `stor` | 240 varer, 40 middager, 60 tilbud, 15 lister. Ytelse og opptegning. |
| `rotete` | Rare navn, manglende felt, ekstreme tall, ødelagt jsonb. |
| `tomtilbud` | Ingen tilbud i basen — den blanke Tilbud-fanen Jon fant. |
| `utlopt` | Abonnementet er utløpt. |
| `forfalt` | Kortet feilet, nådedager. |
| `medlem` | Medlem, ikke eier — hva får man ikke lov til? |
| `mangelister` | Seks delte lister å bytte mellom. |
| `ustabilt` | Hver åttende forespørsel svarer 500. |
| `treg` | 350 ms på hvert svar. Dobbeltklikk og kappløp. |
| `offline` | Nettet dør etter at appen er lastet. |
| `nettdør` | Nettet dør MENS appen laster. |

### De åtte skjermene

360, 375, 390, 430, 768, 1024, 1280 og 1680 piksler. Under 900 px tegner
appen bunnavigasjon; over tegner den sidemeny. Det er to ulike
kodeveier, og feil har bodd i begge.

### De syv handlemønstrene

`alt`, `handletur` (krysser av), `planlegger`, `tilbudsjeger`,
`oppretter` (skriver og lagrer), `kikker`, `rastløs`.

### Hva den regner som en feil

* ErrorBoundary vises — en fane har krasjet
* uncaught exception eller unhandled rejection
* `console.error` (React-advarsler om nøkler, tilstand, hooks)
* en tom hovedflate der det skulle stått noe
* en fane som blir stående på «Laster …»
* en dialog som ikke lar seg lukke
* sideveis rulling på telefon — noe stikker utenfor skjermen
* navigasjonen forsvinner uten forklaring

### Gjenta en runde

**Dette er det viktigste ved oppsettet.** Både dataene og trykkene er
sådd fra rundenummeret, så en feil kan kjøres om igjen nøyaktig som den
var:

```powershell
node scripts/uitest/monkey.mjs 1 --runde 417
```

Første utgave brukte `Math.random` til knappevalgene. Da var runden bare
deterministisk i dataene sine, og et funn i runde 2 forsvant når runde 2
ble kjørt alene. Et funn man ikke kan gjenta kan man ikke fikse.

### Kjøre 1000 runder

Del på fire prosesser, én per kjerne:

```powershell
node scripts/uitest/monkey.mjs --fra 1   --til 250  --port 4181
node scripts/uitest/monkey.mjs --fra 251 --til 500  --port 4182
node scripts/uitest/monkey.mjs --fra 501 --til 750  --port 4183
node scripts/uitest/monkey.mjs --fra 751 --til 1000 --port 4184
```

Rundenummeret er frøet, så utsnittene tester ulike ting av seg selv.

---

## 2. To personer samtidig — `samtidig.mjs`

```powershell
node scripts/uitest/samtidig.mjs 40
```

Apekatten kjører én nettleser. Men Plukkelisten er laget for at hele
familien skal bruke den PÅ SAMME TID: Jon står i Coop og krysser av melk
mens Kari legger til brød hjemmefra.

Denne åpner to nettlesere mot SAMME tilstand — Jon på telefon, Kari på
nettbrett — og lar dem jobbe samtidig, ikke etter hverandre. Den ser
etter at ingen av dem skriver over den andres arbeid, og at ingen av dem
krasjer når tilstanden endrer seg under føttene på dem.

Realtime er avslått i den falske basen, så den måler ikke at endringer
dukker opp av seg selv — den måler at samtidig skriving ikke ødelegger.

---

## 3. Stygg data uten nettleser — `src/lib/stygg-data.test.js`

```powershell
npm test
```

Apekatten finner feil, men bruker en nettleser og et halvt minutt per
runde. Denne gjør den samme jakten på millisekunder, og kjører på hver
commit.

Fem av kolonnene appen leser er `jsonb`, og skjemaet sier bare
`not null default '[]'` — ingenting om innholdet:

```
meals.ingredients          [{n, qty, unit}]
meal_library.ingredients   [{n, qty, unit}]
meal_week_templates.days   [{weekday, meal_name}]
custom_lists.items         [{n, chk, qty}]
households.hidden_meals    [navn]
```

I tillegg kommer rader fra ting utenfor appen: en oppskrift hentet fra en
nettside, et bilde av en handleliste lest av en maskin, en kvittering
tolket fra PDF. Og øyeblikksbildet i `localStorage`, som kan være
skrevet av en eldre utgave av appen med andre felt.

Regelen: **ingen av de 60 funksjonene skal kaste.** De kan gjerne hoppe
over en ødelagt rad eller returnere null — men aldri ta ned fanen de
tegner.

### Én ting testen lærte om seg selv

Første utgave meldte 13 feil. Elleve av dem var testen som kalte
funksjonene med feil signatur — `rankProducts(søk, produkter)` er ikke
`rankProducts(produkter, søk)`, og `usualQty(observasjoner, opsjoner)` er
ikke `usualQty(observasjoner, navn)`.

En test som slår funksjonen med argumenter kallstedet aldri sender,
finner ikke feil. Den lager dem. Testen er nå skrevet slik kallstedene
faktisk kaller, og sier i kommentarene hvorfor.

---

## Vaktposten — `src/lib/text.test.js`

To regler som skanner all kildekode og feiler hvis mønsteret kommer
tilbake:

1. **Ingen `.name.toLowerCase()` / `.n.trim()` på datafelt.** Bruk
   `lower(x)`, `trimmed(x)` eller `sameName(a, b)` fra `lib/text.js`.
   Fire hvite skjermer og én krasjet Handel-fane har alle vært dette.

2. **Ingen `(x || '').toLowerCase()` uten `String()` rundt.** Det ser ut
   som en vakt. Det fanger null, undefined og tom streng — men ikke en
   verdi som ikke er tekst, og da kaster kallet akkurat som før.
