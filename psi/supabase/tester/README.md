# Prøve migrasjonene lokalt

Migrasjonene kjøres i dag ved å lime dem inn i Supabase → SQL Editor. Det
er greit nok, men en tilgangsregel som er feil oppdages da først når noen
ser noe de ikke skulle sett. Her kjøres de mot en ekte PostgreSQL først.

`00-supabase-stubb.sql` lager akkurat nok av Supabase – `auth.jwt()`,
`storage.buckets`, rollene `anon` og `authenticated` – til at filene i
`../migrations/` kan kjøres uendret.

`okonomi-tilgang.sql` prøver tilgangsreglene for økonomien: kan en
gruppeleder se et annet lags bilag, endre sin egen tildeling, eller føre
noe på Felles PSI? Svaret skal være nei på alle tre.

```sh
npm run db:test
```

Trenger `postgresql` installert lokalt (`psql` og `initdb`). Skriptet
lager en midlertidig database, kjører alt, og rydder etter seg.
