// BasketOptimizer — hva er den mest fornuftige måten å handle HELE lista?
// (prisintelligens fase 3, §13–15 og §29)
//
// Ikke «hvor er hver vare billigst». Spørsmålet er om det er verdt å dra
// til en butikk til — og en ekstra butikk koster noe selv uten gebyr:
// kjøring, tid, parkering, avvik fra ruta. Det heter friksjon her, og det
// er husholdningen som setter den (households.min_saving_extra_store,
// max_extra_stores).
//
// Ren funksjon. Inn: lista, priser per vare og kjede, tilbud, vaner,
// innstillinger. Ut: 2–3 alternativer, og ÉN anbefaling som respekterer
// friksjonen. Aldri «tre butikker for 103 kr».
//
// Sluttresultatet skal kunne leses opp høyt:
//   «Handle hovedhandelen på Coop Extra. Kjøp disse tre på MENY:
//    Norvegia, Gryr, kjøttdeig. Estimert besparelse: 112 kr.»

import { purchases as pakker, kr } from './format.js';
import { lower, trimmed } from './text.js';

export const DEFAULT_SETTINGS = {
  max_extra_stores: 1,
  min_saving_extra_store: 60,   // kr
  min_saving_pct: 5,            // % av hele handelen
  convenience_weight: 1,        // 0 = bare pris, 2 = svært lite lyst på ekstra butikk
};

/** Minste innsparing per vare før den i det hele tatt vurderes flyttet. */
export const MIN_ITEM_SAVING = 3;

const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Bygger et prisoppslag: item (lower) → kjedekode → {price, source, observedAt}.
 *
 * Kilder, i den rekkefølgen §23 vil ha dem for et nåværende anslag:
 *   1. tilbud som gjelder nå (weekly_offer)
 *   2. nyeste observasjon per kjede (price_snapshot)
 *   3. varens egen pris i lista, for kjeden den står i
 */
export function buildPriceIndex(arg) {
  const { snapshot = [], offers = [], items = [], storeCode = (n) => n } = arg && typeof arg === 'object' ? arg : {};
  const idx = new Map();
  const put = (item, chain, q, rank) => {
    const k = lower(item).trim();
    const c = trimmed(chain).toUpperCase();
    if (!k || !c || !q?.price) return;
    if (!idx.has(k)) idx.set(k, new Map());
    const prev = idx.get(k).get(c);
    if (!prev || rank < prev.rank || (rank === prev.rank && (q.observedAt ?? '') > (prev.observedAt ?? ''))) {
      idx.get(k).set(c, { ...q, rank });
    }
  };
  for (const i of Array.isArray(items) ? items : []) {
    const p = num(i?.price);
    if (p && i?.store) put(i.name, storeCode(i.store), { price: p, source: i.price_source ?? 'list', observedAt: null }, 3);
  }
  for (const o of Array.isArray(snapshot) ? snapshot : []) {
    const p = num(o?.unit_price) ?? num(o?.price);
    if (p) put(o.item_name, o.store_code, { price: p, source: o.source ?? 'receipt', observedAt: o.observed_at ?? null, n: o.n ?? 1 }, 2);
  }
  const d = today();
  for (const o of Array.isArray(offers) ? offers : []) {
    if (!o?.match_name || !o?.store_code) continue;
    if (o.valid_to && String(o.valid_to) < d) continue;
    if (o.valid_from && String(o.valid_from) > d) continue;
    const p = num(o.unit_price) ?? num(o.price);
    if (p) put(o.match_name, o.store_code, { price: p, source: 'weekly_offer', observedAt: o.valid_from ?? null, isOffer: true }, 1);
  }
  return idx;
}

/** Hva en linje koster i en gitt kjede, i hele pakker — eller null. */
function lineCost(item, chain, idx) {
  const q = idx.get(lower(item?.name).trim())?.get(trimmed(chain).toUpperCase());
  if (!q) return null;
  return { cost: q.price * pakker(item.qty, item.unit, item.pack_size), quote: q };
}

/**
 * @param {object} p
 * @param {object[]} p.items          åpne varer på lista
 * @param {Map}      p.priceIndex     fra buildPriceIndex()
 * @param {string}   p.defaultStore   kjedekode for hovedbutikken
 * @param {Map}      [p.storePref]    fra purchaseStats.storePreference()
 * @param {object}   [p.settings]     households-innstillingene
 * @param {Function} [p.storeName]    kode → visningsnavn
 */
