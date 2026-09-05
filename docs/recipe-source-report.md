# Kapabilitetsrapport — oppskriftskilder

Generert 2026-09-05 06:31 UTC av `npm run recipes:audit`.
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
| Gilde | OK | ja | ja | nei | ja | ja | nei | ja | ja | ja | STRUCTURED_DATA |
| FRUKT.no | OK | ja | ja | nei | ja | ja | ja | ja | nei | ja | STRUCTURED_DATA |
| Trines Matblogg | OK | ja | ja | ja | nei | ? | ? | ? | ? | ? | SITEMAP_DISCOVERY |
| Det Glade Kjøkken | OK | ja | ja | ja | nei | ? | ? | ? | ? | ? | SITEMAP_DISCOVERY |
| Linda Stuhaug | OK | ja | ja | nei | nei | ? | ? | ? | ? | ? | SITEMAP_DISCOVERY |
| Ida Maries Mat | OK | ja | ja | ja | ja | ja | ja | nei | nei | ja | STRUCTURED_DATA |
| Norsk Tradisjonsmat | OK | ja | ja | nei | nei | ? | ? | ? | ? | ? | SITEMAP_DISCOVERY |
| Gladkokken | OK | ja | nei | nei | nei | ? | ? | ? | ? | ? | LINK_DISCOVERY_ONLY |
| Melk.no | OK | ja | ja | nei | nei | ? | ? | ? | ? | ? | SITEMAP_DISCOVERY |
| Brød og Korn | OK | ja | ja | ja | nei | ? | ? | ? | ? | ? | SITEMAP_DISCOVERY |
| Godfisk | OK | ja | ja | nei | ja | ja | ja | ja | ja | ja | STRUCTURED_DATA |
| PRIOR | OK | ja | ja | nei | ja | ja | nei | ja | ja | ja | STRUCTURED_DATA |
| Mills | OK | ja | ja | ja | ja | ja | ja | ja | ja | ja | STRUCTURED_DATA |
| HOFF | OK | ja | ja | nei | nei | ? | ? | ? | ? | ? | SITEMAP_DISCOVERY |

## Notater per kilde

- **REMA 1000** (prøveside: https://www.rema.no/oppskrifter/tiktok-oppskrifter/tortilla-kebabspyd/)
- **TINE** (prøveside: https://www.tine.no/oppskrifter/middag-og-hovedretter/pannekaker/grunnoppskrift-pannekaker)
- **MatPrat**: Kilden tillater ikke uthenting — kun robots/sitemap er sjekket, ingen oppskriftssider hentet.
- **MENY** (prøveside: https://meny.no/oppskrifter/pizza/pinsa-med-chorizo)
- **KIWI** (prøveside: https://kiwi.no/oppskrifter/pasta/pasta-med-kylling-og-pesto)
- **Coop** (prøveside: https://www.coop.no/inspirasjon/middag/tacofredag): oppskriftsside uten gjenkjennbar JSON-LD Recipe
- **Oda** (prøveside: https://oda.com/no/categories/32-middager-og-tilbehor/): oppskriftsside uten gjenkjennbar JSON-LD Recipe
- **Gilde** (prøveside: https://www.gilde.no/oppskrifter/italiensk-polsegrateng)
- **FRUKT.no** (prøveside: https://www.frukt.no/oppskrifter/kikertcurry-med-poteter/)
- **Trines Matblogg** (prøveside: https://trinesmatblogg.no/recipe/kylling-med-gochujangglaze-og-gulrot-og-agurksalat/): oppskriftsside uten gjenkjennbar JSON-LD Recipe
- **Det Glade Kjøkken** (prøveside: https://detgladekjokken.no/kategori/middag/middag-under-halvtimen/): oppskriftsside uten gjenkjennbar JSON-LD Recipe
- **Linda Stuhaug** (prøveside: https://lindastuhaug.no/recipe/avokado-og-bringebaersmoothie-til-dei-sma): oppskriftsside uten gjenkjennbar JSON-LD Recipe
- **Ida Maries Mat** (prøveside: https://idamariesmat.no/oppskrift/kyllingsuppe-med-urter-og-pasta/)
- **Norsk Tradisjonsmat** (prøveside: https://norsktradisjonsmat.no/finn-oppskrifter/): oppskriftsside uten gjenkjennbar JSON-LD Recipe
- **Gladkokken** (prøveside: https://gladkokken.no/en/oppskrifter/tradisjonsmat): oppskriftsside uten gjenkjennbar JSON-LD Recipe
- **Melk.no** (prøveside: https://www.melk.no/Oppskrifter/Pannekaker): oppskriftsside uten gjenkjennbar JSON-LD Recipe
- **Brød og Korn** (prøveside: https://brodogkorn.no/oppskrifter/ekstra-grovt/): oppskriftsside uten gjenkjennbar JSON-LD Recipe
- **Godfisk** (prøveside: https://www.godfisk.no/oppskrifter/hyse/klassisk-fiskesuppe/)
- **PRIOR** (prøveside: https://www.prior.no/oppskrifter/asiatisk-kyllingsuppe)
- **Mills** (prøveside: https://mills.no/melange/oppskrift/tacosuppe/)
- **HOFF** (prøveside: https://www.hoff.no/potetglede-oppskrifter/hoff-opphogde/): oppskriftsside uten gjenkjennbar JSON-LD Recipe

## Neste steg

- `NETWORK_BLOCKED` betyr at skriptet må kjøres fra en maskin med internett.
- Providere implementeres KUN for kilder med JSON-LD=ja i denne rapporten.
- Ingen bred crawling før rapporten er gjennomgått — dette er hele poenget med fase 1.
