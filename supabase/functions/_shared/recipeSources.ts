// AUTOGENERERT — ikke rediger.
// Kilde: src/lib/recipes/sources.js. Kjør `npm run sync:shared` etter endringer der.
// Testene ligger sammen med kilden.

// RecipeSource-registeret — den kanoniske definisjonen av alle kilder.
// SQL-seeden genereres HERFRA (scripts/generate-recipe-sources-sql.mjs),
// så registeret finnes aldri i to versjoner.
//
// Prinsipp: at en side er offentlig tilgjengelig betyr IKKE at vi har lov
// til å kopiere oppskriftsdatabasen dens. Hver kilde starter derfor
// konservativt: metadata og lenke ut er alltid greit; fremgangsmåter
// (redaksjonelt innhold) lagres ALDRI før vilkårene er vurdert og sier ja.
// «Se fremgangsmåte hos TINE» med utgående lenke er standardmodellen.

export const INTEGRATION_MODES = [
  'API',
  'STRUCTURED_DATA',
  'PUBLIC_JSON',
  'HTML_RECIPE',
  'SITEMAP_DISCOVERY',
  'RSS_DISCOVERY',
  'URL_IMPORT',
  'LINK_DISCOVERY_ONLY',
  'DISABLED_PENDING_PERMISSION',
];

// Prioritetsvektene fra spesifikasjonen. Kun én komponent i scoringen —
// en svært relevant internasjonal middag kan slå en irrelevant norsk.
export const PRIORITY = {
  LOCAL_FAMILY_RECIPE: 100,
  NORWEGIAN_RECIPE_SOURCE: 80,
  NORDIC_RECIPE_SOURCE: 70,
  INTERNATIONAL_HIGH_MATCH: 60,
  INTERNATIONAL_GENERAL: 40,
  AI_GENERATED: 20,
};

const NO = {
  country: 'NO',
  language: 'nb',
  priority: PRIORITY.NORWEGIAN_RECIPE_SOURCE,
  requires_attribution: true,
  terms_status: 'unreviewed',
  robots_status: 'unknown',
  can_discover: true,
  can_fetch_recipe: true,
  can_store_metadata: true,
  can_store_ingredients: true,     // vår normaliserte handlemodell, ikke sitatet
  can_store_instructions: false,   // redaksjonelt innhold — lenk ut inntil vilkår sier ja
  can_store_images: false,         // opphavsrett — bruk kildens URL, ikke kopi
};

