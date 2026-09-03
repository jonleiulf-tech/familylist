// Ulike brukere, ulike varer, ulike handlemønstre.
//
// Bakgrunnen: apekatt-testen kjørte 130 runder mot ÉN tilstand —
// «Testfamilien», to voksne og to barn, åtte varer i lista, tre middager
// og fire tilbud. En pen familie. Alt gikk bra, og det sa mindre enn det
// så ut som: appen ble aldri spurt om hva den gjør når lista er tom,
// når den har 240 varer, når abonnementet er utløpt, når nettet svarer
// 500, eller når noen heter «Kjøttdeig 14 % — Gilde, Norge 🇳🇴».
//
// Her defineres tilstandene i stedet for å antas. Hver runde trekker en
// profil, en skjermstørrelse og et handlemønster, og bygger en hel base
// ut fra det. Trekningen er DETERMINISTISK ut fra rundenummeret, så
// «runde 417 krasjet» kan kjøres om igjen med nøyaktig samme data.

const HOUSEHOLD = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';

/** Liten, rask, deterministisk tilfeldighetsgenerator. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const nowIso = () => new Date().toISOString();
const dag = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

/** uuid som er deterministisk gitt rng — ellers kan ikke en runde gjentas. */
function uuidFrom(rng) {
  const hex = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 32; i += 1) s += hex[Math.floor(rng() * 16)];
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-8${s.slice(17, 20)}-${s.slice(20, 32)}`;
}

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const mellom = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));

// ---------------------------------------------------------------------
// Varer: et større utvalg enn de 20 i grunnoppsettet, med ekte norske
// navn, enheter og prisleier. Dette er det appen faktisk regner på.
// ---------------------------------------------------------------------

/** [navn, hovedkategori, snittpris, enhet, pakningsstørrelse] */
export const VARER = [
  ['Brød/bakervarer', 'Brød og korn', 24, 'stk', null],
  ['Rundstykker', 'Brød og korn', 32, 'stk', 6],
  ['Knekkebrød', 'Brød og korn', 29, 'pakke', null],
  ['Havregryn', 'Brød og korn', 27, 'g', 1000],
  ['Melk', 'Meieri', 22, 'liter', 1],
  ['Havredrikk', 'Meieri', 22.33, 'liter', 1],
  ['Egg', 'Meieri', 43, 'stk', 12],
  ['Smør', 'Meieri', 48, 'pakke', null],
  ['Gulost/Norvegia', 'Meieri', 113, 'kg', 500],
  ['Brunost', 'Meieri', 62, 'stk', null],
  ['Yoghurt', 'Meieri', 15, 'stk', null],
  ['Rømme', 'Meieri', 27, 'stk', null],
  ['Kesam', 'Meieri', 34, 'stk', null],
  ['Kjøttdeig/karbonadedeig', 'Kjøtt', 66, 'g', 400],
  ['Kyllingfilet', 'Kjøtt', 120, 'g', 600],
  ['Pølser', 'Kjøtt', 45, 'stk', 8],
  ['Bacon', 'Kjøtt', 39, 'pakke', null],
  ['Kjøttkaker', 'Kjøtt', 72, 'boks', null],
  ['Laksefilet', 'Fisk', 89, 'g', 400],
  ['Torskefilet', 'Fisk', 79, 'g', 400],
  ['Makrell i tomat', 'Ost og pålegg', 18.33, 'stk', null],
  ['Kaviar', 'Ost og pålegg', 41, 'stk', null],
  ['Leverpostei', 'Ost og pålegg', 24, 'stk', null],
  ['Skinke', 'Ost og pålegg', 32, 'pakke', null],
  ['Agurk', 'Frukt og grønt', 19, 'stk', null],
  ['Tomater/passata/tomatboks', 'Frukt og grønt', 12.33, 'boks', null],
  ['Poteter', 'Frukt og grønt', 48, 'kg', 2000],
  ['Gulrot', 'Frukt og grønt', 22, 'pose', null],
  ['Løk', 'Frukt og grønt', 25, 'pose', null],
  ['Paprika', 'Frukt og grønt', 30, 'stk', 3],
  ['Bananer', 'Frukt og grønt', 25, 'kg', 1000],
  ['Epler', 'Frukt og grønt', 34, 'kg', 1000],
  ['Salat', 'Frukt og grønt', 26, 'stk', null],
  ['Brokkoli', 'Frukt og grønt', 28, 'stk', null],
  ['Spagetti', 'Tørrvarer', 18, 'g', 500],
  ['Makaroni', 'Tørrvarer', 22, 'g', 500],
  ['Ris', 'Tørrvarer', 32, 'g', 1000],
  ['Tacolefser/tortilla/lomper', 'Tørrvarer', 27, 'stk', 8],
  ['Taco krydder', 'Tørrvarer', 16, 'pose', null],
  ['Mel', 'Tørrvarer', 24, 'g', 2000],
  ['Sukker', 'Tørrvarer', 26, 'g', 1000],
  ['Kaffe', 'Drikke', 79, 'g', 500],
  ['Te', 'Drikke', 45, 'pakke', null],
  ['Appelsinjuice', 'Drikke', 29, 'liter', 1],
  ['Brus', 'Drikke', 25, 'flaske', null],
  ['Sjokolade', 'Snacks', 32, 'stk', null],
  ['Potetgull', 'Snacks', 39, 'pose', null],
  ['Oppvasksåpe', 'Husholdning', 32, 'flaske', null],
  ['Toalettpapir', 'Husholdning', 69, 'pakke', 12],
  ['Tørkerull', 'Husholdning', 45, 'pakke', 4],
  ['Bleier', 'Husholdning', 189, 'pakke', 40],
  ['Kattemat', 'Dyr', 42, 'pose', null],
];

const BUTIKKER = [
  { code: 'COOP_EXTRA', name: 'Coop Extra', is_default: true, sort_order: 1 },
  { code: 'MENY_NO', name: 'Meny', is_default: false, sort_order: 2 },
  { code: 'REMA_1000', name: 'Rema 1000', is_default: false, sort_order: 3 },
  { code: 'KIWI', name: 'KIWI', is_default: false, sort_order: 4 },
  { code: 'BUNNPRIS', name: 'Bunnpris', is_default: false, sort_order: 5 },
];

const MIDDAGER = [
  ['Taco', 'Tex-Mex', ['Kjøttdeig/karbonadedeig', 'Tacolefser/tortilla/lomper', 'Paprika', 'Agurk', 'Rømme']],
  ['Spagetti bolognese', 'Pasta', ['Spagetti', 'Kjøttdeig/karbonadedeig', 'Tomater/passata/tomatboks', 'Løk']],
  ['Pølser med lompe', 'Enkelt', ['Pølser', 'Tacolefser/tortilla/lomper']],
  ['Makrell i tomat på brød', 'Enkelt', ['Makrell i tomat', 'Brød/bakervarer', 'Egg', 'Agurk']],
  ['Laks med poteter', 'Fisk', ['Laksefilet', 'Poteter', 'Smør', 'Brokkoli']],
  ['Kylling og ris', 'Kylling', ['Kyllingfilet', 'Ris', 'Paprika', 'Løk']],
  ['Fiskegrateng', 'Fisk', ['Torskefilet', 'Makaroni', 'Melk', 'Gulost/Norvegia']],
  ['Kjøttkaker med kålstuing', 'Tradisjon', ['Kjøttkaker', 'Poteter', 'Gulrot']],
  ['Pannekaker', 'Enkelt', ['Mel', 'Egg', 'Melk', 'Smør']],
  ['Ovnsbakt torsk', 'Fisk', ['Torskefilet', 'Poteter', 'Gulrot', 'Smør']],
  ['Kyllingwok', 'Kylling', ['Kyllingfilet', 'Ris', 'Brokkoli', 'Paprika', 'Løk']],
  ['Grøt', 'Enkelt', ['Havregryn', 'Melk', 'Smør', 'Sukker']],
];

/** Navn som har knekt ting før, eller som ser ut som de kunne. */
const STYGGE_NAVN = [
  'Kjøttdeig 14 % — Gilde, Norge 🇳🇴',
  'Ekstra lang varebetegnelse som butikken har skrevet uten å tenke på at den skal vises på en telefon i en app med begrenset bredde',
  '   ',
  'ÆØÅ æøå',
  '<script>alert(1)</script>',
  'Melk & "brød" \'osv\'',
  'Kjøtt\ndeig',
  'Ost/ost\\ost',
  '100%',
  'Vare med    mange     mellomrom',
  '日本語のテスト',
  'a',
];

// ---------------------------------------------------------------------
// Grunntilstand
// ---------------------------------------------------------------------

function katalog(rng, antall = VARER.length) {
  const valgt = VARER.slice(0, Math.min(antall, VARER.length));
  return valgt.map(([name, major, pris, enhet], i) => ({
    id: i + 1,
    name,
    category: major,
    major_category: major,
    avg_price: pris,
    avg_price_unit: enhet === 'kg' || enhet === 'liter' ? enhet : null,
    price_low: Math.round(pris * 0.6),
    price_high: Math.round(pris * 1.8),
    frequency_sig: i < 8 ? 'Svært ofte' : i < 20 ? 'Ofte' : null,
    primary_store: pick(rng, BUTIKKER).name,
    score: Math.max(1, 100 - i * 2),
    brand: null,
    line_count: mellom(rng, 0, 30),
    receipt_count: mellom(rng, 0, 20),
    active: true,
  }));
}

function middagsbibliotek() {
  return MIDDAGER.map(([name, category, ing]) => ({
    name,
    category,
    ingredients: ing.map((n) => {
      const v = VARER.find((x) => x[0] === n);
      return { n, qty: v && v[3] === 'g' ? 400 : 1, unit: v ? v[3] : 'stk' };
    }),
  }));
}

function vare(rng, i, butikker, overstyr = {}) {
  const [name, category, pris, enhet, pack] = pick(rng, VARER);
  return {
    id: `item-${i}`,
    household_id: HOUSEHOLD,
    name,
    qty: pick(rng, [1, 1, 1, 2, 2, 3, 4, 6, 400, 500]),
    unit: enhet,
    category,
    store: pick(rng, butikker).name,
    price: pris,
    pack_size: pack,
    price_source: pick(rng, ['receipt', 'catalog', null]),
    checked: rng() < 0.25,
    checked_at: null,
    checked_by: null,
    created_by: USER,
    created_at: nowIso(),
    is_offer: rng() < 0.1,
    variant: null,
    kassal_product_id: null,
    ean: null,
    brand: null,
    kassal_name: null,
    ...overstyr,
  };
}

function tilbud(rng, antall, butikker) {
  const ut = [];
  for (let i = 0; i < antall; i += 1) {
    const [name, category, pris] = pick(rng, VARER);
    const b = pick(rng, butikker);
    const ned = 0.3 + rng() * 0.5;
    const harFørpris = rng() < 0.7;
    ut.push({
      id: `offer-${i}`,
      store_code: b.code,
      store_name: b.name,
      product_name: `${name} ${mellom(rng, 100, 900)}g`,
      match_name: name,
      price: Math.round(pris * ned * 10) / 10,
      original_price: harFørpris ? pris : null,
      unit: 'stk',
      unit_price: Math.round(pris * ned * 10) / 10,
      valid_from: dag(-mellom(rng, 0, 3)),
      valid_to: dag(mellom(rng, 1, 7)),
      source: pick(rng, ['Kundeavis', 'Butikkens nettside – Meny', 'Kassalapp – under deres snittpris']),
      source_type: pick(rng, ['customer_flyer', 'web_page', 'api']),
      household_id: null,
      category,
    });
  }
  return ut;
}

/** Grunnbasen alle profiler bygger videre på. */
export function grunnBase(rng) {
  const butikker = BUTIKKER.slice(0, 3);
  const lib = middagsbibliotek();
  const plan = [];
  for (let i = 0; i < 7; i += 1) {
    plan.push({
      household_id: HOUSEHOLD,
      plan_date: dag(i),
      meal_id: i < 3 ? `meal-${i}` : null,
      meal_name: i < 3 ? lib[i].name : null,
      guest_portions: 0,
      sent_to_list_at: i === 0 ? nowIso() : null,
      skipped: false,
      reason: i === 0 ? 'Regel: Taco på denne ukedagen' : null,
      locked: false,
    });
  }

  return {
    households: [{
      id: HOUSEHOLD, name: 'Testfamilien', kind: 'familie',
      default_store: 'Coop Extra', adults: 2, children: 2, portions_set: true,
      hidden_meals: [], calendar_token: uuidFrom(rng), created_at: nowIso(),
    }],
    members: [{
      household_id: HOUSEHOLD, user_id: USER, display_name: 'Test',
      initials: 'TE', role: 'owner', avatar: null, created_at: nowIso(), households: null,
    }],
    profiles: [{ user_id: USER, display_name: 'Test', avatar: null }],
    item_catalog: katalog(rng),
    norm_rules: [
      { from_text: 'NORWEGIA', to_text: 'Gulost/Norvegia' },
      { from_text: 'ADVOKADO', to_text: 'Avokado' },
    ],
    stores: butikker,
    meal_library: lib,
    meal_patterns: [],
    meals: lib.slice(0, 3).map((m, i) => ({
      id: `meal-${i}`, household_id: HOUSEHOLD, name: m.name, category: m.category,
      ingredients: m.ingredients, base_servings: 4, instructions_url: null,
      source_label: null, source_instructions: null, instructions: null, created_at: nowIso(),
    })),
    meal_plan: plan,
    meal_week_templates: [{
      id: uuidFrom(rng), household_id: HOUSEHOLD, name: 'Hverdagsuka',
      days: [{ weekday: 1, meal_name: 'Taco' }, { weekday: 3, meal_name: 'Spagetti bolognese' }],
    }],
    shopping_items: Array.from({ length: 10 }, (_, i) => vare(rng, i, butikker)),
    custom_lists: [{
      id: uuidFrom(rng), household_id: HOUSEHOLD, name: 'Hytta', kind: 'annet',
      items: [{ n: 'Ved', chk: false, qty: 1 }, { n: 'Fyrstikker', chk: true, qty: 2 }],
      shared: true, created_by: USER, updated_by: USER, created_at: nowIso(),
    }],
    saved_trips: [{
      id: uuidFrom(rng), household_id: HOUSEHOLD, name: 'Handleliste forrige uke',
      items: [{ name: 'Melk', qty: 2, unit: 'liter', price: 22, pack_size: 1 }],
      created_by: USER, created_at: new Date(Date.now() - 6 * 864e5).toISOString(),
    }],
    rules: [{
      id: uuidFrom(rng), household_id: HOUSEHOLD, scope: 'Fisk',
      rule_type: 'min', amount: 2, weekdays: [], enabled: true, created_at: nowIso(),
    }],
    import_queue: [],
    offers: tilbud(rng, 6, butikker),
    item_tags: [{ item_name: 'Melk', tag: 'fast' }],
    item_habits: [
      { household_id: HOUSEHOLD, item_name: 'Agurk', usual_qty: 2.1, unit: 'stk', times_bought: 4, last_bought_at: nowIso() },
    ],
    point_events: [{ id: uuidFrom(rng), user_id: USER, kind: 'kvittering', points: 20, ref: uuidFrom(rng), note: 'Kvittering', created_at: nowIso() }],
    subscriptions: [{
      household_id: HOUSEHOLD, status: 'prøve', paid_until: dag(20),
      stripe_customer_id: null, stripe_subscription_id: null, updated_at: nowIso(),
    }],
    picked_order: [],
    kassal_matches: [],
    item_reports: [],
    catalog_suggestions: [],
    app_feedback: [],
    receipt_uploads: [],
    price_observations: [],
    recipe_sources: [],
    external_recipe_candidates: [],
    count_lists: [],
    offer_fetch_status: [],
  };
}

// ---------------------------------------------------------------------
// Profilene
// ---------------------------------------------------------------------

export const PROFILER = [
  {
    id: 'ny',
    navn: 'Helt ny bruker — ingenting i basen',
    vekt: 3,
    // Alt det tomme på én gang: ingen varer, ingen middager, ingen plan,
    // ingen tilbud, ingen poeng. Det er her «tom tilstand»-tekstene og
    // «kom i gang»-løypa faktisk blir tegnet.
    bygg(s) {
      s.shopping_items = [];
      s.meals = [];
      s.meal_plan = [];
      s.meal_week_templates = [];
      s.custom_lists = [];
      s.saved_trips = [];
      s.rules = [];
      s.offers = [];
      s.item_habits = [];
      s.item_tags = [];
      s.point_events = [];
      s.households[0].portions_set = false;
      s.households[0].adults = 0;
      s.households[0].children = 0;
      s.households[0].default_store = null;
    },
  },
  {
    id: 'liten',
    navn: 'Én person, få varer',
    vekt: 2,
    bygg(s, rng) {
      s.households[0].adults = 1;
      s.households[0].children = 0;
      s.households[0].kind = 'annet';
      s.households[0].name = 'Meg';
      s.shopping_items = Array.from({ length: 3 }, (_, i) => vare(rng, i, s.stores));
      s.meals = s.meals.slice(0, 1);
      s.offers = tilbud(rng, 2, s.stores);
    },
  },
  {
    id: 'stor',
    navn: 'Storfamilie — 240 varer, 40 middager, 60 tilbud',
    vekt: 2,
    // Ytelse og opptegning. En liste på 240 rader med gruppering per
    // butikk er noe helt annet enn ti rader, og det er her en useMemo
    // som kjører per rad blir synlig.
    bygg(s, rng) {
      s.households[0].adults = 4;
      s.households[0].children = 6;
      s.shopping_items = Array.from({ length: 240 }, (_, i) => vare(rng, i, s.stores));
      s.stores = BUTIKKER;
      s.meals = Array.from({ length: 40 }, (_, i) => {
        const m = MIDDAGER[i % MIDDAGER.length];
        return {
          id: `meal-${i}`, household_id: HOUSEHOLD, name: `${m[0]} ${i + 1}`,
          category: m[1], base_servings: mellom(rng, 1, 12),
          ingredients: m[2].map((n) => ({ n, qty: mellom(rng, 1, 800), unit: pick(rng, ['stk', 'g', 'kg', 'liter', 'pakke']) })),
          instructions_url: null, source_label: null, source_instructions: null,
          instructions: null, created_at: nowIso(),
        };
      });
      s.offers = tilbud(rng, 60, BUTIKKER);
      s.custom_lists = Array.from({ length: 15 }, (_, i) => ({
        id: `list-${i}`, household_id: HOUSEHOLD, name: `Liste ${i + 1}`,
        kind: pick(rng, ['annet', 'hytte', 'ferie', 'jobb']),
        items: Array.from({ length: mellom(rng, 0, 30) }, (_, j) => ({ id: `li-${i}-${j}`, n: pick(rng, VARER)[0], chk: rng() < 0.4, qty: mellom(rng, 0, 9) })),
        shared: rng() < 0.5, created_by: USER, updated_by: USER, created_at: nowIso(),
      }));
      s.item_habits = VARER.slice(0, 30).map(([n, , , u]) => ({
        household_id: HOUSEHOLD, item_name: n, usual_qty: Math.round(rng() * 500) / 10,
        unit: u, times_bought: mellom(rng, 1, 40), last_bought_at: nowIso(),
      }));
    },
  },
  {
    id: 'rotete',
    navn: 'Rotete data — rare navn, manglende felt, ekstreme tall',
    vekt: 3,
    // Den viktigste profilen. Alle tre hvite skjermene kom av felt som
    // manglet der koden regnet med tekst. Databasen krever `name not
    // null`, men enhet, kategori, butikk, pris og pakningsstørrelse er
    // alle valgfrie — og appen tegner optimistisk før serveren har svart.
    bygg(s, rng) {
      s.shopping_items = Array.from({ length: 30 }, (_, i) => {
        const v = vare(rng, i, s.stores);
        const r = rng();
        if (r < 0.2) v.name = pick(rng, STYGGE_NAVN);
        if (rng() < 0.3) v.unit = pick(rng, [null, '', 'ukjent', 'STK', 'Stk.']);
        if (rng() < 0.3) v.category = pick(rng, [null, '', 'Ukjent kategori']);
        if (rng() < 0.3) v.store = pick(rng, [null, '', 'Butikk som ikke finnes']);
        if (rng() < 0.3) v.price = pick(rng, [null, 0, -5, 0.001, 99999, 1e9]);
        if (rng() < 0.3) v.qty = pick(rng, [null, 0, -1, 0.5, 9999, 1e6]);
        if (rng() < 0.2) v.pack_size = pick(rng, [null, 0, -1, 1e7]);
        return v;
      });
      s.meals = s.meals.map((m) => ({
        ...m,
        name: rng() < 0.3 ? pick(rng, STYGGE_NAVN) : m.name,
        base_servings: pick(rng, [null, 0, 1, 4, 100]),
        ingredients: m.ingredients.map((g) => ({
          ...g,
          // En ingrediens UTEN navn er den siste hvite skjermen som ble
          // funnet — den kom fra en ekstern oppskrift.
          n: rng() < 0.15 ? pick(rng, [null, '', undefined]) : g.n,
          qty: pick(rng, [null, 0, 1, 400, -2]),
          unit: pick(rng, [null, '', 'stk', 'g']),
        })),
      }));
      s.offers = tilbud(rng, 8, s.stores).map((o) => ({
        ...o,
        product_name: rng() < 0.3 ? pick(rng, STYGGE_NAVN) : o.product_name,
        match_name: rng() < 0.2 ? null : o.match_name,
        price: pick(rng, [o.price, 0, null, -1, 1e6]),
        original_price: pick(rng, [o.original_price, null, 0, o.price - 1]),
        valid_to: pick(rng, [o.valid_to, dag(-3), null]),
        store_name: pick(rng, [o.store_name, null, '']),
      }));
      // Elementene i egne lister ligger i en jsonb-kolonne databasen
      // ikke validerer. Det er nettopp ett element uten `n` som tok ned
      // hele Lister-fanen i den første stresstesten.
      s.custom_lists = s.custom_lists.map((l) => ({
        ...l,
        name: pick(rng, [l.name, ...STYGGE_NAVN]),
        items: [
          { chk: false, qty: 1 },                      // uten `n` i det hele tatt
          { n: null, chk: false, qty: 1 },
          { n: '', chk: true, qty: 0 },
          { n: 'Ting', chk: false },                   // uten `qty`
          { n: 'x'.repeat(300), chk: false, qty: -3 },
          ...l.items,
        ],
      }));
      s.item_habits = [
        { household_id: HOUSEHOLD, item_name: null, usual_qty: 2, unit: 'stk', times_bought: 3, last_bought_at: nowIso() },
        { household_id: HOUSEHOLD, item_name: 'Agurk', usual_qty: null, unit: null, times_bought: null, last_bought_at: null },
      ];
      s.item_tags = [{ item_name: null, tag: 'fast' }, { item_name: 'Melk', tag: null }];
      s.rules = [
        { id: 'rule-1', household_id: HOUSEHOLD, scope: 'Fisk', rule_type: 'min', amount: 2, weekdays: [], enabled: true, created_at: nowIso() },
        { id: 'rule-2', household_id: HOUSEHOLD, scope: 'Kjøtt', rule_type: 'max', amount: 0, weekdays: [], enabled: false, created_at: nowIso() },
      ];
      s.meal_plan = s.meal_plan.map((p) => ({
        ...p,
        meal_name: rng() < 0.25 ? null : p.meal_name,
        plan_date: rng() < 0.1 ? 'ikke-en-dato' : p.plan_date,
        guest_portions: pick(rng, [0, null, -2, 50]),
      }));
    },
  },
  {
    id: 'tomtilbud',
    navn: 'Ingen tilbud i basen',
    vekt: 1,
    // Nøyaktig det Jon fant: Tilbud-fanen var blank.
    bygg(s) {
      s.offers = [];
      s.offer_fetch_status = [{ store_code: 'COOP_EXTRA', last_ok: null, last_error: 'Ingen henting kjørt' }];
    },
  },
  {
    id: 'utlopt',
    navn: 'Abonnementet er utløpt',
    vekt: 1,
    bygg(s) {
      s.subscriptions = [{
        household_id: HOUSEHOLD, status: 'utløpt', paid_until: dag(-9),
        stripe_customer_id: 'cus_test', stripe_subscription_id: 'sub_test', updated_at: nowIso(),
      }];
    },
  },
  {
    id: 'forfalt',
    navn: 'Kortet feilet — nådedager',
    vekt: 1,
    bygg(s) {
      s.subscriptions = [{
        household_id: HOUSEHOLD, status: 'forfalt', paid_until: dag(-2),
        stripe_customer_id: 'cus_test', stripe_subscription_id: 'sub_test', updated_at: nowIso(),
      }];
    },
  },
  {
    id: 'medlem',
    navn: 'Medlem, ikke eier',
    vekt: 1,
    bygg(s, rng) {
      s.members[0].role = 'member';
      s.members.push({
        household_id: HOUSEHOLD, user_id: uuidFrom(rng), display_name: 'Kari',
        initials: 'KA', role: 'owner', avatar: null, created_at: nowIso(), households: null,
      });
    },
  },
  {
    id: 'mangelister',
    navn: 'Seks delte lister å bytte mellom',
    vekt: 2,
    bygg(s, rng) {
      for (let i = 1; i <= 5; i += 1) {
        const id = `hh-${i}`;
        s.households.push({
          id, name: pick(rng, ['Hytta', 'Jobb', 'Ferie 2026', 'Mamma og pappa', 'Dugnad', 'Bursdag']) + ` ${i}`,
          kind: pick(rng, ['familie', 'annet', 'hytte']), default_store: pick(rng, BUTIKKER).name,
          adults: mellom(rng, 0, 4), children: mellom(rng, 0, 5),
          portions_set: rng() < 0.5, hidden_meals: [], calendar_token: uuidFrom(rng), created_at: nowIso(),
        });
        s.members.push({
          household_id: id, user_id: USER, display_name: 'Test', initials: 'TE',
          role: i % 2 ? 'owner' : 'member', avatar: null, created_at: nowIso(), households: null,
        });
        for (let j = 0; j < mellom(rng, 0, 12); j += 1) {
          s.shopping_items.push({ ...vare(rng, `${i}-${j}`, s.stores), id: `item-${i}-${j}`, household_id: id });
        }
      }
    },
  },
  {
    id: 'ustabilt',
    navn: 'Ustabilt nett — hver åttende forespørsel svarer 500',
    vekt: 2,
    feilrate: 0.12,
    bygg() { /* data som normalt; det er nettet som svikter */ },
  },
  {
    id: 'treg',
    navn: 'Tregt nett — 350 ms på hver forespørsel',
    vekt: 1,
    forsinkelse: 350,
    bygg() {},
  },
  {
    id: 'offline',
    navn: 'Uten nett etter at appen er lastet',
    vekt: 1,
    // Appen rekker å hente alt, og så dør nettet. Da skal øyeblikksbildet
    // i localStorage overta og appen si «Uten nett — viser sist kjente
    // liste», ikke bli tom.
    offlineEtterMs: 9000,
    bygg() {},
  },
  {
    id: 'nettdør',
    navn: 'Nettet dør MENS appen laster',
    vekt: 1,
    // Den farligste varianten, og den som fant feilen: dør nettet før
    // husholdningen er hentet, vet appen ikke om brukeren mangler en
    // liste eller om svaret bare aldri kom. Den skal si «Fikk ikke
    // kontakt» — ikke «Velkommen, hva skal du bruke Plukkelisten til?»
    offlineEtterMs: 2500,
    bygg() {},
  },
];

