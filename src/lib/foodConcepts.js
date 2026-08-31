// Ingrediens-konseptlaget: broen mellom tre verdener som kaller samme vare
// tre ulike ting.
//
//   oppskriften sier   «400 g kjøttdeig»
//   tilbudet sier      «Gilde kjøttdeig av storfe 400 g»
//   næringstabellen    «Kjøttdeig, storfe, 14 % fett, rå»
//
// Uten dette laget må hver funksjon gjette på nytt med ordstammer, og
// gjetningen er nøyaktig god nok til en hyggelig hint — ikke til å avgjøre
// hva familien skal spise, og slett ikke til å regne kalorier.
//
// ── Om kalori- og proteintallene ────────────────────────────────────────
// `kcal` og `protein` er per 100 g av varen slik den KJØPES (rå, der det
// er naturlig). Verdiene her er kuraterte omtrentligheter ment som et
// utgangspunkt, IKKE offisielle tall.
//
// Matvaretabellen fra Mattilsynet er den riktige kilden, publiseres én gang
// i året og skal seedes inn via scripts/import-matvaretabellen.mjs. Fram til
// den kjøringen er gjort, er `source: 'anslag'` — og appen sier det høyt i
// stedet for å late som om tallet er fasit.

/**
 * @typedef {object} Concept
 * @property {string} id      slug
 * @property {string} label   norsk visningsnavn
 * @property {string[]} syn   ord som skal treffe konseptet (forstavelser)
 * @property {number} kcal    kcal per 100 g
 * @property {number} protein g protein per 100 g
 * @property {number|null} g  typisk vekt for «1 stk», null når stk er meningsløst
 * @property {'bearing'|'normal'|'background'} role hvor mye varen bærer en middag
 */

