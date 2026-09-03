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
  return {
    byItem: itemStats(purchases, opts),
    storePref: storePreference(purchases, opts),
    product: preferredProduct(purchases),
    rows: Array.isArray(purchases) ? purchases.length : 0,
  };
}

/** «Dere kjøper vanligvis dette på Coop Extra (85 %)» — eller null. */
export function preferenceText(pref, storeName = (c) => c) {
  if (!pref?.preferred_store) return null;
  const pct = Math.round((pref.share ?? 0) * 100);
  return `Dere kjøper vanligvis dette på ${storeName(pref.preferred_store)} (${pct} %)`;
}
