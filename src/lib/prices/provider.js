// PriceProvider — ett grensesnitt, flere kilder (prisintelligens §22–23).
//
// Prisene i appen kommer fra fire steder som til nå har hatt hver sin form:
// egne kvitteringer (price_observations), Kassalapp (Edge Function),
// ukens tilbud (offers) og det brukeren har satt for hånd. Her får de én
// form, slik at estimatet, tilbudsvurderingen og — senere — handlekurv-
// optimalisereren kan spørre «hva koster X hos Y» uten å vite hvor svaret
// kommer fra.
//
// En ekstern leverandør (SeSum eller andre) kan legges til som én
// leverandør til, BARE med autorisert tilgang og dokumentasjon. Aldri ved
// å hente fra private endepunkter.
//
// Alle leverandører svarer med PriceQuote:
//   { price, unitPrice, unit, storeCode, observedAt, source, confidence,
//     ean, productId, isOffer, reference }
//
// Ingen av dem kaster. Uten svar returneres null eller [].

import { lower, trimmed } from '../text.js';
import { STORE_CODES } from '../offers.js';

/** Kildene i den rekkefølgen §23 vil ha dem for et NÅVÆRENDE anslag. */
export const SOURCE_RANK = {
  kassalapp: 1,        // ferskt API-oppslag
  weekly_offer: 2,     // tilbud som gjelder nå
  offer: 2,
  receipt: 3,          // egen kvittering
  manual: 4,
  imported_receipt: 5,
  estimate: 6,
  external: 6,
};

const num = (v) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Gjør en rad fra hvilken som helst kilde til en PriceQuote. */
export function quote(raw) {
  // `o = {}` som standardverdi fanger undefined, men ikke null — og null er
  // det en tom rad fra basen faktisk er. Da kastet o.price her.
  const o = raw && typeof raw === 'object' ? raw : {};
  const price = num(o.price);
  if (price === null) return null;
  return {
    price,
    unitPrice: num(o.unit_price ?? o.unitPrice),
    unit: o.unit ?? o.unit_price_unit ?? null,
    storeCode: o.store_code ?? o.storeCode ?? null,
    observedAt: o.observed_at ?? o.observedAt ?? null,
    source: o.source ?? 'estimate',
    confidence: Math.min(1, Math.max(0, Number(o.confidence ?? 0.5) || 0)),
    ean: o.ean ?? null,
    productId: o.product_id ?? o.productId ?? null,
    isOffer: Boolean(o.is_offer ?? o.isOffer ?? false),
    reference: o.reference ?? null,
  };
}

/**
 * Velger prisen et anslag skal bruke, av flere kandidater (§23).
 *
 * Rekkefølgen: fersk API-observasjon fra samme butikk → tilbud som gjelder
 * → egen kvittering → samme kjede → alt annet. Innenfor samme rang vinner
 * den nyeste. Kandidater eldre enn maxAgeDays er ikke «nåværende» og
 * telles ikke — da faller vi heller til neste kilde.
 */
export function pickPrice(candidates, { storeCode = null, maxAgeDays = 120, now = Date.now() } = {}) {
  const list = (Array.isArray(candidates) ? candidates : [])
    .map(quote)
    .filter(Boolean)
    .filter((q) => {
      if (!q.observedAt) return true;
      const t = Date.parse(q.observedAt);
      return !Number.isFinite(t) || now - t <= maxAgeDays * 864e5;
    });
  if (!list.length) return null;
  const rank = (q) => {
    const base = SOURCE_RANK[q.source] ?? 7;
    // Samme butikk teller mer enn samme kilde fra en annen butikk.
    const sameStore = storeCode && q.storeCode && lower(q.storeCode) === lower(storeCode);
    return base - (sameStore ? 0.5 : 0);
  };
  list.sort((a, b) => rank(a) - rank(b)
    || (Date.parse(b.observedAt ?? 0) || 0) - (Date.parse(a.observedAt ?? 0) || 0)
    || b.confidence - a.confidence);
  return list[0];
}

