// En falsk Supabase, servert til nettleseren via Playwrights route().
//
// Hvorfor: den ekte basen er ikke tilgjengelig herfra (utgangspolicyen
// avviser hijthzsbpffjrajlnlrw.supabase.co), og selv om den var det, ville
// en apekatt-test som klikker tusen ganger i produksjonsdata vært en
// dårlig idé — prisobservasjonene er FELLES for alle familier.
//
// Derfor fakes NETTVERKET, ikke appen. Appkoden kjører uendret, med sin
// egen supabase-js, sine egne hooks og sin egen tilstand. Det er nettopp
// den koden som har feilet hos Jon: blank fane, manglende blyant, dialoger
// uten vei ut. Det finner denne. RLS og migrasjoner finner den ikke — de
// er testet direkte mot Postgres i stedet.

import { readFileSync } from 'node:fs';

/**
 * Nettleserflagg for testkjøring.
 *
 * DNS-oppslag utenfor localhost slås av HELT. page.route() rakk ikke over
 * alt: Chromium gjør sine egne oppslag mot www.google.com for å sjekke om
 * nettet virker, og de går utenom sidens ruter. Her gikk hvert forsøk
 * gjennom en utgangsproxy som avviser dem — 221 mislykkede forbindelser i
 * én kjøring, og en sidelasting på 13 sekunder i stedet for to.
 */
export const BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1',
  '--disable-background-networking',
  '--disable-component-update',
  '--disable-domain-reliability',
  '--no-first-run',
  '--no-default-browser-check',
];

const nowIso = () => new Date().toISOString();
const iso = (d) => d.toISOString().slice(0, 10);
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = Math.random() * 16 | 0;
  return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
});

const HOUSEHOLD = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';

/** Katalogvarer hentet fra ekte seed-rader, slik prisene er i basen nå. */
const CATALOG = [
  ['Brød/bakervarer', 'Brød og korn', 24, 19, 57, 93],
  ['Melk', 'Meieri', 8, 8, 35, 44],
  ['Agurk', 'Frukt og grønt', 14, 11, 57, 59],
  ['Egg', 'Meieri', 4, 4, 65, 25],
  ['Makrell i tomat', 'Ost og pålegg', 14, 6, 55, 44],
  ['Kjøttdeig/karbonadedeig', 'Kjøtt', 9, 8, 198, 45],
  ['Poteter', 'Frukt og grønt', 17, 12, 48, 65],
  ['Paprika', 'Frukt og grønt', 18, 16, 30, 78],
  ['Spagetti', 'Tørrvarer', 0, 0, 0, 20],
  ['Tomater/passata/tomatboks', 'Tørrvarer', 14, 11, 37, 59],
  ['Gulost/Norvegia', 'Meieri', 9, 7, 226, 42],
  ['Pølser', 'Kjøtt', 6, 5, 45, 30],
  ['Havredrikk', 'Meieri', 3, 3, 58, 18],
  ['Tacolefser/tortilla/lomper', 'Tørrvarer', 13, 10, 27, 43],
  ['Kyllingfilet', 'Kjøtt', 7, 6, 120, 40],
  ['Laksefilet', 'Fisk', 5, 4, 0, 22],
  ['Smør', 'Meieri', 6, 5, 0, 28],
  ['Macaroni', 'Tørrvarer', 2, 2, 22, 8],
  ['Bananer', 'Frukt og grønt', 11, 9, 25, 48],
  ['Yoghurt', 'Meieri', 8, 6, 30, 35],
].map(([name, major, ln, rc, price, score], i) => ({
  id: i + 1,
  name,
  category: major,
  major_category: major,
  avg_price: price || 0,
  avg_price_unit: null,
  price_low: price ? Math.round(price * 0.6) : 0,
  price_high: price ? Math.round(price * 1.8) : 0,
  frequency_sig: score > 50 ? 'Svært ofte' : score > 30 ? 'Ofte' : null,
  primary_store: 'Coop Extra',
  score,
  brand: null,
  line_count: ln,
  receipt_count: rc,
  active: true,
}));

const STORES = [
  { code: 'COOP_EXTRA', name: 'Coop Extra', is_default: true, sort_order: 1 },
  { code: 'MENY_NO', name: 'Meny', is_default: false, sort_order: 2 },
  { code: 'REMA_1000', name: 'Rema 1000', is_default: false, sort_order: 3 },
];

