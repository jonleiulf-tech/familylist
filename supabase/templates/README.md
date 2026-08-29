# E-postmaler

Malene limes inn i Supabase-dashbordet under **Authentication → Emails**.
De ligger her i repoet så de er versjonert, men Supabase leser dem ikke
herfra — du må kopiere innholdet inn i dashbordet.

| Fil | Hvor den limes inn |
|---|---|
| `magic-link.html` | Magic Link |
| `invite.html` | Invite user |

`magic-link.html` er den som betyr noe. Invitasjonene fra appen går som
vanlige innloggingslenker, så det er den malen kona di faktisk får.

## Avsenderadresse

Uten egen SMTP sendes e-posten fra Supabase sin delte avsender, og da
hjelper det lite hvor pen malen er. Se avsnittet om SMTP i `SETUP.md`.

## Om koden

E-postklienter er ikke nettlesere. Ingen ekstern CSS, ingen webfonter man
kan stole på, og Outlook forstår verken flexbox eller grid. Derfor
tabelloppsett og inline-stiler, og Archivo bare som første valg i en
fallback-stack — de fleste vil se Helvetica eller Arial, og det er greit.

Knappen ligger i sin egen tabell. Uten det kollapser den i Outlook.

## Variabler Supabase fyller inn

- `{{ .ConfirmationURL }}` — innloggingslenken
- `{{ .Token }}` — sekssifret kode, alternativ til lenken
- `{{ .Email }}` — mottakerens adresse
- `{{ .SiteURL }}` — Site URL fra prosjektinnstillingene