// ---------------------------------------------------------------------
// Leverandørene
// ---------------------------------------------------------------------

/**
 * Egne kvitteringer, via price_history()-RPC-en. Klienter kan ikke lese
 * price_observations direkte; én vare om gangen er den eneste veien.
 */
export function createReceiptProvider() {
  async function getPriceHistory(itemName, { days = 120 } = {}) {
    const name = trimmed(itemName);
    if (!name) return [];
    try {
      const { supabase } = await import('../supabase.js');
      const { data, error } = await supabase.rpc('price_history', { p_item: name, p_days: days });
      if (error || !Array.isArray(data)) return [];
      return data.map(quote).filter(Boolean);
    } catch { return []; }
  }
  return {
    id: 'receipt',
    searchProducts: async () => [],
    getPricesByEAN: async (ean) => {
      // Historikken er per varenavn; EAN-oppslag går via produktet senere.
      void ean; return [];
    },
    getPriceHistory,
    getCurrentPrice: async (itemName, storeCode = null) =>
      pickPrice(await getPriceHistory(itemName), { storeCode }),
  };
}

/** Kassalapp, via vår Edge Function. Nøkkelen finnes bare server-side. */
export function createKassalappProvider() {
  async function searchProducts(query, { store = '', size = 10, expectedPrice = null } = {}) {
    try {
      const { searchProducts: søk } = await import('../kassal.js');
      const { products } = await søk(query, store, size, expectedPrice);
      return Array.isArray(products) ? products : [];
    } catch { return []; }
  }
  const toQuote = (p) => quote({
    price: p?.current_price, unit: p?.weight_unit ?? null, store_code: p?.store_code ?? null,
    observed_at: new Date().toISOString(), source: 'kassalapp', confidence: 0.9,
    ean: p?.ean ?? null, reference: p?.kassal_product_id ?? null,
  });
  return {
    id: 'kassalapp',
    searchProducts,
    getCurrentPrice: async (itemName, storeCode = null) => {
      const hits = await searchProducts(itemName, { store: storeCode ?? '' , size: 5 });
      return pickPrice(hits.map(toQuote).filter(Boolean), { storeCode });
    },
    getPricesByEAN: async (ean) => {
      const e = trimmed(ean);
      if (!/^\d{8,14}$/.test(e)) return [];
      return (await searchProducts(e, { size: 5 })).filter((p) => String(p?.ean ?? '') === e).map(toQuote).filter(Boolean);
    },
    getPriceHistory: async () => [],
  };
}

/** Ukens tilbud — en liste vi alt har i minnet. Ren, testbar uten nett. */
export function createOfferProvider(offers = []) {
  const rows = Array.isArray(offers) ? offers : [];
  const today = new Date().toISOString().slice(0, 10);
  const gjelder = (o) => (!o?.valid_to || String(o.valid_to) >= today) && (!o?.valid_from || String(o.valid_from) <= today);
  const forItem = (itemName) => rows.filter((o) => gjelder(o) && lower(o?.match_name) === lower(itemName).trim());
  // `o?.` overalt: offers-lista kan inneholde null-rader fra en halvferdig
  // henting, og én slik rad skal ikke ta ned hele prisoppslaget.
  const toQuote = (o) => quote({
    price: o?.price, unit_price: o?.unit_price, unit: o?.unit, store_code: o?.store_code,
    observed_at: o?.valid_from ?? o?.created_at ?? null, source: 'weekly_offer', confidence: 0.8,
    is_offer: true, reference: o?.id ?? null,
  });
  return {
    id: 'weekly_offer',
    searchProducts: async (q) => rows.filter((o) => lower(o?.product_name).includes(lower(q).trim())),
    getCurrentPrice: async (itemName, storeCode = null) =>
      pickPrice(forItem(itemName).map(toQuote).filter(Boolean), { storeCode }),
    getPricesByEAN: async () => [],
    getPriceHistory: async (itemName) => forItem(itemName).map(toQuote).filter(Boolean),
  };
}