export function optimizeBasket(arg) {
  const {
    items = [], priceIndex = new Map(), defaultStore, storePref = new Map(),
    settings = {}, storeName = (c) => c,
  } = arg && typeof arg === 'object' ? arg : {};
  const idxOk = priceIndex instanceof Map ? priceIndex : new Map();
  const prefOk = storePref instanceof Map ? storePref : new Map();
  const s = { ...DEFAULT_SETTINGS, ...(settings ?? {}) };
  const home = trimmed(defaultStore).toUpperCase();
  const rows = (Array.isArray(items) ? items : []).filter((i) => i && !i.checked && trimmed(i.name));
  const tom = { options: [], recommended: null, moves: [], message: null, priced: 0, unpriced: rows.length };
  if (!rows.length || !home) return tom;

  // Grunnlag: alt hjemme. Varer uten pris hjemme får varens egen pris
  // hvis den finnes; ellers står de utenfor regnestykket — og sies fra om.
  let homeTotal = 0;
  let priced = 0;
  const homeCost = new Map();
  for (const i of rows) {
    const c = lineCost(i, home, idxOk) ?? (num(i.price) ? { cost: num(i.price) * pakker(i.qty, i.unit, i.pack_size), quote: { source: i.price_source ?? 'list' } } : null);
    if (!c) continue;
    homeCost.set(i.id ?? i.name, c.cost);
    homeTotal += c.cost;
    priced += 1;
  }
  const unpriced = rows.length - priced;

  // Kandidat-kjeder: alle som har pris på minst én av varene, unntatt hjem.
  const chains = new Set();
  for (const i of rows) for (const c of idxOk.get(lower(i.name).trim())?.keys() ?? []) if (c !== home) chains.add(c);

  // Per kjede: hvilke varer sparer noe der, og hvor mye.
  const perChain = [];
  for (const c of chains) {
    const moves = [];
    for (const i of rows) {
      const hjemme = homeCost.get(i.id ?? i.name);
      const der = lineCost(i, c, idxOk);
      if (!der || hjemme === undefined) continue;
      const saving = hjemme - der.cost;
      const pref = prefOk.get(lower(i.name).trim());
      const vane = pref?.preferred_store === c;
      // Flyttes hvis det spares noe, ELLER hvis dere uansett kjøper den der
      // (vane) og det ikke koster mer.
      if (saving >= MIN_ITEM_SAVING || (vane && saving >= 0)) {
        moves.push({
          itemId: i.id ?? null, name: i.name, from: home, to: c,
          homeCost: Number(hjemme.toFixed(2)), cost: Number(der.cost.toFixed(2)),
          saving: Number(saving.toFixed(2)),
          reason: der.quote.isOffer ? 'tilbud' : vane ? 'vane' : 'billigere',
          source: der.quote.source,
        });
      }
    }
    if (!moves.length) continue;
    const saving = moves.reduce((a, m) => a + m.saving, 0);
    perChain.push({ chain: c, moves: moves.sort((a, b) => b.saving - a.saving), saving });
  }
  perChain.sort((a, b) => b.saving - a.saving);

  const option = (id, extra) => {
    const moved = new Set(extra.flatMap((e) => e.moves.map((m) => m.itemId ?? m.name)));
    const homeSum = [...homeCost.entries()].filter(([k]) => !moved.has(k)).reduce((a, [, v]) => a + v, 0);
    const stores = [
      { store: home, name: storeName(home), items: rows.filter((i) => homeCost.has(i.id ?? i.name) && !moved.has(i.id ?? i.name)).map((i) => i.name), sum: Number(homeSum.toFixed(2)) },
      ...extra.map((e) => ({ store: e.chain, name: storeName(e.chain), items: e.moves.map((m) => m.name), sum: Number(e.moves.reduce((a, m) => a + m.cost, 0).toFixed(2)) })),
    ];
    const total = stores.reduce((a, st) => a + st.sum, 0);
    return {
      id, stores, total: Number(total.toFixed(2)),
      saving: Number((homeTotal - total).toFixed(2)),
      extraStores: extra.length,
      moves: extra.flatMap((e) => e.moves),
    };
  };

  const options = [option('A', [])];
  if (perChain[0]) options.push(option('B', [perChain[0]]));
  if (perChain[1] && s.max_extra_stores >= 2) options.push(option('C', perChain.slice(0, 2)));

  // Friksjonen: en ekstra butikk må spare minst X kr og Y % — og jo mer
  // bekvemmelighet veier, jo mer må den spare. Første alternativ som
  // består, med FÆRREST butikker, anbefales. Består ingen: alt hjemme.
  const kravKr = s.min_saving_extra_store * (s.convenience_weight || 1);
  const kravPct = s.min_saving_pct;
  let recommended = options[0];
  for (const o of options.slice(1)) {
    if (o.extraStores > s.max_extra_stores) continue;
    const perExtra = o.saving / o.extraStores;
    const pct = homeTotal > 0 ? (o.saving / homeTotal) * 100 : 0;
    if (perExtra >= kravKr && pct >= kravPct) { recommended = o; break; }
  }

  // Setningen som leses opp høyt (§29).
  let message;
  const best = options[1];
  if (recommended.id === 'A') {
    message = best && best.saving > 0
      ? `Handle alt på ${storeName(home)}. ${storeName(best.stores[1].store)} er ca. ${kr(best.saving)} billigere på ${best.moves.length} ${best.moves.length === 1 ? 'vare' : 'varer'} — ikke nok til å være verdt en ekstra butikk.`
      : `Handle alt på ${storeName(home)}.`;
  } else {
    const ekstra = recommended.stores.slice(1);
    const navn = ekstra.map((st) => storeName(st.store)).join(' og ');
    const liste = recommended.moves.slice(0, 4).map((m) => m.name).join(', ') + (recommended.moves.length > 4 ? ` og ${recommended.moves.length - 4} til` : '');
    message = `Handle hovedhandelen på ${storeName(home)}. Kjøp ${recommended.moves.length === 1 ? 'denne' : `disse ${recommended.moves.length}`} på ${navn}: ${liste}. Estimert besparelse: ${kr(recommended.saving)}.`;
  }

  return {
    options,
    recommended,
    moves: recommended.moves,
    message,
    homeTotal: Number(homeTotal.toFixed(2)),
    priced,
    unpriced,
    note: unpriced > 0 ? `${unpriced} ${unpriced === 1 ? 'vare' : 'varer'} uten pris er ikke med i regnestykket.` : null,
  };
}
