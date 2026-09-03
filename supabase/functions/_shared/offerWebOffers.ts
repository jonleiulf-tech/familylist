// AUTOGENERERT — ikke rediger.
// Kilde: src/lib/offers/webOffers.js. Kjør `npm run sync:shared` etter endringer der.
// Testene ligger sammen med kilden.

import { lower } from './text.ts';
// Generisk tilbudsparser for butikkenes egne nettsider.
//
// Samme filosofi som oppskriftshøstingen: vi leser MASKINDATA som allerede
// ligger i siden — aldri skjermbilder, aldri gjetting.
//   1) JSON-LD: Schema.org Product-noder med offers.price
//   2) JSON-blober: Next.js/Nuxt-sider bærer produktlister i innebygd JSON
//      (__NEXT_DATA__, application/json, window.__STATE__ …) — vi dypskanner
//      alt som lar seg JSON-parse etter noder med navn + prisfelt.
//
// Alt normaliseres til lette rader: { product_name, brand?, price,
// original_price?, unit?, unit_price? } — resolveCatalogItem og resten av
// tilbudsløypa tar det derfra.

const PRICE_KEYS = ['price', 'currentPrice', 'current_price', 'salePrice', 'offerPrice', 'pricePerUnit'];
const BEFORE_KEYS = ['originalPrice', 'original_price', 'oldPrice', 'beforePrice', 'ordinaryPrice', 'listPrice', 'regularPrice'];
const NAME_KEYS = ['name', 'title', 'productName', 'product_name', 'displayName'];

const toNumber = (v) => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  // Schema.org: offers kan være objekt med price/lowPrice
  if (v && typeof v === 'object') return toNumber(v.price ?? v.lowPrice);
  return null;
};

/** Rimelighetssjekk: dagligvarepriser, ikke ordrenumre eller øre-tall. */
const sanePrice = (p) => p != null && p >= 1 && p <= 3000;

const firstOf = (node, keys) => {
  for (const k of keys) {
    if (node[k] != null) return node[k];
  }
  return null;
};

function normalizeRow(node) {
  const rawName = firstOf(node, NAME_KEYS);
  if (typeof rawName !== 'string') return null;
  const name = rawName.replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 90) return null;

  const price = toNumber(firstOf(node, PRICE_KEYS) ?? node.offers);
  if (!sanePrice(price)) return null;

  let original = toNumber(firstOf(node, BEFORE_KEYS));
  if (!sanePrice(original) || original <= price) original = null;

  return {
    product_name: name,
    brand: typeof node.brand === 'string' ? node.brand
      : (typeof node.brand?.name === 'string' ? node.brand.name : null),
    price,
    original_price: original,
    unit: typeof node.unit === 'string' ? node.unit : null,
    unit_price: toNumber(node.unitPrice ?? node.unit_price ?? node.comparePrice) ?? null,
  };
}

/** JSON-LD-blokker → Product-rader. */
function fromJsonLd(html, out) {
  const re = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    let doc;
    try { doc = JSON.parse(m[1].trim()); } catch { continue; }
    const stack = [doc];
    const pushAll = (values) => {
      for (let i = values.length - 1; i >= 0; i -= 1) stack.push(values[i]);
    };
    while (stack.length) {
      const node = stack.pop();
      if (!node || typeof node !== 'object') continue;
      if (Array.isArray(node)) { pushAll(node); continue; }
      const type = String(node['@type'] ?? '').toLowerCase();
      if (type === 'product') {
        const row = normalizeRow({ ...node, price: node.offers });
        if (row) out.push(row);
      }
      if (node['@graph']) stack.push(node['@graph']);
      if (node.itemListElement) stack.push(node.itemListElement);
      if (node.item) stack.push(node.item);
    }
  }
}

/** Innebygde JSON-blober (Next.js m.fl.) → produktlignende noder. */
function fromJsonBlobs(html, out) {
  const re = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const body = m[1].trim();
    if (!body || body.length < 50) continue;
    // Ren JSON, eller «window.X = {...};» — prøv å skrelle av tilordningen.
    let raw = body;
    if (!/^[[{]/.test(raw)) {
      const eq = raw.match(/=\s*([[{][\s\S]*)/);
      if (!eq) continue;
      raw = eq[1].replace(/;\s*$/, '');
    }
    if (!/"(?:price|currentPrice|current_price|salePrice|offerPrice)"/.test(raw)) continue;
    let doc;
    try { doc = JSON.parse(raw); } catch { continue; }

    const stack = [[doc, 0]];
    // Barn dyttes BAKLENGS så pop() besøker dem i kildens rekkefølge —
    // tilbudene beholder rekkefølgen fra butikkens side.
    const pushChildren = (values, depth) => {
      for (let i = values.length - 1; i >= 0; i -= 1) stack.push([values[i], depth + 1]);
    };
    while (stack.length) {
      const [node, depth] = stack.pop();
      if (!node || typeof node !== 'object' || depth > 30) continue;
      if (Array.isArray(node)) {
        pushChildren(node, depth);
        continue;
      }
      const hasName = NAME_KEYS.some((k) => typeof node[k] === 'string');
      const hasPrice = PRICE_KEYS.some((k) => node[k] != null);
      if (hasName && hasPrice) {
        const row = normalizeRow(node);
        if (row) out.push(row);
      }
      pushChildren(Object.values(node), depth);
    }
  }
}

/**
 * Hovedinngang: HTML fra en tilbudsside → normaliserte tilbudsrader,
 * deduplisert på navn (laveste pris vinner ved duplikat).
 */
export function extractWebOffers(html) {
  const found = [];
  if (!html) return found;
  fromJsonLd(html, found);
  if (found.length < 3) fromJsonBlobs(html, found);

  const byName = new Map();
  for (const row of found) {
    const key = lower(row.product_name);
    const prev = byName.get(key);
    if (!prev || row.price < prev.price) byName.set(key, row);
  }
  return [...byName.values()];
}
