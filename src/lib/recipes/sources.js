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
    sample_urls: ['https://www.rema.no/oppskrifter/middagstips/'],
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
    ],
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
    notes: 'EKSPLISITT BEGRENSNING: MatPrat tilbyr ikke tredjeparts-API og tillater ikke uttrekk av oppskriftsbasen uten avtale. Kun lenking og manuell flagging til avtale ev. foreligger.',
  },
  {
    ...NO,
    id: 'meny',
    name: 'MENY',
    base_url: 'https://meny.no',
    integration_modes: ['STRUCTURED_DATA', 'SITEMAP_DISCOVERY', 'HTML_RECIPE', 'LINK_DISCOVERY_ONLY'],
    enabled: true,
    sample_urls: ['https://meny.no/oppskrifter/middagstips'],
    notes: 'Stor oppdagelseskilde. Bruk listesider til oppdaging; hent detaljer kun ved behov — aldri bulk fordi det er mulig.',
  },
  {
    ...NO,
    id: 'kiwi',
    name: 'KIWI',
    base_url: 'https://kiwi.no',
    integration_modes: ['STRUCTURED_DATA', 'SITEMAP_DISCOVERY', 'HTML_RECIPE', 'LINK_DISCOVERY_ONLY'],
    enabled: true,
    sample_urls: ['https://kiwi.no/billig-middag', 'https://kiwi.no/oppskrifter'],
    notes: 'Inspirasjon + fremtidig tilbudskontekst. En KIWI-oppskrift binder ALDRI handelen til KIWI — husholdningen kan kjøpe alt på Coop Extra.',
  },
  {
    ...NO,
    id: 'coop',
    name: 'Coop',
    base_url: 'https://www.coop.no',
    integration_modes: ['STRUCTURED_DATA', 'SITEMAP_DISCOVERY', 'HTML_RECIPE', 'LINK_DISCOVERY_ONLY'],
    enabled: true,
    sample_urls: ['https://www.coop.no/inspirasjon/middag', 'https://www.coop.no/oppskrifter'],
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
    notes: 'Modellen deres (oppskrift→porsjoner→ingredienser→varer) er den vi vil speile — men i VÅRT Item/Kassalapp-system. Lagre aldri Odas handlekurv.',
  },
  {
    ...NO,
    id: 'gilde',
    name: 'Gilde',
    base_url: 'https://www.gilde.no',
    integration_modes: ['STRUCTURED_DATA', 'SITEMAP_DISCOVERY', 'HTML_RECIPE', 'LINK_DISCOVERY_ONLY'],
    enabled: true,
    sample_urls: ['https://www.gilde.no/konsept/middagstips', 'https://www.gilde.no/oppskrifter'],
    notes: 'Kjøttbasert og tradisjonsmat. «Kvernet storfekjøtt» hardbindes aldri til Gilde-produkt — produktmatchingen velger etter preferanse og pris.',
  },
  {
    ...NO,
    id: 'frukt',
    name: 'FRUKT.no',
    base_url: 'https://www.frukt.no',
    integration_modes: ['STRUCTURED_DATA', 'SITEMAP_DISCOVERY', 'HTML_RECIPE', 'LINK_DISCOVERY_ONLY'],
    enabled: true,
    sample_urls: ['https://www.frukt.no/tema/middag/'],
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
    notes: 'Blogg: JSON-LD → RSS → enkelt-URL-import → lenk ut. Aldri aggressiv kravling.',
  },
  {
    ...NO,
    id: 'detgladekjokken',
    name: 'Det Glade Kjøkken',
    base_url: 'https://detgladekjokken.no',
    integration_modes: ['STRUCTURED_DATA', 'RSS_DISCOVERY', 'URL_IMPORT', 'LINK_DISCOVERY_ONLY'],
    enabled: true,
    sample_urls: ['https://detgladekjokken.no/middagstips/'],
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
    notes: '«Ukens fisk/kjøtt/vegetar» kan brukes som oppdagelsesfeed og inspirere vår egen ukesbalanse.',
  },
  {
    ...NO,
    id: 'idamariesmat',
    name: 'Ida Maries Mat',
    base_url: 'https://idamariesmat.no',
    integration_modes: ['STRUCTURED_DATA', 'RSS_DISCOVERY', 'URL_IMPORT', 'LINK_DISCOVERY_ONLY'],
    enabled: true,
    sample_urls: ['https://idamariesmat.no/tag/middagstips/'],
    notes: 'Blogg — samme varsomme modell som Trines.',
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