/** @type {Concept[]} */
export const CONCEPTS = [
  // Rekkefølgen avgjør ved uavgjort synonymlengde. «Frossenpizza» må stå
  // før kjøttdeig, ellers blir «Grandiosa Kjøttdeig & Løk» et kjøttdeigtilbud.
  { id: 'frossenpizza', label: 'Frossenpizza', syn: ['grandiosa', 'frossenpizza', 'ristorante'], kcal: 240, protein: 10, g: null, pack: 350, role: 'bearing' },
  { id: 'plantemelk', label: 'Plantedrikk', syn: ['soyamelk', 'soyadrikk', 'havredrikk', 'havremelk', 'mandelmelk', 'mandeldrikk', 'plantedrikk'], kcal: 45, protein: 3, g: null, role: 'normal' },

  // ── Kjøtt ──────────────────────────────────────────────────────────────
  { id: 'kjottdeig', label: 'Kjøttdeig', syn: ['kjøttdeig', 'karbonadedeig', 'hakket storfe', 'familiedeig', 'medisterdeig', 'grillkarbonade'], kcal: 176, protein: 19, g: null, pack: 400, role: 'bearing' },
  { id: 'kylling', label: 'Kylling', syn: ['kylling', 'kyllingfilet', 'kyllingbryst', 'kyllinglår', 'kyllingkjøtt'], kcal: 106, protein: 23, g: 150, role: 'bearing' },
  { id: 'kalkun', label: 'Kalkun', syn: ['kalkun', 'kalkunfilet'], kcal: 104, protein: 24, g: 150, role: 'bearing' },
  { id: 'svinekjott', label: 'Svinekjøtt', syn: ['svin', 'svinekjøtt', 'svinefilet', 'koteletter', 'nakkekoteletter', 'ribbe', 'svinekoteletter', 'svinekam', 'svinestek', 'bogstek', 'grillribbe', 'flesk'], kcal: 210, protein: 20, g: 180, role: 'bearing' },
  { id: 'storfe', label: 'Storfekjøtt', syn: ['storfe', 'biff', 'entrecote', 'indrefilet', 'ytrefilet', 'roastbiff', 'høyrygg'], kcal: 190, protein: 21, g: 200, role: 'bearing' },
  { id: 'lam', label: 'Lammekjøtt', syn: ['lam', 'lammelår', 'fårikål', 'lammekoteletter', 'pinnekjøtt', 'fenalår'], kcal: 230, protein: 19, g: 200, role: 'bearing' },
  { id: 'bacon', label: 'Bacon', syn: ['bacon', 'sideflesk'], kcal: 380, protein: 14, g: null, pack: 140, role: 'normal' },
  { id: 'polse', label: 'Pølse', syn: ['pølse', 'pølser', 'grillpølse', 'wienerpølse', 'chorizo', 'kyllingpølse', 'servelat', 'julepølse'], kcal: 260, protein: 12, g: 70, role: 'bearing' },
  { id: 'skinke', label: 'Skinke', syn: ['skinke', 'kokt skinke', 'spekeskinke'], kcal: 130, protein: 18, g: null, role: 'normal' },
  { id: 'kjottkaker', label: 'Kjøttkaker', syn: ['kjøttkaker', 'karbonader', 'medisterkaker'], kcal: 220, protein: 14, g: 60, role: 'bearing' },

  // ── Fisk og sjømat ─────────────────────────────────────────────────────
  { id: 'laks', label: 'Laks', syn: ['laks', 'laksefilet', 'røkelaks', 'salma', 'ryggfilet'], kcal: 208, protein: 20, g: 150, role: 'bearing' },
  { id: 'torsk', label: 'Torsk', syn: ['torsk', 'torskefilet', 'skrei'], kcal: 82, protein: 18, g: 150, role: 'bearing' },
  { id: 'sei', label: 'Sei', syn: ['sei', 'seifilet'], kcal: 81, protein: 18, g: 150, role: 'bearing' },
  { id: 'orret', label: 'Ørret', syn: ['ørret', 'ørretfilet', 'regnbueørret'], kcal: 168, protein: 20, g: 150, role: 'bearing' },
  { id: 'reker', label: 'Reker', syn: ['reker', 'scampi', 'kongereker'], kcal: 99, protein: 20, g: null, role: 'bearing' },
  { id: 'fiskepinner', label: 'Fiskepinner', syn: ['fiskepinner'], kcal: 200, protein: 12, g: 30, pack: 400, role: 'bearing' },
  { id: 'fiskekaker', label: 'Fiskekaker', syn: ['fiskekaker', 'fiskeboller', 'fiskepudding'], kcal: 105, protein: 11, g: 65, pack: 400, role: 'bearing' },
  { id: 'makrell', label: 'Makrell', syn: ['makrell', 'makrell i tomat'], kcal: 205, protein: 19, g: null, role: 'bearing' },
  { id: 'tunfisk', label: 'Tunfisk', syn: ['tunfisk'], kcal: 116, protein: 26, g: null, role: 'bearing' },

  // ── Vegetarisk protein ─────────────────────────────────────────────────
  { id: 'tofu', label: 'Tofu', syn: ['tofu'], kcal: 120, protein: 13, g: null, role: 'bearing' },
  { id: 'kikerter', label: 'Kikerter', syn: ['kikerter', 'kikerte'], kcal: 130, protein: 7, g: null, pack: 380, role: 'bearing' },
  { id: 'linser', label: 'Linser', syn: ['linser', 'røde linser'], kcal: 338, protein: 24, g: null, pack: 500, role: 'bearing' },
  { id: 'bonner', label: 'Bønner', syn: ['bønner', 'kidneybønner', 'sorte bønner', 'hvite bønner'], kcal: 127, protein: 8, g: null, pack: 380, role: 'bearing' },
  { id: 'egg', label: 'Egg', syn: ['egg'], kcal: 143, protein: 13, g: 60, role: 'bearing' },

  // ── Meieri ─────────────────────────────────────────────────────────────
  { id: 'melk', label: 'Melk', syn: ['melk', 'lettmelk', 'helmelk', 'skummet melk'], kcal: 42, protein: 3.4, g: null, role: 'normal' },
  { id: 'flote', label: 'Fløte', syn: ['fløte', 'kremfløte', 'matfløte'], kcal: 340, protein: 2, g: null, role: 'background' },
  { id: 'romme', label: 'Rømme', syn: ['rømme', 'seterrømme'], kcal: 350, protein: 2.5, g: null, pack: 300, role: 'background' },
  { id: 'creme_fraiche', label: 'Crème fraîche', syn: ['creme fraiche', 'crème fraîche'], kcal: 220, protein: 3, g: null, pack: 300, role: 'background' },
  { id: 'ost', label: 'Ost', pack: 150, syn: ['ost', 'norvegia', 'jarlsberg', 'gulost', 'revet ost', 'pizzaost', 'kremost', 'hvitost', 'cheddar', 'parmesan', 'gudbrandsdalsost'], kcal: 350, protein: 25, g: null, role: 'normal' },
  { id: 'fetaost', label: 'Fetaost', syn: ['feta', 'fetaost', 'salatost'], kcal: 260, protein: 14, g: null, pack: 150, role: 'normal' },
  { id: 'smor', label: 'Smør', syn: ['smør', 'meierismør', 'margarin', 'bremykt', 'melange'], kcal: 740, protein: 0.5, g: null, role: 'background' },
  { id: 'yoghurt', label: 'Yoghurt', syn: ['yoghurt'], kcal: 62, protein: 5, g: null, pack: 500, role: 'background' },

  // ── Karbohydrat ────────────────────────────────────────────────────────
  { id: 'potet', label: 'Potet', syn: ['potet', 'poteter', 'mandelpotet'], kcal: 75, protein: 2, g: 110, role: 'normal' },
  { id: 'ris', label: 'Ris', syn: ['ris', 'jasminris', 'basmatiris', 'grøtris'], kcal: 355, protein: 7, g: null, pack: 1000, role: 'normal' },
  { id: 'pasta', label: 'Pasta', syn: ['pasta', 'spaghetti', 'penne', 'makaroni', 'fusilli', 'tagliatelle'], kcal: 360, protein: 12, g: null, pack: 500, role: 'normal' },
  { id: 'nudler', label: 'Nudler', syn: ['nudler', 'eggnudler', 'risnudler'], kcal: 350, protein: 11, g: null, pack: 250, role: 'normal' },
  { id: 'brod', label: 'Brød', syn: ['brød', 'grovbrød', 'loff', 'rundstykker'], kcal: 250, protein: 9, g: null, role: 'normal' },
  { id: 'tortilla', label: 'Tortillalefser', syn: ['tortilla', 'tortillalefser', 'lefser', 'wraps', 'tacolefser', 'taco lefser', 'tacoskjell'], kcal: 300, protein: 8, g: 45, role: 'normal' },
  { id: 'lasagneplater', label: 'Lasagneplater', syn: ['lasagneplater', 'lasagneark'], kcal: 355, protein: 12, g: null, pack: 250, role: 'normal' },
  { id: 'couscous', label: 'Couscous', syn: ['couscous', 'bulgur', 'quinoa'], kcal: 350, protein: 12, g: null, pack: 500, role: 'normal' },
  { id: 'burgerbrod', label: 'Burgerbrød', syn: ['burgerbrød', 'hamburgerbrød'], kcal: 280, protein: 9, g: 70, role: 'normal' },

  // ── Grønnsaker ─────────────────────────────────────────────────────────
  { id: 'lok', label: 'Løk', syn: ['løk', 'gul løk', 'rødløk', 'sjalottløk'], kcal: 40, protein: 1.1, g: 110, role: 'normal' },
  { id: 'purre', label: 'Purre', syn: ['purre', 'purreløk'], kcal: 61, protein: 1.5, g: 200, role: 'normal' },
  { id: 'gulrot', label: 'Gulrot', syn: ['gulrot', 'gulrøtter'], kcal: 41, protein: 0.9, g: 80, role: 'normal' },
  { id: 'paprika', label: 'Paprika', syn: ['paprika'], kcal: 31, protein: 1, g: 150, role: 'normal' },
  { id: 'tomat', label: 'Tomat', syn: ['tomat', 'tomater', 'cherrytomater'], kcal: 18, protein: 0.9, g: 100, role: 'normal' },
  { id: 'hermetiske_tomater', label: 'Hermetiske tomater', syn: ['hermetiske tomater', 'knuste tomater', 'tomatsaus', 'passata', 'hakkede tomater', 'hele tomater'], kcal: 32, protein: 1.3, g: null, pack: 400, role: 'normal' },
  { id: 'agurk', label: 'Agurk', syn: ['agurk', 'slangeagurk'], kcal: 15, protein: 0.7, g: 300, role: 'normal' },
  { id: 'salat', label: 'Salat', syn: ['salat', 'isbergsalat', 'isbergmix', 'ruccola', 'salatmix'], kcal: 15, protein: 1, g: 200, pack: 150, role: 'normal' },
  { id: 'brokkoli', label: 'Brokkoli', syn: ['brokkoli'], kcal: 34, protein: 2.8, g: 300, role: 'normal' },
  { id: 'blomkal', label: 'Blomkål', syn: ['blomkål'], kcal: 25, protein: 1.9, g: 600, role: 'normal' },
  { id: 'squash', label: 'Squash', syn: ['squash', 'zucchini'], kcal: 17, protein: 1.2, g: 250, role: 'normal' },
  { id: 'aubergine', label: 'Aubergine', syn: ['aubergine'], kcal: 25, protein: 1, g: 300, role: 'normal' },
  { id: 'sopp', label: 'Sopp', syn: ['sopp', 'champignon', 'aromasopp', 'sjampinjong', 'skogssopp'], kcal: 22, protein: 3.1, g: null, role: 'normal' },
  { id: 'mais', label: 'Mais', syn: ['mais', 'maiskorn'], kcal: 86, protein: 3.2, g: null, pack: 340, role: 'normal' },
  { id: 'erter', label: 'Erter', syn: ['erter', 'sukkererter'], kcal: 81, protein: 5.4, g: null, pack: 400, role: 'normal' },
  { id: 'spinat', label: 'Spinat', syn: ['spinat', 'babyspinat'], kcal: 23, protein: 2.9, g: null, pack: 130, role: 'normal' },
  { id: 'kal', label: 'Kål', syn: ['kål', 'hodekål', 'spisskål', 'rødkål'], kcal: 25, protein: 1.3, g: 900, role: 'normal' },
  { id: 'kalrot', label: 'Kålrot', syn: ['kålrot'], kcal: 37, protein: 1.1, g: 700, role: 'normal' },
  { id: 'wokgronnsaker', label: 'Wokgrønnsaker', syn: ['wokgrønnsaker', 'wokmix', 'grønnsaksblanding'], kcal: 35, protein: 2, g: null, role: 'normal' },
  { id: 'avokado', label: 'Avokado', syn: ['avokado'], kcal: 160, protein: 2, g: 200, role: 'normal' },

  // ── Frukt ──────────────────────────────────────────────────────────────
  { id: 'eple', label: 'Eple', syn: ['eple', 'epler'], kcal: 52, protein: 0.3, g: 180, role: 'normal' },
  { id: 'banan', label: 'Banan', syn: ['banan', 'bananer'], kcal: 89, protein: 1.1, g: 120, role: 'normal' },
  { id: 'sitron', label: 'Sitron', syn: ['sitron', 'lime'], kcal: 29, protein: 1.1, g: 100, role: 'background' },
  { id: 'appelsin', label: 'Appelsin', syn: ['appelsin', 'klementin'], kcal: 47, protein: 0.9, g: 150, role: 'normal' },

  // ── Smaksettere og bakgrunn ────────────────────────────────────────────
  { id: 'hvitlok', label: 'Hvitløk', syn: ['hvitløk'], kcal: 149, protein: 6, g: 5, role: 'background' },
  { id: 'ingefaer', label: 'Ingefær', syn: ['ingefær'], kcal: 80, protein: 1.8, g: null, role: 'background' },
  { id: 'soyasaus', label: 'Soyasaus', syn: ['soyasaus', 'soya'], kcal: 60, protein: 8, g: null, role: 'background' },
  { id: 'olje', label: 'Olje', syn: ['olje', 'olivenolje', 'rapsolje', 'solsikkeolje'], kcal: 884, protein: 0, g: null, role: 'background' },
  { id: 'tacokrydder', label: 'Tacokrydder', syn: ['tacokrydder', 'taco krydder', 'fajitakrydder'], kcal: 300, protein: 10, g: null, role: 'background' },
  { id: 'buljong', label: 'Buljong', syn: ['buljong', 'kraft', 'fond', 'kyllingbuljong', 'oksebuljong', 'grønnsaksbuljong', 'kalvefond', 'oksefond', 'kyllingfond'], kcal: 10, protein: 1, g: null, role: 'background' },
  { id: 'ketchup', label: 'Ketchup', syn: ['ketchup'], kcal: 100, protein: 1.2, g: null, role: 'background' },
  { id: 'majones', label: 'Majones', syn: ['majones', 'aioli'], kcal: 680, protein: 1, g: null, role: 'background' },
  { id: 'sennep', label: 'Sennep', syn: ['sennep'], kcal: 110, protein: 6, g: null, role: 'background' },
  { id: 'kokosmelk', label: 'Kokosmelk', syn: ['kokosmelk'], kcal: 180, protein: 2, g: null, pack: 400, role: 'normal' },
  { id: 'salsa', label: 'Salsa', syn: ['salsa', 'tacosaus'], kcal: 45, protein: 1.2, g: null, pack: 230, role: 'background' },
  { id: 'polsebrod', label: 'Pølsebrød', syn: ['pølsebrød'], kcal: 280, protein: 9, g: 50, role: 'normal' },
  { id: 'pommes', label: 'Pommes frites', syn: ['pommes frites', 'pommes', 'potetbåter', 'potetstaver'], kcal: 160, protein: 2.5, g: null, pack: 750, role: 'normal' },
  { id: 'tomatpure', label: 'Tomatpuré', syn: ['tomatpuré', 'tomatpure', 'tomatkonsentrat'], kcal: 82, protein: 4.3, g: null, pack: 140, role: 'background' },
  { id: 'sild', label: 'Sild', syn: ['sild', 'kryddersild'], kcal: 220, protein: 17, g: null, pack: 240, role: 'bearing' },
  { id: 'hvitfisk', label: 'Hvitfisk', syn: ['hyse', 'kveite', 'rødspette', 'steinbit'], kcal: 80, protein: 18, g: 150, role: 'bearing' },
  { id: 'sotpotet', label: 'Søtpotet', syn: ['søtpotet', 'søtpoteter'], kcal: 86, protein: 1.6, g: 200, role: 'normal' },
  { id: 'rosenkal', label: 'Rosenkål', syn: ['rosenkål'], kcal: 43, protein: 3.4, g: null, pack: 400, role: 'normal' },
  { id: 'selleri', label: 'Selleri', syn: ['selleri', 'sellerirot', 'stangselleri'], kcal: 35, protein: 1.2, g: 500, role: 'normal' },
  { id: 'varlok', label: 'Vårløk', syn: ['vårløk', 'salatløk'], kcal: 32, protein: 1.8, g: 15, role: 'background' },
  { id: 'chili', label: 'Chili', syn: ['chili', 'chilipepper', 'jalapeno'], kcal: 40, protein: 1.9, g: 15, role: 'background' },
  { id: 'urter', label: 'Friske urter', syn: ['basilikum', 'koriander', 'timian', 'rosmarin', 'dill'], kcal: 40, protein: 3, g: null, role: 'background' },
  { id: 'pesto', label: 'Pesto', syn: ['pesto'], kcal: 450, protein: 5, g: null, pack: 190, role: 'normal' },
  { id: 'baer', label: 'Bær', syn: ['jordbær', 'blåbær', 'bringebær', 'skogsbær'], kcal: 45, protein: 1, g: null, pack: 250, role: 'normal' },
  { id: 'brunsaus', label: 'Saus', syn: ['brun saus', 'sausemix', 'bearnaise', 'hvit saus', 'pepersaus'], kcal: 60, protein: 1, g: null, role: 'background' },
  { id: 'eddik', label: 'Eddik', syn: ['eddik', 'balsamico'], kcal: 20, protein: 0, g: null, role: 'background' },
  { id: 'honning', label: 'Honning', syn: ['honning'], kcal: 320, protein: 0.3, g: null, role: 'background' },
  { id: 'havregryn', label: 'Havregryn', syn: ['havregryn'], kcal: 370, protein: 13, g: null, pack: 1000, role: 'background' },
  { id: 'notter', label: 'Nøtter', syn: ['nøtter', 'mandler', 'valnøtter', 'cashewnøtter', 'peanøtter'], kcal: 600, protein: 20, g: null, pack: 200, role: 'background' },
  { id: 'mel', label: 'Mel', syn: ['mel', 'hvetemel', 'maizena'], kcal: 340, protein: 10, g: null, pack: 1000, role: 'background' },
  { id: 'sukker', label: 'Sukker', syn: ['sukker', 'brunt sukker'], kcal: 400, protein: 0, g: null, pack: 1000, role: 'background' },
];

