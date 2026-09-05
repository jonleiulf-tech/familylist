# Originalbilder fra PSI

Én mappe per gruppe. Legg originalen her (jpg eller png, så stor som mulig),
kjør `npm run images`, og sett `image: '/images/psi/<slug>/card'` på gruppa i
`src/data/psi.js`. Originalen blir liggende uendret; nettversjonene havner i
`public/images/psi/<slug>/`.

Regler:
- Bare bilder PSI har rett til å publisere.
- Ingen genererte «medlemmer», ingen stockbilder utgitt som PSI.
- Ikke navngi personer i alt-tekst eller bildetekst uten at PSI vil det.

Kilder PSI har pekt på (ikke mottatt i repoet ennå):
- `PSI_Host_2026_treningstider_og_aktiviteter1.pdf`: fotball s. 4, volleyball s. 5,
  klatring s. 6, padel s. 7. Ingen verifisert SiGRUN-foto på s. 8.
- `Søknad høst 2026 - PSI.pdf`: fotball s. 2.

Trekk ut selve bildet fra PDF-en (f.eks. `pdfimages -png fil.pdf ut/`),
ikke skjermbilde av hele den designede siden.
