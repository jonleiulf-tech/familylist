// Register over butikkenes EGNE tilbudssider på nettet.
//
// Dette er den tredje tilbudskilden ved siden av Kassalapp-prisskannet og
// eTilbudsavis: kjedene publiserer «ukens tilbud» som vanlige nettsider
// med tekst, og de kan høstes like høflig som oppskriftene — robots.txt
// respekteres, egen User-Agent, én side i sekundet.
//
// URL-ene her er startpunkter. Treffer en av dem feil (kjedene flytter
// sider), er `npm run offers:diagnose -- "<url>"` verktøyet for å finne
// den riktige — akkurat som med oppskriftene.

export const WEB_OFFER_SOURCES = [
  {
    id: 'kiwi_web',
    store_code: 'KIWI',
    store_name: 'KIWI',
    // Diagnose 30.08.26: JS-app uten priser i HTML-en (0 prisnøkkelord).
    // Slått av til kjeden ev. endrer siden — eTilbudsavis er hovedveien.
    enabled: false,
    urls: [
      // Prissjekk-siden (funnet av Jon): KIWIs priskutt med før- og nå-pris.
      'https://kiwi.no/dagligvarer/prissjekk',
    ],
  },
  {
    id: 'rema_web',
    store_code: 'REMA_1000',
    store_name: 'Rema 1000',
    // Diagnose 30.08.26: JS-app uten priser i HTML-en (0 prisnøkkelord).
    // Slått av til kjeden ev. endrer siden — eTilbudsavis er hovedveien.
    enabled: false,
    urls: ['https://www.rema.no/kampanjevarer/'],
  },
  {
    id: 'coop_extra_web',
    store_code: 'COOP_EXTRA',
    store_name: 'Coop Extra',
    // Diagnose 30.08.26: JS-app uten priser i HTML-en (0 prisnøkkelord).
    // Slått av til kjeden ev. endrer siden — eTilbudsavis er hovedveien.
    enabled: false,
    urls: ['https://coop.no/tilbud/extra/', 'https://coop.no/tilbud/'],
  },
  {
    id: 'meny_web',
    store_code: 'MENY_NO',
    store_name: 'Meny',
    // Diagnose 30.08.26: JS-app uten priser i HTML-en (0 prisnøkkelord).
    // Slått av til kjeden ev. endrer siden — eTilbudsavis er hovedveien.
    enabled: false,
    urls: ['https://meny.no/tilbud'],
  },
  {
    id: 'spar_web',
    store_code: 'SPAR_NO',
    store_name: 'Spar',
    // Diagnose 30.08.26: JS-app uten priser i HTML-en (0 prisnøkkelord).
    // Slått av til kjeden ev. endrer siden — eTilbudsavis er hovedveien.
    enabled: false,
    urls: ['https://spar.no/tilbud/'],
  },
  {
    id: 'joker_web',
    store_code: 'JOKER',
    store_name: 'Joker',
    // robots.txt sier nei til tilbudssidene — det respekteres, alltid.
    // Joker-avisen tas med kundeavis-skannet i stedet.
    enabled: false,
    urls: ['https://joker.no/tilbud/'],
  },
];