/**
 * Etterledd som gjør et sammensatt ord til en HELT ANNEN vare.
 *
 * «laksefilet» er laks. «laksepostei» er ikke laks du kan steke — og et
 * tilbud på postei skal aldri få en laksemiddag til å se billig ut.
 * Prefiksregelen alene klarer ikke skillet, så disse listes eksplisitt.
 */
const DERIVED_SUFFIXES = [
  'postei', 'pålegg', 'palegg', 'pudding', 'kake', 'kaker', 'sjokolade',
  'saus', 'suppe', 'krydder', 'buljong', 'juice', 'sylte', 'salat',
  'pizza', 'pai', 'is', 'iskrem', 'yoghurt', 'snacks', 'chips', 'smak',
  'pop', 'godteri', 'drops', 'gele', 'lefse', 'ringer', 'stang', 'stenger',
  'pure', 'mos', 'most', 'stappe', 'gull', 'brød', 'brod', 'mousse',
  'grateng', 'gratine', 'drikk', 'drikke', 'wrap', 'rull', 'terte',
  'nugget', 'nuggets',
  // Bevisst UTELATT: «skrue/skruer» (knekker pastaskruer) og «boller»
  // (knekker kjøttboller).
];

/**
 * Varer som aldri er middag, uansett hvilket dyr som står på pakka.
 * «Pedigree Hundemat Storfe» ble ellers en bærende storfe-ingrediens.
 */