/** Det brukeren har satt for hånd på egne varer. */
export function createManualProvider(items = []) {
  const rows = (Array.isArray(items) ? items : []).filter((i) => i?.price_source === 'manual' && num(i?.price));
  return {
    id: 'manual',
    searchProducts: async () => [],
    getCurrentPrice: async (itemName, storeCode = null) => pickPrice(
      rows.filter((i) => lower(i.name) === lower(itemName).trim())
        .map((i) => quote({ price: i.price, unit: i.unit, store_code: i.store, source: 'manual', confidence: 0.7 })),
      { storeCode },
    ),
    getPricesByEAN: async () => [],
    getPriceHistory: async () => [],
  };
}

/**
 * Spør alle leverandørene og velger etter §23. Én feilende leverandør
 * stopper ikke de andre.
 */
export async function bestCurrentPrice(providers, itemName, storeCode = null) {
  const svar = await Promise.all((providers ?? []).map((p) => p.getCurrentPrice(itemName, storeCode).catch(() => null)));
  return pickPrice(svar.filter(Boolean), { storeCode });
}

// ---------------------------------------------------------------------
// Skriving: et valgt Kassalapp-produkt blir en observasjon
// ---------------------------------------------------------------------

/**
 * Kalles når brukeren velger et Kassalapp-produkt. Prisen vi nettopp så
 * lagres anonymt med ean og produkt-id, slik at Product-nivået fylles og
 * neste anslag har en fersk API-observasjon å bygge på (§23, rang 1).
 *
 * Ikke en kjøpslinje — et oppslag er ikke et kjøp. Fyr-og-glem: feiler
 * det, er varen likevel lagt til i lista.
 */
/** «MENY_NO» er en kode; «Meny»/«MENY» slås opp; alt annet er null. */
export function storeCodeFrom(value) {
  const t = trimmed(value);
  if (!t) return null;
  if (Object.values(STORE_CODES).includes(t)) return t;
  const navn = Object.keys(STORE_CODES).find((k) => lower(k) === lower(t));
  if (navn) return STORE_CODES[navn];
  // En kode vi ikke kjenner fra før (COOP_MEGA): understrek og store bokstaver.
  return /^[A-Z0-9]+_[A-Z0-9_]+$/.test(t) ? t : null;
}

export async function recordKassalappPrice(product, itemName) {
  const price = num(product?.current_price);
  const name = trimmed(itemName);
  if (!price || !name) return false;
  try {
    const { supabase } = await import('../supabase.js');
    const { error } = await supabase.rpc('record_price_observations', {
      p_rows: [{
        item_name: name.slice(0, 120),
        // kassal-products sender koden når Kassalapp har en (MENY_NO), ellers
        // navnet — da slås navnet opp. Uten kode har observasjonen ingen kjede.
        store_code: storeCodeFrom(product?.store_code) ?? storeCodeFrom(product?.store),
        price,
        // Ett oppslag = én pakke. qty/unit er «mengde kjøpt», ikke
        // pakningen — den sendes under (package_qty/package_unit). Med
        // weight_unit her ble en 500-grams ost «1 g for 89 kr».
        qty: 1,
        unit: 'stk',
        unit_price: num(product?.current_unit_price ?? product?.unit_price),
        observed_at: new Date().toISOString(),
        source: 'kassalapp',
        confidence: 0.9,
        ean: /^\d{8,14}$/.test(String(product?.ean ?? '')) ? String(product.ean) : null,
        kassal_product_id: Number.isFinite(Number(product?.kassal_product_id)) ? Number(product.kassal_product_id) : null,
        product_name: product?.name ?? null,
        brand: product?.brand ?? null,
        package_qty: num(product?.weight),
        package_unit: product?.weight_unit ?? null,
      }],
    });
    return !error;
  } catch { return false; }
}