const MEAL_LIBRARY = [
  { name: 'Taco', category: 'Tex-Mex', ingredients: [
    { n: 'Kjøttdeig/karbonadedeig', qty: 400, unit: 'g' },
    { n: 'Tacolefser/tortilla/lomper', qty: 8, unit: 'stk' },
    { n: 'Paprika', qty: 1, unit: 'stk' },
    { n: 'Agurk', qty: 1, unit: 'stk' },
  ] },
  { name: 'Spagetti bolognese', category: 'Pasta', ingredients: [
    { n: 'Spagetti', qty: 500, unit: 'g' },
    { n: 'Kjøttdeig/karbonadedeig', qty: 400, unit: 'g' },
    { n: 'Tomater/passata/tomatboks', qty: 2, unit: 'boks' },
  ] },
  { name: 'Pølser med lompe', category: 'Enkelt', ingredients: [
    { n: 'Pølser', qty: 8, unit: 'stk' },
    { n: 'Tacolefser/tortilla/lomper', qty: 10, unit: 'stk' },
  ] },
  { name: 'Makrell i tomat på brød', category: 'Enkelt', ingredients: [
    { n: 'Makrell i tomat', qty: 2, unit: 'stk' },
    { n: 'Brød/bakervarer', qty: 1, unit: 'stk' },
    { n: 'Egg', qty: 4, unit: 'stk' },
    { n: 'Agurk', qty: 1, unit: 'stk' },
  ] },
  { name: 'Laks med poteter', category: 'Fisk', ingredients: [
    { n: 'Laksefilet', qty: 600, unit: 'g' },
    { n: 'Poteter', qty: 1, unit: 'kg' },
    { n: 'Smør', qty: 1, unit: 'pakke' },
  ] },
];

/** Tilbud med og uten førpris, og ett spredt over flere butikker. */
const OFFERS = [
  {
    id: uuid(), store_code: 'REMA_1000', store_name: 'Rema 1000',
    product_name: 'Makrell i tomat 170g Stabburet', match_name: 'Makrell i tomat',
    price: 19.9, original_price: 47.5, unit: 'stk', unit_price: 19.9,
    valid_from: iso(new Date()), valid_to: iso(new Date(Date.now() + 5 * 864e5)),
    source: 'Kundeavis', source_type: 'customer_flyer', household_id: null,
    category: 'Ost og pålegg',
  },
  {
    id: uuid(), store_code: 'COOP_EXTRA', store_name: 'Coop Extra',
    product_name: 'Egg 12pk Prior', match_name: 'Egg',
    price: 39.9, original_price: 65, unit: 'stk', unit_price: 3.3,
    valid_from: iso(new Date()), valid_to: iso(new Date(Date.now() + 3 * 864e5)),
    source: 'Kassalapp – under deres snittpris', source_type: 'api', household_id: null,
    category: 'Meieri',
  },
  {
    id: uuid(), store_code: 'MENY_NO', store_name: 'Meny',
    product_name: 'Grovbrød', match_name: 'Brød/bakervarer',
    price: 19.9, original_price: null, unit: 'stk', unit_price: 19.9,
    valid_from: iso(new Date()), valid_to: iso(new Date(Date.now() + 2 * 864e5)),
    source: 'Butikkens nettside – Meny', source_type: 'web_page', household_id: null,
    category: 'Brød og korn',
  },
  {
    id: uuid(), store_code: 'KIWI', store_name: 'KIWI',
    product_name: 'Agurk', match_name: 'Agurk',
    price: 9.9, original_price: 24.9, unit: 'stk', unit_price: 9.9,
    valid_from: iso(new Date()), valid_to: iso(new Date(Date.now() + 4 * 864e5)),
    source: 'Kundeavis', source_type: 'customer_flyer', household_id: null,
    category: 'Frukt og grønt',
  },
];

