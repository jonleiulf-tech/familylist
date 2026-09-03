// Kjøpsstatistikk for ÉN husholdning (prisintelligens fase 2, §5–7).
//
// Alt her regnes fra household_purchases — husholdningens egne kjøpslinjer,
// bak RLS. Ingenting av det er felles: prisene som er felles ligger i
// item_catalog og price_observations, og regnes av nattjobben.
//
// Rene funksjoner. Inn: rader. Ut: tall. Ingen av dem kaster på rare data.

import { lower, trimmed } from './text.js';

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const dag = (t) => { const ms = Date.parse(t); return Number.isFinite(ms) ? Math.floor(ms / 864e5) : null; };
const median = (xs) => {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (xs) => { const s = xs.filter((x) => Number.isFinite(x)); return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null; };
const round = (v, d = 1) => (v === null ? null : Number(v.toFixed(d)));

/** Grupperer kjøpslinjer per vare (navn, små bokstaver). */
function perItem(purchases) {
  const map = new Map();
  for (const p of Array.isArray(purchases) ? purchases : []) {
    const key = lower(p?.item_name).trim();
    if (!key) continue;
    if (!map.has(key)) map.set(key, { name: trimmed(p.item_name), rows: [] });
    map.get(key).rows.push(p);
  }
  return map;
}

/**
 * Statistikk per vare (§5).
 *
 * Intervallene regnes mellom DISTINKTE kjøpsdager — to linjer melk på
 * samme kvittering er ett kjøp, ikke to kjøp med null dager mellom.
 *
 * @returns Map<lowerName, {name, first_purchased_at, last_purchased_at,
 *   purchase_count, total_qty, avg_qty, avg_days_between, median_days_between,
 *   avg_paid, recent_avg_paid, lowest, highest, days_since_last}>
 */
export function itemStats(purchases, { now = Date.now(), recentDays = 90 } = {}) {
  const out = new Map();
  for (const [key, { name, rows }] of perItem(purchases)) {
    const dager = [...new Set(rows.map((r) => dag(r?.purchased_at)).filter((d) => d !== null))].sort((a, b) => a - b);
    const gaps = dager.slice(1).map((d, i) => d - dager[i]).filter((g) => g > 0);
    const priser = rows.map((r) => num(r?.unit_price) ?? num(r?.price_paid)).filter((p) => p !== null && p > 0);
    const nylige = rows
      .filter((r) => { const t = Date.parse(r?.purchased_at); return Number.isFinite(t) && now - t <= recentDays * 864e5; })
      .map((r) => num(r?.unit_price) ?? num(r?.price_paid)).filter((p) => p !== null && p > 0);
    const mengder = rows.map((r) => num(r?.qty)).filter((q) => q !== null && q > 0);
    const sist = dager.length ? dager[dager.length - 1] : null;
    out.set(key, {
      name,
      first_purchased_at: dager.length ? new Date(dager[0] * 864e5).toISOString().slice(0, 10) : null,
      last_purchased_at: sist !== null ? new Date(sist * 864e5).toISOString().slice(0, 10) : null,
      purchase_count: dager.length,
      line_count: rows.length,
      total_qty: round(mengder.reduce((a, b) => a + b, 0), 3),
      avg_qty: round(mean(mengder), 2),
      avg_days_between: gaps.length ? round(mean(gaps)) : null,
      median_days_between: gaps.length ? round(median(gaps)) : null,
      avg_paid: round(mean(priser), 2),
      recent_avg_paid: round(mean(nylige), 2),
      lowest: priser.length ? Math.min(...priser) : null,
      highest: priser.length ? Math.max(...priser) : null,
      days_since_last: sist !== null ? Math.floor(now / 864e5) - sist : null,
    });
  }
  return out;
}

/** Hvor mye et tilbudskjøp skal telle mot en fast preferanse (§7). */
export const OFFER_WEIGHT = 0.35;

/**
 * Butikkpreferanse per vare (§6–7).
 *
 * Et kjøp på MENY fordi det var 40 % rabatt skal ikke gjøre MENY til
 * fast butikk. Tilbudskjøp teller med OFFER_WEIGHT i preferansen, men
 * telles fullt i `willing_when_cheaper`: «kjøper gjerne denne på MENY når
 * det er billigere».
 *
 * @returns Map<lowerName, {name, total, preferred_store, share, stores:[{chain_code, count, share, weighted_share, avg_price, last_purchase, offer_share}], willing_when_cheaper:[chain_code]}>
 */
export function storePreference(purchases, { offerWeight = OFFER_WEIGHT } = {}) {
  const out = new Map();
  for (const [key, { name, rows }] of perItem(purchases)) {
    const med = rows.filter((r) => trimmed(r?.chain_code));
    if (!med.length) continue;
    const per = new Map();
    for (const r of med) {
      const c = trimmed(r.chain_code).toUpperCase();
      const s = per.get(c) ?? { chain_code: c, count: 0, weighted: 0, offers: 0, priser: [], last: null };
      const offer = r?.purchase_reason === 'offer';
      s.count += 1;
      s.weighted += offer ? offerWeight : 1;
      if (offer) s.offers += 1;
      const p = num(r?.unit_price) ?? num(r?.price_paid);
      if (p !== null && p > 0) s.priser.push(p);
      const t = Date.parse(r?.purchased_at);
      if (Number.isFinite(t) && (!s.last || t > s.last)) s.last = t;
      per.set(c, s);
    }
    const total = med.length;
    const weightedTotal = [...per.values()].reduce((a, s) => a + s.weighted, 0) || 1;
    const stores = [...per.values()].map((s) => ({
      chain_code: s.chain_code,
      count: s.count,
      share: round(s.count / total, 3),
      weighted_share: round(s.weighted / weightedTotal, 3),
      offer_share: round(s.offers / s.count, 3),
      avg_price: round(mean(s.priser), 2),
      last_purchase: s.last ? new Date(s.last).toISOString().slice(0, 10) : null,
    })).sort((a, b) => b.weighted_share - a.weighted_share || b.count - a.count);
    const topp = stores[0];
    out.set(key, {
      name,
      total,
      preferred_store: topp && topp.count >= 2 && topp.weighted_share >= 0.5 ? topp.chain_code : null,
      share: topp?.weighted_share ?? null,
      stores,
      // Butikker der minst halvparten av kjøpene var tilbud: dit går man
      // for pris, ikke av vane.
      willing_when_cheaper: stores.filter((s) => s.count >= 1 && s.offer_share >= 0.5 && s.chain_code !== topp?.chain_code).map((s) => s.chain_code),
    });
  }
  return out;
}

/** Foretrukket produkt per vare: det produktet som er kjøpt flest ganger (§5). */
export function preferredProduct(purchases) {
  const out = new Map();
  for (const [key, { rows }] of perItem(purchases)) {
    const per = new Map();
    for (const r of rows) {
      const pid = r?.product_id;
      if (pid === null || pid === undefined) continue;
      per.set(pid, (per.get(pid) ?? 0) + 1);
    }
    if (!per.size) continue;
    const [pid, n] = [...per.entries()].sort((a, b) => b[1] - a[1])[0];
    out.set(key, { product_id: pid, count: n });
  }
  return out;
}

/** Alt på én gang, for hooken. */
export function householdStats(purchases, opts = {}) {
  const byItem = itemStats(purchases, opts);
  return {
    byItem,
    storePref: storePreference(purchases, opts),
    product: preferredProduct(purchases),
    // Fase 4
    next: nextPurchase(byItem),
    together: coOccurrence(purchases),
    savings: savingsSummary(purchases, opts),
    rows: Array.isArray(purchases) ? purchases.length : 0,
  };
}

/** «Dere kjøper vanligvis dette på Coop Extra (85 %)» — eller null. */
export function preferenceText(pref, storeName = (c) => c) {
  if (!pref?.preferred_store) return null;
  const pct = Math.round((pref.share ?? 0) * 100);
  return `Dere kjøper vanligvis dette på ${storeName(pref.preferred_store)} (${pct} %)`;
}

// ---------------------------------------------------------------------
// Fase 4
// ---------------------------------------------------------------------

/**
 * Neste-kjøp-sannsynlighet (§19).
 *
 * Melk kjøpes ca. hver 7. dag og ble sist kjøpt for 6 dager siden: da er
 * det snart tid. Sannsynligheten er en glatt kurve rundt medianintervallet
 * — 0,5 akkurat på intervallet, 0,73 en firedel over, 0,27 en firedel
 * under. Under tre kjøp finnes det ikke noe mønster å regne på.
 *
 * En vare det er gått mer enn tre intervaller siden sist for, regnes som
 * «sluttet med» (lapsed): kanskje de har byttet merke eller gått over til
 * havredrikk. Den skal ikke stå og mase for alltid.
 *
 * @param {Map} byItem  fra itemStats()
 * @returns Map<lowerName, {name, probability, expected_in_days, median_days_between, days_since_last, due, lapsed}>
 */
export function nextPurchase(byItem) {
  const out = new Map();
  if (!(byItem instanceof Map)) return out;
  for (const [key, s] of byItem) {
    const m = num(s?.median_days_between) ?? num(s?.avg_days_between);
    const d = num(s?.days_since_last);
    if (!s || (s.purchase_count ?? 0) < 3 || m === null || m < 1 || d === null) continue;
    const lapsed = d > 3 * m;
    const p = lapsed ? 0.25 : 1 / (1 + Math.exp(-(d - m) / (0.25 * m)));
    out.set(key, {
      name: s.name,
      probability: Number(p.toFixed(2)),
      expected_in_days: Math.round(m - d),
      median_days_between: m,
      days_since_last: d,
      due: !lapsed && p >= 0.5,
      lapsed,
    });
  }
  return out;
}

/**
 * Varer det snart er tid for, som ikke alt står på lista (§19).
 * Mest sannsynlig først.
 */
export function dueItems(next, existingNames = new Set(), { min = 0.6, limit = 8 } = {}) {
  if (!(next instanceof Map)) return [];
  const har = existingNames instanceof Set ? existingNames : new Set();
  return [...next.entries()]
    .filter(([key, n]) => !n.lapsed && n.probability >= min && !har.has(key))
    .map(([, n]) => n)
    .sort((a, b) => b.probability - a.probability)
    .slice(0, limit);
}

/**
 * Varer som opptrer sammen på kvitteringene (§21).
 *
 * Et svakt signal: «dere pleier å kjøpe taco-lefser når dere kjøper
 * kjøttdeig». Brukes til å NEVNE, aldri til å legge til av seg selv.
 * Én handletur = én kvittering (receipt_upload_id), eller samme dag når
 * kvitteringen mangler.
 *
 * @returns Map<lowerName, [{name, count, share}]>  share = andel av turene
 *   med A der B også var med
 */
export function coOccurrence(purchases, { minCount = 3, minShare = 0.5, maxItemsPerTrip = 80 } = {}) {
  const out = new Map();
  const turer = new Map();
  for (const p of Array.isArray(purchases) ? purchases : []) {
    const key = lower(p?.item_name).trim();
    if (!key) continue;
    const dagen = dag(p?.purchased_at);
    const tur = p?.receipt_upload_id ?? (dagen !== null ? `${p?.household_id ?? ''}|${dagen}` : null);
    if (!tur) continue;
    if (!turer.has(tur)) turer.set(tur, new Map());
    turer.get(tur).set(key, trimmed(p.item_name));
  }
  const antall = new Map();
  const par = new Map();
  for (const varer of turer.values()) {
    if (varer.size < 2 || varer.size > maxItemsPerTrip) continue;
    const keys = [...varer.keys()];
    for (const a of keys) antall.set(a, (antall.get(a) ?? 0) + 1);
    for (let i = 0; i < keys.length; i += 1) {
      for (let j = 0; j < keys.length; j += 1) {
        if (i === j) continue;
        const k = `${keys[i]} ${keys[j]}`;
        const prev = par.get(k) ?? { name: varer.get(keys[j]), count: 0 };
        prev.count += 1;
        par.set(k, prev);
      }
    }
  }
  for (const [k, v] of par) {
    const [a] = k.split(' ');
    const base = antall.get(a) ?? 0;
    if (v.count < minCount || !base) continue;
    const share = v.count / base;
    if (share < minShare) continue;
    if (!out.has(a)) out.set(a, []);
    out.get(a).push({ name: v.name, count: v.count, share: round(share, 2) });
  }
  for (const list of out.values()) list.sort((x, y) => y.share - x.share || y.count - x.count);
  return out;
}

/** «Pleier å følge med: taco-lefser, rømme» — eller null. */
export function companionsText(list, { limit = 3 } = {}) {
  if (!Array.isArray(list) || !list.length) return null;
  return `Pleier å følge med: ${list.slice(0, limit).map((c) => c.name).join(', ')}`;
}

/**
 * Sparing (§24): summen av estimated_saving på kjøpslinjene i perioden.
 *
 * Konservativt med vilje. Referansen er husholdningens egen medianpris,
 * aldri en «førpris»; et kjøp som var dyrere enn vanlig teller 0, ikke
 * negativt; og linjer under minConfidence teller ikke. Tallet skal kunne
 * stoles på når det står «Spart ca. kr 84 denne måneden».
 */
export function savingsSummary(purchases, { now = Date.now(), days = 30, minConfidence = 0.5 } = {}) {
  const t0 = Number(now) || Date.now();
  let saving = 0;
  let count = 0;
  let vekt = 0;
  for (const p of Array.isArray(purchases) ? purchases : []) {
    const t = Date.parse(p?.purchased_at);
    if (!Number.isFinite(t) || t0 - t > days * 864e5 || t > t0 + 864e5) continue;
    const s = num(p?.estimated_saving);
    const c = num(p?.saving_confidence);
    if (s === null || s <= 0 || c === null || c < minConfidence) continue;
    saving += s;
    count += 1;
    vekt += c;
  }
  const confidence = count ? round(vekt / count, 2) : null;
  const sum = Math.round(saving);
  const periode = days === 30 ? 'denne måneden' : days === 7 ? 'denne uka' : `siste ${days} dager`;
  return {
    saving: sum,
    count,
    confidence,
    text: sum >= 1
      ? `Spart ca. kr ${sum} ${periode} på ${count} kjøp${confidence !== null && confidence < 0.7 ? ' (anslag)' : ''}`
      : null,
  };
}