const NON_FOOD = /\b(hundemat|kattemat|hundefor|kattefor|dyrefor|tyggebein|sjampo|såpe|vaskemiddel|oppvask|tørkerull|toalettpapir|bleier|blomsterjord|kattesand)\b/;

/** Ord som ikke identifiserer noen vare — de skal aldri treffe et konsept. */
const STOPWORDS = new Set([
  'salt', 'pepper', 'vann', 'krydder', 'frisk', 'fersk', 'økologisk', 'stk',
  'pakke', 'gram', 'kilo', 'ferdig', 'hakket', 'revet', 'skivet', 'ca',
]);

const norm = (s) => String(s ?? '')
  .toLowerCase()
  // ô→o, é→e, î→i. Uten dette ble «entrecôte» til «entrec te» og traff
  // aldri sitt eget synonym. æ/ø/å berøres ikke av NFD-folding.
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zæøå\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// Oppslagstabell: synonym → konsept. Lengste synonym først, slik at
// «kyllingfilet» slår «kylling» og «hermetiske tomater» slår «tomat».
// Rollen først, så lengden. Uten dette vant et langt BAKGRUNNSORD over
// et kort bærende: «Lofoten Sild i Tomat» ble til tomat, ikke sild.
const RANK = { bearing: 0, normal: 1, background: 2 };
const INDEX = CONCEPTS
  .flatMap((c) => c.syn.map((s) => ({ syn: norm(s), c })))
  .sort((a, b) => RANK[a.c.role] - RANK[b.c.role] || b.syn.length - a.syn.length);