/** Tilstanden testen jobber mot. Skrives av appen, leses av appen. */
export function makeState() {
  const today = new Date();
  const plan = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(today.getTime() + i * 864e5);
    plan.push({
      household_id: HOUSEHOLD, plan_date: iso(d),
      meal_id: i < 3 ? `meal-${i}` : null,
      meal_name: i < 3 ? MEAL_LIBRARY[i].name : null,
      guest_portions: 0, sent_to_list_at: i === 0 ? nowIso() : null,
      skipped: false, reason: i === 0 ? 'Regel: Taco på denne ukedagen' : null,
      locked: false,
    });
  }

  return {
    households: [{
      id: HOUSEHOLD, name: 'Testfamilien', kind: 'familie',
      default_store: 'Coop Extra', adults: 2, children: 2, portions_set: true,
      hidden_meals: [], calendar_token: uuid(), created_at: nowIso(),
    }],
    members: [{
      household_id: HOUSEHOLD, user_id: USER, display_name: 'Test',
      initials: 'TE', role: 'owner', avatar: null, created_at: nowIso(),
      households: null,
    }],
    profiles: [{ user_id: USER, display_name: 'Test', avatar: null }],
    item_catalog: CATALOG,
    norm_rules: [
      { from_text: 'NORWEGIA', to_text: 'Gulost/Norvegia' },
      { from_text: 'ADVOKADO', to_text: 'Avokado' },
    ],
    stores: STORES,
    meal_library: MEAL_LIBRARY,
    meal_patterns: [],
    meals: MEAL_LIBRARY.slice(0, 3).map((m, i) => ({
      id: `meal-${i}`, household_id: HOUSEHOLD, name: m.name,
      category: m.category, ingredients: m.ingredients, base_servings: 4,
      instructions_url: null, source_label: null, source_instructions: null,
      instructions: null, created_at: nowIso(),
    })),
    meal_plan: plan,
    meal_week_templates: [{
      id: uuid(), household_id: HOUSEHOLD, name: 'Hverdagsuka',
      days: [{ weekday: 1, meal_name: 'Taco' }, { weekday: 3, meal_name: 'Spagetti bolognese' }],
    }],
    shopping_items: [
      ['Melk', 2, 'liter', 'Meieri', 'Coop Extra', 35, 1],
      ['Brød/bakervarer', 1, 'stk', 'Brød og korn', 'Coop Extra', 24, null],
      ['Agurk', 1, 'stk', 'Frukt og grønt', 'Coop Extra', 57, null],
      ['Egg', 6, 'stk', 'Meieri', 'Coop Extra', 65, 6],
      ['Kjøttdeig/karbonadedeig', 400, 'g', 'Kjøtt', 'Meny', 198, 400],
      ['Pølser', 8, 'stk', 'Kjøtt', 'Meny', 45, 8],
      ['Spagetti', 500, 'g', 'Tørrvarer', 'Coop Extra', 0, 400],
      ['Poteter', 2, 'kg', 'Frukt og grønt', 'Rema 1000', 48, 1000],
    ].map(([name, qty, unit, category, store, price, pack_size], i) => ({
      id: `item-${i}`, household_id: HOUSEHOLD, name, qty, unit, category, store,
      price, pack_size, price_source: price ? 'receipt' : null,
      checked: false, checked_at: null, checked_by: null,
      created_by: USER, created_at: nowIso(), is_offer: false, variant: null,
      kassal_product_id: null, ean: null, brand: null, kassal_name: null,
    })),
    custom_lists: [{
      id: uuid(), household_id: HOUSEHOLD, name: 'Hytta', kind: 'annet',
      items: [{ id: uuid(), name: 'Ved', done: false }],
      shared: true, created_by: USER, updated_by: USER, created_at: nowIso(),
    }],
    saved_trips: [{
      id: uuid(), household_id: HOUSEHOLD, name: 'Handleliste 28. august',
      items: [{ name: 'Melk', qty: 2, unit: 'liter', price: 35, pack_size: 1 }],
      created_by: USER, created_at: new Date(Date.now() - 6 * 864e5).toISOString(),
    }],
    rules: [{
      id: uuid(), household_id: HOUSEHOLD, kind: 'ukedag', scope: 'Taco',
      weekday: 5, every_n_days: null, active: true,
    }],
    import_queue: [],
    offers: OFFERS,
    item_tags: [{ item_name: 'Melk', tag: 'fast' }],
    item_habits: [
      { household_id: HOUSEHOLD, item_name: 'Agurk', usual_qty: 2.1, unit: 'stk', times_bought: 4, last_bought_at: nowIso() },
      { household_id: HOUSEHOLD, item_name: 'Havredrikk', usual_qty: 3, unit: 'stk', times_bought: 3, last_bought_at: nowIso() },
    ],
    point_events: [{ id: uuid(), user_id: USER, kind: 'kvittering', points: 20, ref: uuid(), note: 'Kvittering', created_at: nowIso() }],
    subscriptions: [{
      household_id: HOUSEHOLD, status: 'prøve',
      paid_until: iso(new Date(Date.now() + 20 * 864e5)),
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

/** Enkelt PostgREST-filter: bare det appen faktisk bruker. */
function applyFilters(rows, params) {
  let out = [...rows];
  for (const [key, raw] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(key)) continue;
    const m = /^(eq|neq|gt|gte|lt|lte|is|in|like|ilike)\.(.*)$/s.exec(raw);
    if (!m) continue;
    const [, op, val] = m;
    out = out.filter((r) => {
      const v = r[key];
      switch (op) {
        case 'eq': return String(v) === val;
        case 'neq': return String(v) !== val;
        case 'gt': return v > val;
        case 'gte': return String(v) >= val;
        case 'lt': return v < val;
        case 'lte': return String(v) <= val;
        case 'is': return val === 'null' ? (v === null || v === undefined)
          : val === 'true' ? v === true : val === 'false' ? v === false : true;
        case 'in': {
          const list = val.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, ''));
          return list.includes(String(v));
        }
        case 'like': case 'ilike': {
          const re = new RegExp(`^${val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')}$`, 'i');
          return re.test(String(v ?? ''));
        }
        default: return true;
      }
    });
  }
  const order = params.get('order');
  if (order) {
    const [col, dir] = order.split('.');
    out.sort((a, b) => {
      const x = a[col]; const y = b[col];
      const c = x === y ? 0 : (x ?? '') < (y ?? '') ? -1 : 1;
      return dir === 'desc' ? -c : c;
    });
  }
  const limit = Number(params.get('limit'));
  if (Number.isFinite(limit) && limit > 0) out = out.slice(0, limit);
  return out;
}

