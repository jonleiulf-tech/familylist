// «Kjøp nå, før tilbudet går ut» (prisintelligens fase 4, §17–18).
//
// Tre ting må stemme samtidig før vi sier det:
//   1. Dere kjøper varen jevnlig (minst tre kjøp, kjent intervall), og
//      neste kjøp kommer ETTER at tilbudet er over — ellers rekker dere
//      det uansett.
//   2. Varen tåler å ligge: stock_up_suitability high eller medium.
//      Ferskvare (low) foreslås aldri kjøpt på forskudd.
//   3. Prisen er faktisk lavere enn det DERE pleier å betale — mot egen
//      historikk, ikke mot kundeavisens «førpris».
//
// Ren funksjon. Aldri auto-legg-til: dette er et forslag med en setning
// som forklarer hvorfor, og en knapp.

import { lower, trimmed } from './text.js';
import { kr } from './format.js';

const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
const dagerTil = (iso, now) => {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.ceil((t - now) / 864e5);
};
const fmtDato = (iso) => (iso && iso.length >= 10 ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : '');

/** Minste innsparing før det er verdt å si noe: 2 kr og 5 %. */
export const MIN_SAVING_KR = 2;
export const MIN_SAVING_PCT = 5;

/**
 * @param {object} p
 * @param {object[]} p.offers        ukens tilbud (med match_name, valid_to, price/unit_price)
 * @param {Map}      p.byItem        purchaseStats.itemStats()
 * @param {Map}      p.next          purchaseStats.nextPurchase()
 * @param {object[]} p.catalog       item_catalog (name, stock_up_suitability)
 * @param {Set}      [p.existingNames] varer som alt står på lista (lower)
 * @param {number}   [p.now]
 * @param {number}   [p.limit]
 */
export function buyEarlySuggestions(arg) {
  const {
    offers = [], byItem = new Map(), next = new Map(), catalog = [],
    existingNames = new Set(), now = Date.now(), limit = 5,
  } = arg && typeof arg === 'object' ? arg : {};
  if (!(byItem instanceof Map) || !(next instanceof Map)) return [];
  const t0 = Number(now) || Date.now();
  const har = existingNames instanceof Set ? existingNames : new Set();
  const egnethet = new Map();
  for (const c of Array.isArray(catalog) ? catalog : []) {
    const k = lower(c?.name).trim();
    if (k) egnethet.set(k, c?.stock_up_suitability ?? null);
  }

  const ut = [];
  for (const o of Array.isArray(offers) ? offers : []) {
    const key = lower(o?.match_name).trim();
    if (!key || har.has(key)) continue;
    const s = byItem.get(key);
    const n = next.get(key);
    if (!s || !n || n.lapsed || (s.purchase_count ?? 0) < 3) continue;

    // 1. Tidsvinduet: tilbudet går ut før dere normalt ville kjøpt igjen.
    const igjen = dagerTil(o?.valid_to, t0);
    if (igjen === null || igjen < 0) continue;                  // utløpt eller uten dato
    if (n.expected_in_days <= igjen) continue;                  // dere rekker det uansett

    // 2. Tåler varen å ligge?
    const suit = egnethet.get(key) ?? 'medium';
    if (suit === 'low') continue;

    // 3. Er det billigere enn det dere pleier å betale?
    const pris = num(o?.unit_price) ?? num(o?.price);
    const vanlig = num(s.recent_avg_paid) ?? num(s.avg_paid);
    if (!pris || !vanlig) continue;
    const sparPerStk = vanlig - pris;
    if (sparPerStk < MIN_SAVING_KR || (sparPerStk / vanlig) * 100 < MIN_SAVING_PCT) continue;

    // Antall: det dere pleier å ta — og dobbelt når varen tåler lager.
    const vanligAntall = Math.max(1, Math.round(num(s.avg_qty) ?? 1));
    const qty = Math.min(suit === 'high' ? vanligAntall * 2 : vanligAntall, 6);
    const saving = Number((sparPerStk * qty).toFixed(2));

    const hver = n.median_days_between;
    const om = Math.max(1, n.expected_in_days);
    ut.push({
      name: trimmed(o.match_name) || s.name,
      offer: o,
      qty,
      price: pris,
      usual: vanlig,
      saving,
      suitability: suit,
      days_left: igjen,
      expected_in_days: om,
      reason: `Dere kjøper ${lower(s.name)} ca. hver ${Math.round(hver)}. dag — neste gang blir om ca. ${om} ${om === 1 ? 'dag' : 'dager'}, men tilbudet går ut ${fmtDato(o.valid_to)}. `
        + `Kjøp ${qty} nå og spar ca. ${kr(saving)}${suit === 'high' ? ' — varen tåler å ligge' : ''}.`,
    });
  }
  return ut.sort((a, b) => b.saving - a.saving).slice(0, limit);
}