const BY_ID = new Map(CONCEPTS.map((c) => [c.id, c]));

/** Normalisert tekst — samme vask som oppslaget bruker. */
export const normalizeText = (t) => norm(t);

/** Konseptets synonymer, normalisert. */
export const synonymsOf = (c) => (c?.syn ?? []).map(norm);

/** Konseptet med gitt id, eller null. */
export const conceptById = (id) => BY_ID.get(id) ?? null;

/**
 * Hvilket konsept en fritekst beskriver — «Gilde kjøttdeig av storfe 400 g»
 * → kjøttdeig. Returnerer null når vi ikke er sikre; da faller kalleren
 * tilbake på den gamle ordstamme-matchingen, eller lar være.
 *
 * Flerordssynonymer treffer som delstreng; ettordssynonymer må stå som eget
 * ord eller som forstavelse i et sammensatt ord («laksefilet» → laks), men
 * aldri midt inni («melkesjokolade» blir ikke melk).
 */
export function conceptFor(text) {
  const t = norm(text);
  if (!t) return null;
  if (NON_FOOD.test(t)) return null;
  const tokens = t.split(' ').filter((w) => w && !STOPWORDS.has(w));
  if (!tokens.length) return null;

  for (const { syn, c } of INDEX) {
    if (syn.includes(' ')) {
      if (t.includes(syn)) return c;
      continue;
    }
    for (const w of tokens) {
      // Eksakt ord, eller sammensetning som BEGYNNER med synonymet.
      if (w === syn) return c;
      // Sammensetninger er bare trygge når forleddet er langt nok til å
      // være entydig. «laks» + «filet» er laks; «sei» + «gmenn» er godteri,
      // og «ost» + «epop» er snacks. Korte synonymer må stå som eget ord.
      if (syn.length >= 4 && w.startsWith(syn) && w.length - syn.length <= 7) {
        const raw = w.slice(syn.length);
        // Fuge-e/-s i norske sammensetninger: «laks·e·postei», «kjøtt·s·kake».
        // Begge former prøves — uten dette spiste strippingen første bokstav
        // i etterleddet, så «kjøttdeigsaus» ble til «aus» og slapp gjennom.
        const tails = [raw, raw.replace(/^[es]/, '')];
        if (tails.some((t) => DERIVED_SUFFIXES.some((d) => t === d || t.startsWith(d)))) break;
        return c;
      }
    }
  }
  return null;
}