/** RPC-svar appen forventer. */
function rpc(name, body, state) {
  switch (name) {
    case 'bootstrap_household': return HOUSEHOLD;
    case 'create_shared_list': {
      const id = uuid();
      state.households.push({
        id, name: body.list_name ?? 'Ny liste', kind: body.list_kind ?? 'annet',
        default_store: 'Coop Extra', adults: 2, children: 0, portions_set: false,
        hidden_meals: [], calendar_token: uuid(), created_at: nowIso(),
      });
      state.members.push({
        household_id: id, user_id: USER, display_name: 'Test', initials: 'TE',
        role: 'owner', avatar: null, created_at: nowIso(), households: null,
      });
      return id;
    }
    case 'create_invite':
      return [{ code: 'B2CEGP', expires_at: new Date(Date.now() + 7 * 864e5).toISOString() }];
    case 'redeem_invite': return [{ status: 'not_found', household_id: null }];
    case 'accept_invite': return null;
    case 'leave_shared_list': return null;
    case 'record_price_observations': return 0;
    case 'log_receipt_upload':
      return [{ ok: true, points: 20, message: 'Takk! +20 Plukkepoeng.' }];
    case 'redeem_points_for_month':
      return [{ ok: false, message: 'Du har 20 poeng — innløsning krever 150.', new_paid_until: null }];
    case 'count_bump': case 'count_rename': return null;
    default: return null;
  }
}

/**
 * Kobler den falske basen på en Playwright-side.
 * Returnerer tilstanden, slik at testen kan lese hva appen skrev.
 */