/** Skjermstørrelser. Den smale nav-raden og den brede er ulik kode. */
export const SKJERMER = [
  { navn: 'iPhone SE', width: 375, height: 667 },
  { navn: 'iPhone 14', width: 390, height: 844 },
  { navn: 'iPhone Pro Max', width: 430, height: 932 },
  { navn: 'liten Android', width: 360, height: 640 },
  { navn: 'iPad stående', width: 768, height: 1024 },
  { navn: 'iPad liggende', width: 1024, height: 768 },
  { navn: 'laptop', width: 1280, height: 800 },
  { navn: 'stor skjerm', width: 1680, height: 1050 },
];

/**
 * Handlemønstre. En apekatt som bare trykker tilfeldig treffer sjelden en
 * hel flyt. Disse styrer HVOR den trykker mest, slik at ekte sekvenser —
 * krysse av hele lista, planlegge uka, jakte tilbud — faktisk blir kjørt.
 */
export const MØNSTRE = [
  { id: 'alt', navn: 'Innom alt', faner: ['hjem', 'handel', 'forslag', 'middag', 'tilbud', 'lister'], trykk: 6 },
  { id: 'handletur', navn: 'Handletur — krysser av', faner: ['handel', 'handel', 'hjem', 'handel'], trykk: 10, kryssAv: true },
  { id: 'planlegger', navn: 'Planlegger uka', faner: ['middag', 'forslag', 'middag', 'handel'], trykk: 9 },
  { id: 'tilbudsjeger', navn: 'Jakter tilbud', faner: ['tilbud', 'tilbud', 'handel', 'hjem'], trykk: 9 },
  { id: 'oppretter', navn: 'Lager lister og middager', faner: ['lister', 'middag', 'lister'], trykk: 10, skriv: true },
  { id: 'kikker', navn: 'Kikker innom raskt', faner: ['hjem', 'handel'], trykk: 3 },
  { id: 'rastløs', navn: 'Rastløs — bytter fane hele tiden', faner: ['hjem', 'tilbud', 'middag', 'handel', 'lister', 'forslag', 'hjem', 'handel'], trykk: 2 },
];

/** Vektet trekning blant profilene. */
function trekkProfil(rng) {
  const sum = PROFILER.reduce((a, p) => a + p.vekt, 0);
  let t = rng() * sum;
  for (const p of PROFILER) { t -= p.vekt; if (t <= 0) return p; }
  return PROFILER[0];
}

/**
 * Bygger én runde. Deterministisk: samme (runde, frø) gir samme data,
 * så en feil i runde 417 kan kjøres om igjen nøyaktig som den var.
 */
export function byggRunde(runde, frø = 1) {
  const rng = mulberry32(runde * 2654435761 + frø);
  const profil = trekkProfil(rng);
  const skjerm = pick(rng, SKJERMER);
  const mønster = pick(rng, MØNSTRE);
  const state = grunnBase(rng);
  profil.bygg(state, rng);
  return { profil, skjerm, mønster, state, rng };
}

export { HOUSEHOLD, USER };