/**
 * Er dette et AVLEDET produkt av en vare vi kjenner? «Kjøttdeigsaus»,
 * «potetsalat», «laksepostei» — navnet inneholder en vare vi har i
 * registeret, men produktet er noe annet.
 *
 * Skillet betyr noe: et navn vi rett og slett ikke kjenner («Salma») kan
 * fortsatt være laks, og der er det riktig å falle tilbake på ordstammer.
 * Et navn vi kjenner som noe ANNET skal aldri gjennom den bakveien.
 */
export function isDerivedProduct(text) {
  const t = norm(text);
  if (!t) return false;
  if (conceptFor(t)) return false;
  const tokens = t.split(' ').filter((w) => w && !STOPWORDS.has(w));
  for (const { syn } of INDEX) {
    if (syn.includes(' ') || syn.length < 4) continue;
    for (const w of tokens) {
      if (!w.startsWith(syn) || w.length - syn.length > 7) continue;
      const raw = w.slice(syn.length);
      const tails = [raw, raw.replace(/^[es]/, '')];
      if (tails.some((x) => DERIVED_SUFFIXES.some((d) => x === d || x.startsWith(d)))) return true;
    }
  }
  return false;
}

/**
 * Treffer en oppskriftsingrediens og et tilbud samme vare?
 * 'sikker' når begge løses til samme konsept, 'usikker' når bare
 * ordstammene ligner, null når de ikke treffer i det hele tatt.
 */