export async function installFakeSupabase(page, supabaseHost) {
  const state = makeState();
  const calls = [];

  // Predikat, ikke glob. Med mønsteret `**<host>/**` traff ingenting, og
  // da gikk kallene ut til den ekte (sperrede) verten — appen sto på
  // «Laster …» i all evighet, og callisten var tom. En rutefeil som ser
  // ut som en apphenging.
  await page.route((url) => url.host === supabaseHost, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();
    calls.push(`${method} ${path}`);

    const json = (body, status = 200) => route.fulfill({
      status,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*', 'content-range': '0-0/*' },
      body: JSON.stringify(body),
    });

    if (method === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
        },
      });
    }

    // --- Auth ---
    if (path.startsWith('/auth/v1')) {
      if (path.includes('/user')) {
        return json({ id: USER, email: 'test@example.no', user_metadata: {} });
      }
      if (path.includes('/logout')) return json({});
      return json({
        access_token: 'fake', token_type: 'bearer', expires_in: 3600,
        refresh_token: 'fake', user: { id: USER, email: 'test@example.no', user_metadata: {} },
      });
    }

    // --- Edge Functions ---
    if (path.startsWith('/functions/v1/')) {
      const fn = path.split('/functions/v1/')[1];
      if (fn === 'kassal-products') return json({ products: [] });
      if (fn === 'receipt-ocr') return json({ error: 'OCR er ikke satt opp.' }, 501);
      if (fn === 'read-offer-photo') return json({ error: 'Kundeavis-skanning er ikke satt opp ennå.' }, 501);
      if (fn === 'send-invite') return json({ error: 'E-postutsending er ikke satt opp ennå.', code: 'NO_MAILER' }, 501);
      if (fn === 'fetch-recipe') return json({ steps: [], stored: false, title: null, servings: null });
      return json({});
    }

    // --- REST ---
    if (path.startsWith('/rest/v1/')) {
      const table = path.split('/rest/v1/')[1].split('?')[0];
      if (table.startsWith('rpc/')) {
        const body = req.postDataJSON?.() ?? {};
        return json(rpc(table.slice(4), body, state));
      }
      state[table] = state[table] ?? [];

      if (method === 'GET') {
        let rows = applyFilters(state[table], url.searchParams);
        // members(…, households(*)) — appen henter listene gjennom denne.
        const select = url.searchParams.get('select') ?? '';
        if (table === 'members' && select.includes('households')) {
          rows = rows.map((m) => ({
            ...m,
            households: state.households.find((h) => h.id === m.household_id) ?? null,
          }));
        }
        return json(rows);
      }

      if (method === 'POST') {
        const payload = req.postDataJSON?.() ?? {};
        const rows = (Array.isArray(payload) ? payload : [payload]).map((r) => ({
          id: r.id ?? uuid(), created_at: nowIso(), ...r,
        }));
        // Upsert: bytt ut rader med samme nøkkel i stedet for å duplisere.
        const conflict = (url.searchParams.get('on_conflict') ?? '').split(',').filter(Boolean);
        for (const row of rows) {
          const i = conflict.length
            ? state[table].findIndex((e) => conflict.every((k) => String(e[k]) === String(row[k])))
            : -1;
          if (i >= 0) state[table][i] = { ...state[table][i], ...row };
          else state[table].push(row);
        }
        return json(rows, 201);
      }

      if (method === 'PATCH') {
        const patch = req.postDataJSON?.() ?? {};
        const hit = applyFilters(state[table], url.searchParams);
        const ids = new Set(hit.map((r) => r.id));
        state[table] = state[table].map((r) => (ids.has(r.id) ? { ...r, ...patch } : r));
        return json([...ids].map((id) => state[table].find((r) => r.id === id)));
      }

      if (method === 'DELETE') {
        const hit = applyFilters(state[table], url.searchParams);
        const ids = new Set(hit.map((r) => r.id));
        state[table] = state[table].filter((r) => !ids.has(r.id));
        return json(hit);
      }
    }

    return json({});
  });

  // Realtime: appen åpner en WebSocket. Den skal bare ikke krasje.
  await page.route((url) => url.pathname.startsWith('/realtime/v1'), (route) => route.abort());

  return { state, calls, HOUSEHOLD, USER };
}

export function readEnvHost(envPath) {
  const txt = readFileSync(envPath, 'utf-8');
  const m = /VITE_SUPABASE_URL=(.*)/.exec(txt);
  if (!m) throw new Error('VITE_SUPABASE_URL mangler i .env');
  return new URL(m[1].trim()).host;
}

/**
 * Nøkkelen supabase-js lagrer sesjonen under: sb-<prosjekt-ref>-auth-token.
 *
 * Første forsøk gjettet «sb-fake-auth-token», og da fant biblioteket
 * ingen sesjon — apekatten satt på innloggingsskjermen og trykket 48
 * ganger på ingenting, men rapporterte «ingen feil». Verre enn en feil:
 * en test som ser grønn ut uten å ha testet noe.
 */
export function authStorageKey(host) {
  return `sb-${host.split('.')[0]}-auth-token`;
}

/** En sesjon gotrue-js godtar som gyldig. */
export function fakeSession(userId = USER) {
  const nowSec = Math.floor(Date.now() / 1000);
  return {
    access_token: 'fake-access-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: nowSec + 3600,
    refresh_token: 'fake-refresh-token',
    user: {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'test@example.no',
      email_confirmed_at: new Date().toISOString(),
      phone: '',
      confirmed_at: new Date().toISOString(),
      last_sign_in_at: new Date().toISOString(),
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      identities: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };
}
