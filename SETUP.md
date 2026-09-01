# Oppsett — Supabase + hosting

Framgangsmåte fra tom Supabase-konto til kjørende app. Regn med 20–30 minutter.
Alt her ligger innenfor Supabases gratisnivå.

---

## 0. Før du begynner

```bash
npm install
npm install -g supabase        # eller: brew install supabase/tap/supabase
```

---

## 1. Opprett Supabase-prosjektet

1. Gå til [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
2. Velg region **Europe (Frankfurt)** eller **Europe (Stockholm)** — nærmest Norge gir lavest forsinkelse.
3. Sett et databasepassord og ta vare på det.
4. Noter **Project Reference ID** (står i URL-en: `supabase.com/dashboard/project/<ref>`).

---

## 2. Koble repoet til prosjektet

```bash
supabase login
supabase link --project-ref <ditt-project-ref>
```

---

## 3. Legg på databasen

```bash
supabase db push
```

Dette kjører de fem migrasjonene i rekkefølge:

| Migrasjon | Innhold |
|---|---|
| `…_schema.sql` | Alle tabellene |
| `…_rls.sql` | Row Level Security + medlemsoppslag |
| `…_realtime.sql` | Realtime-publikasjon for `shopping_items`, `custom_lists`, `meal_plan`, `meals` |
| `…_seed_reference_data.sql` | 465 varer, 134 normaliseringsregler, 30 middager, 8 mønstre, 7 butikker |
| `…_invites_and_bootstrap.sql` | Profiler, invitasjoner, `bootstrap_household()` |

Sjekk i **Table Editor** at `item_catalog` har 465 rader.

---

## 4. Roter Kassalapp-nøkkelen og legg den inn som secret

> **Viktig:** nøkkelen som lå i `kassal-api.js` har vært eksponert i nettleseren.
> Lag en ny på [kassal.app](https://kassal.app) og slett den gamle.

```bash
supabase secrets set KASSALAPP_API_KEY=<din-nye-nøkkel>
```

Nøkkelen leses kun av Edge Functionen. Den skal aldri ligge i `.env`,
i frontend-koden eller i repoet.

---

## 5. Deploy Edge Functionen

```bash
supabase functions deploy kassal-products
```

Test at den svarer (krever en innlogget bruker — 401 uten token er riktig oppførsel):

```bash
curl -i "https://<ref>.supabase.co/functions/v1/kassal-products?search=melk"
# forventet: 401 {"error":"Ikke innlogget."}
```

### Profilbilder (avatars-bucketen)

`supabase db push` prøver å opprette storage-bucketen «avatars» med
policies. Får du «Bucket not found» ved opplasting, lim dette inn i
**SQL Editor** i Supabase-dashbordet og kjør:

```sql
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists avatars_select on storage.objects;
create policy avatars_select on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars');

drop policy if exists avatars_insert on storage.objects;
create policy avatars_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_update on storage.objects;
create policy avatars_update on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_delete on storage.objects;
create policy avatars_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
```

(Alle kan se bildene — bucketen er offentlig; hver bruker kan bare
skrive i sin egen mappe.)

### Automatisk oppskriftshøsting (kokeboka)

Kokeboka fylles dryppvis av seg selv: hver time tar funksjonen én norsk
kilde (den med færrest oppskrifter), henter ~60 nye sider med god pause
mellom kallene, og stopper selv ved 10 000 totalt. robots.txt sjekkes
hver gang.

```bash
supabase functions deploy harvest-recipes
```

Planlegg i SQL-editoren (én gang, bytt inn ref og service_role-nøkkel):

```sql
select cron.schedule(
  'harvest-recipes', '20 * * * *',
  $$ select net.http_post(
       url := 'https://<ref>.supabase.co/functions/v1/harvest-recipes',
       headers := '{"Authorization":"Bearer <service_role_key>"}'::jsonb
     ) $$);
```

Valgfrie secrets: `HARVEST_PAGES` (sider per kjøring, standard 60, maks
120) og `HARVEST_TARGET` (totalmål, standard 10 000). Den manuelle
varianten `npm run recipes:harvest` finnes fortsatt for større engangsløft.

### Adminpanelet

Profilmenyen viser «Administrasjon» (brukere, bruk, passord-reset, slett
bruker) kun for e-postene i `ADMIN_EMAILS`:

```bash
supabase functions deploy admin
supabase secrets set ADMIN_EMAILS=jon@varmehus.no,jon.leiulfsrud@gmail.com
```

Uten secreten er panelet stengt for alle. Passord kan aldri leses eller
settes direkte — reset sender brukeren en e-post der de velger nytt selv.

### Nattlig gjennomgang av «Meld feil»-meldinger

Feil brukerne melder på varer (kryptiske navn, feil pris osv.) gjennomgås
automatisk hver natt:

```bash
supabase db push                                   # item_reports-tabellen
supabase functions deploy review-item-reports
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...  # valgfritt: lar Claude vurdere de uklare
```

Uten `ANTHROPIC_API_KEY` fikses bare de entydige meldingene (pris med tall,
navn med forslag, duplikat som matcher) — resten merkes «trenger menneske».
Planlegg kjøringen i SQL-editoren (én gang, bytt inn ref og service_role-nøkkel):

```sql
select cron.schedule(
  'review-item-reports', '30 3 * * *',
  $$ select net.http_post(
       url := 'https://<ref>.supabase.co/functions/v1/review-item-reports',
       headers := '{"Authorization":"Bearer <service_role_key>"}'::jsonb
     ) $$);
```

---

## 6. Skru på magic link

I **Authentication → Providers → Email**:

- **Enable Email provider**: på
- **Confirm email**: av (magic link bekrefter i seg selv)

I **Authentication → URL Configuration**:

- **Site URL**: `http://localhost:5173` under utvikling, hostingadressen i produksjon
- **Redirect URLs**: legg til begge

Gratisnivået sender et begrenset antall e-poster per time via Supabases
delte SMTP, fra en generisk avsenderadresse. Det holder så vidt til å teste,
men er ikke noe å bygge på — se neste avsnitt.

---

## 6b. Egen avsender (anbefalt)

To grunner til å gjøre dette: e-posten kommer fra `plukkelisten.no` i stedet
for en fremmed avsender, og du slipper Supabases ratebegrensning, som kan
stoppe midt i en invitasjon.

**Du trenger ikke en postkasse.** Du sender fra `noreply@plukkelisten.no`
uten å kunne motta på adressen. Vil du også ta imot e-post på domenet, er det
en egen sak (Domeneshop selger det, eller Google Workspace / Fastmail).

1. Opprett konto på [resend.com](https://resend.com) — gratis, 3 000 e-poster
   i måneden. Alternativer: Postmark, Brevo, Mailgun.
2. **Domains → Add Domain** → `plukkelisten.no`. Resend viser noen DNS-poster
   (SPF, DKIM og gjerne DMARC).
3. **Legg postene inn der DNS-en din faktisk styres.** Har du byttet
   navnetjenere til Vercel, er det i Vercels DNS-panel — ikke hos Domeneshop.
   Dette er lett å bomme på.
4. Vent på at Resend viser domenet som verifisert. Vanligvis minutter.
5. **Resend → API Keys** → lag en nøkkel.
6. I Supabase, **Project Settings → Authentication → SMTP Settings**, slå på
   Custom SMTP:

   | Felt | Verdi |
   |---|---|
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` |
   | Password | API-nøkkelen fra Resend |
   | Sender email | `noreply@plukkelisten.no` |
   | Sender name | `Plukkelisten` |

7. **Authentication → Emails → Magic Link**: lim inn innholdet fra
   `supabase/templates/magic-link.html`.

Send deg selv en innloggingslenke for å sjekke at det virker.

---

## 7. Frontend-miljøvariabler

```bash
cp .env.example .env
```

Fyll inn fra **Project Settings → API**:

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon public key>
```

`anon`-nøkkelen er trygg i frontend — den er beskyttet av RLS.

```bash
npm run dev
```

---

## 8. Første innlogging

1. Åpne `http://localhost:5173`, skriv inn e-posten din, klikk lenken i e-posten.
2. Oppgi visningsnavn → husholdningen opprettes med 30 middager seedet inn.
3. Gå til **Lister → Inviter til husholdningen** → kopier lenken → send til partneren.
4. Hun åpner lenken, logger inn med sin e-post, og havner i samme husholdning.

Invitasjonslenken er en engangskode som utløper etter 7 dager. Trengs en ny,
lager du bare en ny.

---

## 9. Hosting

Statisk build, fungerer på alle tre gratisnivåene:

```bash
npm run build     # -> dist/
```

| Tjeneste | Kommando / oppsett |
|---|---|
| Vercel | `vercel --prod` (framework: Vite) |
| Netlify | Build: `npm run build`, publish: `dist` |
| Cloudflare Pages | Build: `npm run build`, output: `dist` |

Legg inn `VITE_SUPABASE_URL` og `VITE_SUPABASE_ANON_KEY` som miljøvariabler
hos hostingtjenesten, og oppdater **Site URL** + **Redirect URLs** i Supabase
til produksjonsadressen. Uten det virker ikke magic link i produksjon.

---

## 10. Verifiser isolasjonen

Skjemaet har en regresjonstest som sjekker at to brukere i samme husholdning
ser hverandres data, og at en tredje ikke ser noe:

```bash
PGHOST=/var/tmp PGPORT=5433 PGUSER=<bruker> ./scripts/test-db.sh
```

Den kjører mot en lokal engangsdatabase, ikke mot Supabase-prosjektet.

---

## 11. Betaling med Stripe

Abonnementet er 15 kr i måneden per husholdning. Alle får 30 dager gratis,
og en kampanjekode gir én måned til. Stripe eier sannheten om hvem som har
betalt; `subscriptions`-tabellen er en kopi som webhooken holder à jour.

Alt under kan gjøres i **testmodus** først. Da trenger du verken
organisasjonsnummer eller bankkonto, og du kan kjøre hele løpet med
Stripes falske kort `4242 4242 4242 4242`.

### 11.1 Sett opp produktet i Stripe

1. Opprett kontoen på [stripe.com](https://stripe.com), og velg Norge.
2. **Product catalog → Add product**: navn «Plukkelisten», pris **15,00 NOK**,
   **Recurring**, **Monthly**. Kopier prisens ID — den starter med `price_`.
3. **Product catalog → Coupons → Create coupon**: 100 % rabatt, varighet
   **Repeating**, **1 month**. Legg til en **promotion code** på kupongen,
   for eksempel `VENNER`.
4. **Settings → Billing → Customer portal**: skru på portalen, og tillat at
   kunden kan si opp og bytte betalingsmåte selv.

Prøveperioden settes av appen, ikke i Stripe: den som tegner abonnement
får de dagene som er igjen av sine 30, slik at en oppsigelse og en ny
tegning ikke gir gratis måneder i det uendelige.

### 11.2 Legg inn nøklene

```powershell
supabase secrets set STRIPE_SECRET_KEY=sk_test_...
supabase secrets set STRIPE_PRICE_ID=price_...
supabase secrets set APP_URL=https://plukkelisten.no/app/
```

`STRIPE_WEBHOOK_SECRET` kommer i neste steg.

> Nøklene skal aldri i repoet eller i en `.env`-fil — bare gjennom
> `supabase secrets set`.

### 11.3 Deploy funksjonene

```powershell
supabase functions deploy stripe-checkout
supabase functions deploy stripe-portal
supabase functions deploy stripe-webhook --no-verify-jwt
```

`--no-verify-jwt` er nødvendig for webhooken: den kalles av Stripe, ikke av
en innlogget bruker. Ektheten avgjøres av signaturen i stedet, og den
kontrolleres i koden.

### 11.4 Koble webhooken

I Stripe: **Developers → Webhooks → Add endpoint**.

Adresse:
`https://hijthzsbpffjrajlnlrw.supabase.co/functions/v1/stripe-webhook`

Velg disse hendelsene:

| Hendelse | Hva den gjør |
|---|---|
| `checkout.session.completed` | knytter abonnementet til husholdningen |
| `customer.subscription.created` | ny rad, status «prøve» |
| `customer.subscription.updated` | status og dato endrer seg |
| `customer.subscription.deleted` | status «utløpt» |
| `customer.subscription.trial_will_end` | sender påminnelsen tre dager før første trekk |
| `invoice.payment_failed` | status «forfalt», med fem nådedager |

Kopier **Signing secret** (`whsec_...`) og legg den inn:

```powershell
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
supabase functions deploy stripe-webhook --no-verify-jwt
```

Deploy på nytt etterpå — en function som ble deployet før secreten ble satt,
kjenner den ikke.

### 11.5 Test hele løpet

1. Åpne appen → **Min profil → Abonnement → Start abonnement**.
2. Bruk testkortet `4242 4242 4242 4242`, hvilken som helst framtidig
   utløpsdato og tresifret kode.
3. Lim inn `VENNER` i kampanjekodefeltet — da skal Stripe vise at første
   måned etter prøveperioden er gratis.
4. Etter betaling: sjekk at raden i `subscriptions` fikk
   `stripe_subscription_id` og riktig `paid_until`.

Går noe galt, står årsaken i loggen:
`supabase functions logs stripe-webhook`.

### 11.6 Når det skal bli ekte

Bytt fra testmodus til live i Stripe, lag produktet og kupongen på nytt der
(testmodus og live deler ikke data), og sett `STRIPE_SECRET_KEY`,
`STRIPE_PRICE_ID` og `STRIPE_WEBHOOK_SECRET` på nytt med live-verdiene.

### Hva som skjer når abonnementet går ut

Ingenting slettes. Listene kan leses, krysses av og gjøres opp som før —
det er bare det å legge til nye varer som stopper. Reglene står ett sted i
databasen (`household_has_access()`) og ett sted i appen
(`src/lib/billing.js`), og testene i `src/lib/billing.test.js` holder de to
i takt. Endres den ene, må den andre endres i samme slengen.

Husholdningene som fantes før betalingen ble innført har status
`grunnlegger` og betaler ingenting. Den statusen overskrives aldri av
webhooken.

## Feilsøking

**«Kunne ikke hente priser akkurat nå.»**
Edge Functionen når ikke Kassalapp. Sjekk loggen:
`supabase functions logs kassal-products`.

**«KASSALAPP_API_KEY mangler i miljøvariabler.»**
Secreten er ikke satt, eller functionen ble deployet før secreten. Sett
secreten og deploy på nytt.

**Magic link fører til feil adresse**
**Site URL** i Supabase peker et annet sted enn der appen kjører.

**Realtime oppdaterer ikke**
Sjekk at **Database → Replication** har `supabase_realtime` med tabellene i seg.
Migrasjonen gjør dette, men et prosjekt opprettet før migrasjonen kan trenge en
ny `supabase db push`.

**Invitasjonslenken virker ikke**
Koden er engangsbruk og varer 7 dager. Lag en ny fra **Lister → Inviter**.

**Betalte, men appen sier fortsatt «prøveperiode»**
Webhooken har ikke fått beskjed. Se **Developers → Webhooks** i Stripe:
står det feilkoder der, sjekk `supabase functions logs stripe-webhook`.
Vanligste årsak er at `STRIPE_WEBHOOK_SECRET` mangler eller at funksjonen
ble deployet uten `--no-verify-jwt`.

**«Betaling er ikke satt opp ennå.»**
`STRIPE_SECRET_KEY` eller `STRIPE_PRICE_ID` mangler. Sett dem og deploy
`stripe-checkout` på nytt.