export function conceptMatch(ingredientName, offerName) {
  const a = conceptFor(ingredientName);
  if (!a) return null;
  const b = conceptFor(offerName);
  if (!b) return null;
  return a.id === b.id ? a : null;
}

// ── Rettkonsepter ────────────────────────────────────────────────────────
// «Finn meg den billigste burgeren» krever at appen vet at burger er en
// FAMILIE av retter, ikke ett navn. Gjenkjennes på rettens navn først, og
// på en signaturingrediens når navnet ikke røper noe («Fredagsgryte» med
// tortillalefser og tacokrydder er taco).

export const DISH_CONCEPTS = [
  { id: 'taco', label: 'Taco', name: ['taco', 'tortilla', 'burrito', 'fajita', 'enchilada'], signature: ['tortilla', 'tacokrydder'], sigNeeded: 2 },
  { id: 'burger', label: 'Burger', name: ['burger', 'hamburger', 'cheeseburger'], signature: ['burgerbrod'], sigNeeded: 1 },
  { id: 'wok', label: 'Wok', name: ['wok', 'stekt ris', 'nudler'], signature: ['nudler', 'soyasaus'], sigNeeded: 2 },
  { id: 'pasta', label: 'Pasta', name: ['pasta', 'spaghetti', 'lasagne', 'carbonara', 'bolognese', 'penne'], signature: ['pasta', 'lasagneplater'], sigNeeded: 1 },
  { id: 'pizza', label: 'Pizza', name: ['pizza', 'focaccia', 'grandiosa', 'ristorante'], signature: ['frossenpizza'], sigNeeded: 1 },
  { id: 'suppe', label: 'Suppe', name: ['suppe', 'buljong'], signature: [] },
  { id: 'gryte', label: 'Gryte', name: ['gryte', 'stuing', 'lapskaus', 'chili con carne', 'curry'], signature: [] },
  { id: 'fisk', label: 'Fiskemiddag', name: ['fisk', 'laks', 'torsk', 'sei', 'ørret', 'skrei'], signature: ['laks', 'torsk', 'sei', 'orret', 'hvitfisk'], sigNeeded: 1 },
  { id: 'salat', label: 'Salat', name: ['salat', 'bowl'], signature: [] },
  { id: 'grill', label: 'Grillmat', name: ['grill', 'spyd', 'kebab'], signature: [] },
  { id: 'panne', label: 'Pannekaker og lapper', name: ['pannekake', 'lapper', 'vafler', 'omelett'], signature: [] },
];