export const RECIPE_SOURCES = [
  // ---------------------------------------------------------------------
  // Norske kjeder og produsenter
  // ---------------------------------------------------------------------
  {
    ...NO,
    id: 'rema',
    name: 'REMA 1000',
    base_url: 'https://www.rema.no',
    integration_modes: ['STRUCTURED_DATA', 'SITEMAP_DISCOVERY', 'HTML_RECIPE', 'LINK_DISCOVERY_ONLY'],
    enabled: true,
    sample_urls: [
      // Frø: ekte oppskriftsside (funnet av Jon) — snøballen ruller videre.
      'https://www.rema.no/oppskrifter/tiktok-oppskrifter/tortilla-kebabspyd/',
      'https://www.rema.no/oppskrifter/middagstips/',
      'https://www.rema.no/oppskrifter/tradisjonsmat/',
    ],
    // robots.txt revidert 2. september 2026 av npm run recipes:audit: oppskriftene er tillatt (4 Disallow-regler,
    // ingen treffer oss).
    robots_status: 'allowed',
    notes: 'Rike kildekategorier (råvare/måltid/anledning/sesong/retttype/kjøkken) — mappes til vår taksonomi, aldri adoptert rått.',
  },
  {
    ...NO,
    id: 'tine',
    name: 'TINE',
    base_url: 'https://www.tine.no',
    integration_modes: ['STRUCTURED_DATA', 'SITEMAP_DISCOVERY', 'HTML_RECIPE', 'LINK_DISCOVERY_ONLY'],
    enabled: true,
    sample_urls: [
      // Listesidene er tomme JS-skall — frøene under er ekte oppskriftssider
      // med JSON-LD, og hver av dem lenker videre til flere oppskrifter.
      'https://www.tine.no/oppskrifter/middag-og-hovedretter/pannekaker/grunnoppskrift-pannekaker',
      'https://www.tine.no/oppskrifter/tema/middag',
      // Alle frøene pekte på «middag». Tradisjonell husmannskost — supper,
      // gryter, grøt — hadde derfor ingen sti inn, og en klassiker som
      // blomkålsuppe fantes ikke i kokeboka i det hele tatt.
      'https://www.tine.no/oppskrifter/middag-og-hovedretter/supper',
      'https://www.tine.no/oppskrifter/middag-og-hovedretter/gryter',
      'https://www.tine.no/oppskrifter/tema/tradisjonsmat',
    ],
    // revidert 2. september 2026 av npm run recipes:audit: robots.txt svarer 404 — det finnes ingen regler å
    // bryte. JSON-LD bekreftet med porsjoner, mengder og tid.
    robots_status: 'allowed',
    notes: 'Gjennomgående eksplisitte porsjoner og tid («6 personer / 50 min») — prioriter oppskrifter med servings_confidence=high.',
  },
  {
    ...NO,
    id: 'matprat',
    name: 'MatPrat',
    base_url: 'https://www.matprat.no',
    integration_modes: ['DISABLED_PENDING_PERMISSION', 'LINK_DISCOVERY_ONLY'],
    enabled: false,
    can_fetch_recipe: false,
    can_store_ingredients: false,
    sample_urls: ['https://www.matprat.no/artikler/middagstips/'],
    // robots.txt revidert 2. september 2026 av npm run recipes:audit: tillater oppskriftsstiene, men kilden skal
    // fortsatt IKKE hentes — det er vilkårene, ikke robots, som stopper oss.
    robots_status: 'allowed',
    notes: 'EKSPLISITT BEGRENSNING: MatPrat tilbyr ikke tredjeparts-API og tillater ikke uttrekk av oppskriftsbasen uten avtale. Kun lenking og manuell flagging til avtale ev. foreligger. Ferdig forespørsel og oppskrift på å skru den på: docs/tillatelse-matprat.md — MatPrat drives av Opplysningskontoret for egg og kjøtt, som har samme mål som oss, så et ja er ikke urealistisk.',
  },
  {
    ...NO,
    id: 'meny',
    name: 'MENY',
    base_url: 'https://meny.no',
    integration_modes: ['STRUCTURED_DATA', 'SITEMAP_DISCOVERY', 'HTML_RECIPE', 'LINK_DISCOVERY_ONLY'],
    enabled: true,
    sample_urls: [
      // Frø: ekte oppskriftsside (funnet av Jon) — snøballen ruller videre.
      'https://meny.no/oppskrifter/pizza/pinsa-med-chorizo',
      'https://meny.no/oppskrifter/middagstips',
    ],
    // robots.txt revidert 2. september 2026 av npm run recipes:audit: oppskriftene er tillatt (20 Disallow-regler,
    // ingen treffer oss). JSON-LD bekreftet.
    robots_status: 'allowed',
    notes: 'Stor oppdagelseskilde. Bruk listesider til oppdaging; hent detaljer kun ved behov — aldri bulk fordi det er mulig.',
  },
  {
    ...NO,
    id: 'kiwi',
    name: 'KIWI',
    base_url: 'https://kiwi.no',
    integration_modes: ['STRUCTURED_DATA', 'SITEMAP_DISCOVERY', 'HTML_RECIPE', 'LINK_DISCOVERY_ONLY'],
    enabled: true,
    sample_urls: [
      'https://kiwi.no/billig-middag', 'https://kiwi.no/oppskrifter',
      'https://kiwi.no/oppskrifter/supper',
    ],
    // robots.txt verifisert 2. september 2026: «Allow: /», og ingen av
    // Disallow-reglene treffer oppskriftene.
    robots_status: 'allowed',
    notes: 'Inspirasjon + fremtidig tilbudskontekst. En KIWI-oppskrift binder ALDRI handelen til KIWI — husholdningen kan kjøpe alt på Coop Extra.',
  },
  {
    ...NO,
    id: 'coop',
    name: 'Coop',
    base_url: 'https://www.coop.no',
    integration_modes: ['STRUCTURED_DATA', 'SITEMAP_DISCOVERY', 'HTML_RECIPE', 'LINK_DISCOVERY_ONLY'],
    enabled: true,
    sample_urls: [
      'https://www.coop.no/inspirasjon/middag', 'https://www.coop.no/oppskrifter',
      'https://www.coop.no/oppskrifter/suppe',
    ],
    // robots.txt verifisert 2. september 2026: «Allow: /», ingen
    // oppskriftsstier i Disallow.
    robots_status: 'allowed',
    notes: 'Filtre (nasjonalitet/hovedråvare/type/sesong/tid/vanskelighet) mappes til vår taksonomi. «Kjøttdeig» i oppskrift er ingrediens; «Xtra kjøttdeig» er produktvalg — hold begrepene adskilt.',
  },
  {
    ...NO,
    id: 'oda',
    name: 'Oda',
    base_url: 'https://oda.com',
    integration_modes: ['STRUCTURED_DATA', 'PUBLIC_JSON', 'HTML_RECIPE', 'LINK_DISCOVERY_ONLY'],
    enabled: true,
    sample_urls: ['https://oda.com/no/about/middagstips/', 'https://oda.com/no/recipes/'],
    // robots.txt revidert 2. september 2026 av npm run recipes:audit: oppskriftene er tillatt.
    robots_status: 'allowed',
    notes: 'Modellen deres (oppskrift→porsjoner→ingredienser→varer) er den vi vil speile — men i VÅRT Item/Kassalapp-system. Lagre aldri Odas handlekurv.',
  },
  {
    ...NO,
    id: 'gilde',
    name: 'Gilde',
    base_url: 'https://www.gilde.no',
    integration_modes: ['STRUCTURED_DATA', 'SITEMAP_DISCOVERY', 'HTML_RECIPE', 'LINK_DISCOVERY_ONLY'],
    enabled: true,
    sample_urls: [
      'https://www.gilde.no/konsept/middagstips', 'https://www.gilde.no/oppskrifter',
      'https://www.gilde.no/oppskrifter/tradisjonsmat', 'https://www.gilde.no/oppskrifter/supper-og-gryter',
    ],
    // robots.txt revidert 2. september 2026 av npm run recipes:audit: oppskriftene er tillatt.
    robots_status: 'allowed',
    notes: 'Kjøttbasert og tradisjonsmat. «Kvernet storfekjøtt» hardbindes aldri til Gilde-produkt — produktmatchingen velger etter preferanse og pris.',
  },
  {
    ...NO,
    id: 'frukt',
    name: 'FRUKT.no',
    base_url: 'https://www.frukt.no',
    integration_modes: ['STRUCTURED_DATA', 'SITEMAP_DISCOVERY', 'HTML_RECIPE', 'LINK_DISCOVERY_ONLY'],
    enabled: true,
    sample_urls: [
      'https://www.frukt.no/tema/middag/',
      'https://www.frukt.no/oppskrifter/enkel-blomkalsuppe/',
      'https://www.frukt.no/oppskrifter/lys-lapskaus/',
    ],
    // robots.txt revidert 2. september 2026 av npm run recipes:audit: tillatt. JSON-LD bekreftet med porsjoner,
    // mengder og tid.
    robots_status: 'allowed',
    notes: 'Positivt signal når vi vil ha mer grønnsaker, familievennlig, billig eller rask hverdag — kildetags (Rask/Billig/Sunn/Familievennlig) går rett i scoringen.',
  },

  // ---------------------------------------------------------------------
  // Norske matblogger — redaksjonelle kilder, varsommere håndtering
  // ---------------------------------------------------------------------
  {
    ...NO,
    id: 'trines',
    name: 'Trines Matblogg',
    base_url: 'https://trinesmatblogg.no',
    integration_modes: ['STRUCTURED_DATA', 'RSS_DISCOVERY', 'URL_IMPORT', 'LINK_DISCOVERY_ONLY'],
    enabled: true,
    sample_urls: ['https://trinesmatblogg.no/category/middag/'],
    // robots.txt revidert 2. september 2026 av npm run recipes:audit: tillatt. Har RSS — brukes til å finne
    // enkeltoppskrifter i stedet for å kravle listesider.
    robots_status: 'allowed',
    notes: 'Blogg: JSON-LD → RSS → enkelt-URL-import → lenk ut. Aldri aggressiv kravling.',
  },
  {
    ...NO,
    id: 'detgladekjokken',
    name: 'Det Glade Kjøkken',
    base_url: 'https://detgladekjokken.no',
    integration_modes: ['STRUCTURED_DATA', 'RSS_DISCOVERY', 'URL_IMPORT', 'LINK_DISCOVERY_ONLY'],
    enabled: true,
    sample_urls: [
      'https://detgladekjokken.no/middagstips/',
      'https://detgladekjokken.no/oppskrift/blomkalsuppe/',
      'https://detgladekjokken.no/oppskrift/enkel-lapskaus/',
    ],
    // robots.txt revidert 2. september 2026 av npm run recipes:audit: tillatt. Har RSS.
    robots_status: 'allowed',
    notes: 'Blogg — samme varsomme modell som Trines.',
  },
  {
    ...NO,
    id: 'lindastuhaug',
    name: 'Linda Stuhaug',
    base_url: 'https://lindastuhaug.no',
    integration_modes: ['STRUCTURED_DATA', 'RSS_DISCOVERY', 'URL_IMPORT', 'LINK_DISCOVERY_ONLY'],
    enabled: true,
    sample_urls: ['https://lindastuhaug.no/'],
    // robots.txt revidert 2. september 2026 av npm run recipes:audit: tillatt. Oppskriftssiden hadde ingen JSON-LD.
    robots_status: 'allowed',
    notes: '«Ukens fisk/kjøtt/vegetar» kan brukes som oppdagelsesfeed og inspirere vår egen ukesbalanse.',
  },
  {
    ...NO,
    id: 'idamariesmat',
    name: 'Ida Maries Mat',
    base_url: 'https://idamariesmat.no',
    integration_modes: ['STRUCTURED_DATA', 'RSS_DISCOVERY', 'URL_IMPORT', 'LINK_DISCOVERY_ONLY'],
    enabled: true,
    sample_urls: [
      'https://idamariesmat.no/tag/middagstips/',
      'https://idamariesmat.no/category/supper/',
      'https://idamariesmat.no/oppskrift/kyllingfrikasse/',
    ],
    // robots.txt revidert 2. september 2026 av npm run recipes:audit: ingen Disallow i det hele tatt. JSON-LD
    // bekreftet med porsjoner og mengder.
    robots_status: 'allowed',
    notes: 'Blogg — samme varsomme modell som Trines.',
  },

  // ---------------------------------------------------------------------
  // Nye kandidater, funnet i nettresearch 2. september 2026.
  //
  // ALLE står avslått. De skal gjennom `npm run recipes:audit` først —
  // researchen kunne ikke lese rå <script type="application/ld+json">, så
  // JSON-LD er uverifisert for hver enkelt. Ingen kilde slås på før
  // revisjonen har bekreftet både robots.txt og strukturerte data.
  //
  // Frø-URL-ene peker med vilje på TRADISJONSMAT, supper og grøt. Det er
  // hullet i basen: dagens kilder handler alle om «middagstips».
  // ---------------------------------------------------------------------
  {
    ...NO,
    id: 'norsktradisjonsmat',
    name: 'Norsk Tradisjonsmat',
    base_url: 'https://norsktradisjonsmat.no',
    integration_modes: ['STRUCTURED_DATA', 'SITEMAP_DISCOVERY', 'HTML_RECIPE', 'LINK_DISCOVERY_ONLY'],
    enabled: false,
    // Den ENESTE kilden vi har funnet med uttrykkelig tillatelse: «Oppskrifter
    // fra sidene våre kan brukes vederlagsfritt, men med henvisning til
    // norsktradisjonsmat.no og lenke til oppskriften.» Bilder og video er
    // uttrykkelig unntatt, og det respekterer can_store_images: false.
    terms_status: 'tillatt_med_kildehenvisning',
    sample_urls: [
      'https://norsktradisjonsmat.no/oppskrift/betasuppe/',
      'https://norsktradisjonsmat.no/oppskrift/kjottkaker/',
      'https://norsktradisjonsmat.no/oppskrift/plukkfisk-2/',
      'https://norsktradisjonsmat.no/finn-oppskrifter/',
    ],
    notes: 'Norges Bygdekvinnelag. Ca. 1 083 oppskrifter, hvorav 366 middagsretter og 43 grøt — presis treff på hullet vårt. Eier oppgir at oppskrifter kan gjenbrukes vederlagsfritt med kildehenvisning og lenke; bilder og video er unntatt. Fremgangsmåten lagres likevel IKKE før Jon har lest vilkårene selv — vi lenker ut som ellers.',
  },
  {
    ...NO,
    id: 'gladkokken',
    name: 'Gladkokken',
    base_url: 'https://gladkokken.no',
    integration_modes: ['STRUCTURED_DATA', 'SITEMAP_DISCOVERY', 'HTML_RECIPE', 'LINK_DISCOVERY_ONLY'],
    enabled: false,
    sample_urls: [
      'https://gladkokken.no/oppskrifter/tradisjonsmat',
      'https://gladkokken.no/oppskrifter/plukkfisk-torsk-fiskegryte-norskmat-tradisjonsmat',
      'https://gladkokken.no/oppskrifter/min-beste-lapskaus-deilig-og-naeringsrik-middag',
    ],
    notes: 'Egen tradisjonsmat-kategori: sodd, ertesuppe med svineknoke, kjøttpudding, plukkfisk, fårikål, lapskaus, kjøttkaker. Anslag 600–700 oppskrifter. Ingen gjenbruksvilkår funnet — samme varsomme modell som de andre bloggene.',
  },
  {
    ...NO,
    id: 'melk',
    name: 'Melk.no',
    base_url: 'https://www.melk.no',
    integration_modes: ['STRUCTURED_DATA', 'SITEMAP_DISCOVERY', 'HTML_RECIPE', 'LINK_DISCOVERY_ONLY'],
    enabled: false,
    sample_urls: [
      'https://www.melk.no/Oppskrifter/Tradisjonsmelkeretter',
      'https://www.melk.no/Oppskrifter/Groeter/Tradisjonsgroet/Roemmegroet',
      'https://www.melk.no/Oppskrifter/Supper/Supper-med-kjoett/Blomkaalsuppe',
    ],
    notes: 'Opplysningskontoret for melk (TINE, Q-Meieriene, Synnøve Finden). Rømmegrøt, tradisjonelle melkeretter, supper og gratenger. Bilder krever kontakt med rettighetshaver — vi lagrer ingen bilder uansett.',
  },
  {
    ...NO,
    id: 'brodogkorn',
    name: 'Brød og Korn',
    base_url: 'https://brodogkorn.no',
    integration_modes: ['STRUCTURED_DATA', 'SITEMAP_DISCOVERY', 'HTML_RECIPE', 'LINK_DISCOVERY_ONLY'],
    enabled: false,
    sample_urls: [
      'https://brodogkorn.no/oppskrifter/tradisjon/',
      'https://brodogkorn.no/oppskrift/setergrot/',
      'https://brodogkorn.no/oppskrift/frigardsgrot/',
    ],
    notes: 'Opplysningskontoret for brød og korn. Setergrøt, frigardsgrøt, smørgrøt fra Suldal. Krever kildehenvisning: «Det SKAL følge kildehenvisning med bilder og oppskrifter.» MERK: virksomheten videreføres i samarbeid med MatPrat, som står avslått hos oss i påvente av tillatelse — sjekk om samme forbehold gjelder her før den slås på.',
  },
  {
    ...NO,
    id: 'godfisk',
    name: 'Godfisk',
    base_url: 'https://www.godfisk.no',
    integration_modes: ['STRUCTURED_DATA', 'SITEMAP_DISCOVERY', 'HTML_RECIPE', 'LINK_DISCOVERY_ONLY'],
    // Slått på etter kilderevisjonen 5. sept 2026: robots ok, JSON-LD med
    // porsjoner, tid og bilder på prøvesiden.
    enabled: true,
    sample_urls: [
      'https://www.godfisk.no/oppskrifter/hyse/klassisk-fiskesuppe/',
      'https://www.godfisk.no/oppskrifter/skrei/klassisk-skreimolje/',
      'https://www.godfisk.no/oppskrifter/torsk/fiskesuppe-med-torsk-og-reker/',
    ],
    notes: 'Norges sjømatråd. Klassisk fiskesuppe, skreimølje, plukkfisk. Treffer familiens egen regel om minst to fiskemiddager i uka.',
  },
  {
    ...NO,
    id: 'prior',
    name: 'PRIOR',
    base_url: 'https://www.prior.no',
    integration_modes: ['STRUCTURED_DATA', 'SITEMAP_DISCOVERY', 'HTML_RECIPE', 'LINK_DISCOVERY_ONLY'],
    // Slått på etter kilderevisjonen 5. sept 2026: robots ok, JSON-LD med
    // porsjoner, tid og bilder på prøvesiden.
    enabled: true,
    sample_urls: [
      'https://www.prior.no/oppskrifter/asiatisk-kyllingsuppe',
      'https://www.prior.no/oppskrifter/italiensk-kyllingsuppe',
    ],
    notes: 'Nortura, samme konsern som Gilde. Ca. 305 oppskrifter, kylling og kalkun. Ikke husmannskost, men bredde på hverdagsmat.',
  },
  {
    ...NO,
    id: 'mills',
    name: 'Mills',
    base_url: 'https://mills.no',
    integration_modes: ['STRUCTURED_DATA', 'SITEMAP_DISCOVERY', 'HTML_RECIPE', 'LINK_DISCOVERY_ONLY'],
    // Slått på etter kilderevisjonen 5. sept 2026: robots ok, JSON-LD med
    // porsjoner, tid og bilder på prøvesiden.
    enabled: true,
    sample_urls: [
      'https://mills.no/oppskriftstema/supper/',
      'https://mills.no/melange/oppskrift/rask-enkel-kjottsuppe/',
    ],
    notes: 'Mills AS (Agra Foods). Suppearkiv. Lavere prioritet enn de seks over.',
  },
  {
    ...NO,
    id: 'hoff',
    name: 'HOFF',
    base_url: 'https://www.hoff.no',
    integration_modes: ['STRUCTURED_DATA', 'HTML_RECIPE', 'LINK_DISCOVERY_ONLY'],
    enabled: false,
    sample_urls: [
      'https://www.hoff.no/potetglede-oppskrifter/',
      'https://www.hoff.no/potetglede-oppskrifter/kantarellsuppe-med-bacon/',
    ],
    notes: 'HOFF SA. Lite arkiv (ca. 42), potet og norsk råvaretradisjon. Bildene er uttrykkelig opphavsrettsbeskyttet — vi lagrer ingen bilder. Researchen fant ikke JSON-LD i den prosesserte HTML-en, så denne er den mest usikre av de nye.',
  },

  // ---------------------------------------------------------------------
  // Internasjonale API-er — bredde og oppdaging, aldri appens identitet
  // ---------------------------------------------------------------------
  {
    id: 'edamam',
    name: 'Edamam',
    base_url: 'https://api.edamam.com',
    country: 'INT',
    language: 'en',
    priority: PRIORITY.INTERNATIONAL_GENERAL,
    integration_modes: ['API'],
    enabled: false,   // slås på når EDAMAM_APP_ID/EDAMAM_APP_KEY er satt som secrets
    can_discover: true,
    can_fetch_recipe: true,
    can_store_metadata: true,
    can_store_ingredients: true,
    can_store_instructions: false,  // Edamam leverer lenker, ikke fremgangsmåter
    can_store_images: false,
    requires_attribution: true,
    terms_status: 'plan_restricted',
    robots_status: 'n/a',
    sample_urls: [],
    notes: 'Høyvolums SØK/OPPDAGING. Persister aldri fulle oppskrifter — lagre ekstern id + kilde-URL, hent etter planens bruksmodell. Secrets: EDAMAM_APP_ID, EDAMAM_APP_KEY.',
  },
  {
    id: 'api_ninjas',
    name: 'API Ninjas Recipe',
    base_url: 'https://api.api-ninjas.com',
    country: 'INT',
    language: 'en',
    priority: PRIORITY.INTERNATIONAL_GENERAL,
    integration_modes: ['API'],
    enabled: false,
    can_discover: true,
    can_fetch_recipe: true,
    can_store_metadata: true,
    can_store_ingredients: true,
    can_store_instructions: false,
    can_store_images: false,
    requires_attribution: true,
    terms_status: 'plan_restricted',
    robots_status: 'n/a',
    sample_urls: [],
    notes: 'Strukturerte ingredienser (navn/mengde/enhet). Premium-søk deaktiveres pent når kontoen ikke støtter det. Secret: API_NINJAS_KEY.',
  },
  {
    id: 'recipe_api',
    name: 'Recipe API',
    base_url: 'https://api.recipeapi.dev',
    country: 'INT',
    language: 'en',
    priority: PRIORITY.INTERNATIONAL_GENERAL,
    integration_modes: ['API'],
    enabled: false,
    can_discover: true,
    can_fetch_recipe: true,
    can_store_metadata: true,
    can_store_ingredients: true,
    can_store_instructions: false,
    can_store_images: false,
    requires_attribution: true,
    terms_status: 'plan_restricted',
    robots_status: 'n/a',
    sample_urls: [],
    notes: 'Kvalitet framfor volum: yield_count brukes direkte som base_servings. Respekter planens cache-regler — persister aldri lenger enn planen tillater. Secret: RECIPE_API_KEY.',
  },
  {
    id: 'themealdb',
    name: 'TheMealDB',
    base_url: 'https://www.themealdb.com',
    country: 'INT',
    language: 'en',
    priority: PRIORITY.INTERNATIONAL_GENERAL,
    integration_modes: ['API'],
    enabled: true,    // gratis utviklingsnøkkel '1' — trygg for test og inspirasjon
    can_discover: true,
    can_fetch_recipe: true,
    can_store_metadata: true,
    can_store_ingredients: true,
    can_store_instructions: false,
    can_store_images: false,
    requires_attribution: true,
    terms_status: 'free_dev',
    robots_status: 'n/a',
    sample_urls: ['https://www.themealdb.com/api/json/v1/1/search.php?s=salmon'],
    notes: 'Liten katalog — utvikling, kjøkkenoppdaging og tilfeldig inspirasjon. Aldri hovedarkivet.',
  },
];

export const getSource = (id) => RECIPE_SOURCES.find((s) => s.id === id) ?? null;
export const enabledSources = () => RECIPE_SOURCES.filter((s) => s.enabled);
export const norwegianSources = () => RECIPE_SOURCES.filter((s) => s.country === 'NO');
