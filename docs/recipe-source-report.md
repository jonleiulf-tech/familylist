# Kapabilitetsrapport — oppskriftskilder

Generert 2026-09-02 18:51 UTC av `npm run recipes:audit`.
Én listeside og maks én detaljside per kilde, ≥1 s mellom forespørsler,
User-Agent `PlukkelistenBot/0.1 (+https://plukkelisten.no)`. MatPrat hentes aldri (kun robots-sjekk).

| Kilde | Status | robots ok | Sitemap | RSS | JSON-LD | Porsjoner | Mengder | Tid | Kategorier | Bilder | Anbefalt modus |
|---|---|---|---|---|---|---|---|---|---|---|---|
| REMA 1000 | OK | ja | ja | nei | ja | nei | ja | nei | ja | ja | STRUCTURED_DATA |
| TINE | OK | ja | nei | nei | ja | ja | ja | ja | ja | ja | STRUCTURED_DATA |
| MatPrat | LINK_DISCOVERY_ONLY | ja | ja | nei | ? | ? | ? | ? | ? | ? | LINK_DISCOVERY_ONLY |
| MENY | OK | ja | ja | nei | ja | ja | ja | ja | nei | ja | STRUCTURED_DATA |
| KIWI | OK | ja | ja | nei | ja | ja | ja | ja | nei | ja | STRUCTURED_DATA |
| Coop | OK | ja | ja | nei | nei | ? | ? | ? | ? | ? | SITEMAP_DISCOVERY |
| Oda | OK | ja | ja | nei | nei | ? | ? | ? | ? | ? | SITEMAP_DISCOVERY |
| Gilde | OK | ja | ja | nei | nei | ? | ? | ? | ? | ? | SITEMAP_DISCOVERY |
| FRUKT.no | OK | ja | ja | nei | ja | ja | ja | ja | nei | ja | STRUCTURED_DATA |
| Trines Matblogg | OK | ja | ja | ja | nei | ? | ? | ? | ? | ? | SITEMAP_DISCOVERY |
| Det Glade Kjøkken | OK | ja | ja | ja | nei | ? | ? | ? | ? | ? | SITEMAP_DISCOVERY |
| Linda Stuhaug | OK | ja | ja | nei | nei | ? | ? | ? | ? | ? | SITEMAP_DISCOVERY |
| Ida Maries Mat | OK | ja | ja | ja | ja | ja | ja | nei | nei | ja | STRUCTURED_DATA |

## Notater per kilde

- **REMA 1000** (prøveside: https://www.rema.no/oppskrifter/tiktok-oppskrifter/tortilla-kebabspyd/)
- **TINE** (prøveside: https://www.tine.no/oppskrifter/middag-og-hovedretter/pannekaker/grunnoppskrift-pannekaker)
- **MatPrat**: Kilden tillater ikke uthenting — kun robots/sitemap er sjekket, ingen oppskriftssider hentet.
- **MENY** (prøveside: https://meny.no/oppskrifter/pizza/pinsa-med-chorizo)
- **KIWI** (prøveside: https://kiwi.no/oppskrifter/pasta/pasta-med-kylling-og-pesto)
- **Coop** (prøveside: https://www.coop.no/inspirasjon/middag/tacofredag): detaljside uten gjenkjennbar JSON-LD Recipe
- **Oda** (prøveside: https://oda.com/no/recipes/): detaljside uten gjenkjennbar JSON-LD Recipe
- **Gilde** (prøveside: https://www.gilde.no/oppskrifter): detaljside uten gjenkjennbar JSON-LD Recipe
- **FRUKT.no** (prøveside: https://www.frukt.no/oppskrifter/kikertcurry-med-poteter/)
- **Trines Matblogg** (prøveside: https://trinesmatblogg.no/oppskrifter/): detaljside uten gjenkjennbar JSON-LD Recipe
- **Det Glade Kjøkken** (prøveside: https://detgladekjokken.no/oppskrifter/): detaljside uten gjenkjennbar JSON-LD Recipe
- **Linda Stuhaug** (prøveside: https://lindastuhaug.no/recipe/avokado-og-bringebaersmoothie-til-dei-sma): detaljside uten gjenkjennbar JSON-LD Recipe
- **Ida Maries Mat** (prøveside: https://idamariesmat.no/oppskrift/kyllingsuppe-med-urter-og-pasta/)

## Neste steg

- `NETWORK_BLOCKED` betyr at skriptet må kjøres fra en maskin med internett.
- Providere implementeres KUN for kilder med JSON-LD=ja i denne rapporten.
- Ingen bred crawling før rapporten er gjennomgått — dette er hele poenget med fase 1.