const DISH_BY_ID = new Map(DISH_CONCEPTS.map((d) => [d.id, d]));
export const dishById = (id) => DISH_BY_ID.get(id) ?? null;

/**
 * Hvilken type rett dette er — «Kyllingburger med bacon» → burger.
 * Navnet veier tyngst; signaturingrediensene fanger de retter som heter
 * noe helt annet enn de er.
 */
/**
 * Korte rettnavn må stå på ordgrense. «laksewok» er wok, men «seigmenn»
 * er ikke sei — og uten dette ble godteri til en fiskemiddag.
 */
function dishNameHit(name, w) {
  if (w.length > 3) return name.includes(w);
  let i = name.indexOf(w);
  while (i !== -1) {
    const after = name[i + w.length];
    if (after === undefined || !/[a-zæøåé]/.test(after)) return true;
    i = name.indexOf(w, i + 1);
  }
  return false;
}

export function dishConceptFor(meal) {
  const name = String(meal?.name ?? meal ?? '').toLowerCase();

  // «Laksepostei» og «potetsalat» er avledede produkter, ikke retter.
  if (!isDerivedProduct(name)) {
    for (const d of DISH_CONCEPTS) {
      if (d.name.some((w) => dishNameHit(name, w))) return d;
    }
  }

  const raw = Array.isArray(meal?.ingredients) ? meal.ingredients
    : Array.isArray(meal?.raw_ingredients) ? meal.raw_ingredients : [];
  const ids = new Set();
  for (const ing of raw) {
    const c = conceptFor(typeof ing === 'string' ? ing : (ing?.n ?? ing?.name));
    if (c) ids.add(c.id);
  }
  // Hver familie sier selv hvor mange signaturtreff som skal til. Taco
  // krever både lefse og krydder; burgerbrød i en ingrediensliste er
  // derimot bevis nok i seg selv.
  for (const d of DISH_CONCEPTS) {
    if (!d.sigNeeded) continue;
    const hits = d.signature.filter((sig) => ids.has(sig)).length;
    if (hits >= d.sigNeeded) return d;
  }
  return null;
}
