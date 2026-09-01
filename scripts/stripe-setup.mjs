#!/usr/bin/env node
/**
 * Setter opp Stripe for Plukkelisten i ett kall.
 *
 * Lager produktet, prisen, kupongen, kampanjekoden og kundeportalen —
 * nøyaktig slik appen forventer dem. Kjøres fra din egen maskin, så den
 * hemmelige nøkkelen aldri forlater den.
 *
 *   $env:STRIPE_SECRET_KEY = "sk_test_..."
 *   node scripts/stripe-setup.mjs
 *
 * Skriptet er forsiktig: finnes noe fra før, gjenbrukes det i stedet for
 * at du ender opp med tre produkter som heter det samme. Kjør det gjerne
 * flere ganger.
 *
 * Flagg:
 *   --product "Navn"   produktnavnet i Stripe (standard «Plukkelisten»)
 *   --price 1500       prisen i øre (standard 1500 = 15 kr)
 *   --code VENNER      kampanjekoden
 *   --months 1         hvor mange måneder koden gir gratis
 *   --dry              vis hva som ville blitt gjort, uten å gjøre det
 */

const API = process.env.STRIPE_API_BASE ?? 'https://api.stripe.com';
const KEY = process.env.STRIPE_SECRET_KEY ?? '';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const DRY = process.argv.includes('--dry');

const PRICE_ORE = Number(arg('price', '1500'));
const CODE = String(arg('code', 'VENNER')).toUpperCase();
const MONTHS = Number(arg('months', '1'));
const PRODUCT_NAME = String(arg('product', 'Plukkelisten'));

/**
 * Stripe tar imot skjemadata, ikke JSON, og nøstede felter skrives
 * som «recurring[interval]». Denne flater ut objektet på den formen.
 */
export function formEncode(obj, prefix = '') {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object' && !Array.isArray(v)) out.push(formEncode(v, key));
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out.filter(Boolean).join('&');
}

async function stripe(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': '2024-06-20',
    },
    body: body ? formEncode(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${json?.error?.message ?? 'ukjent feil'}`);
  }
  return json;
}

const log = (icon, text) => console.log(`${icon} ${text}`);

async function main() {
  if (!KEY) {
    console.error('Mangler STRIPE_SECRET_KEY. Sett den først:');
    console.error('  $env:STRIPE_SECRET_KEY = "sk_test_..."');
    process.exit(1);
  }
  if (!KEY.startsWith('sk_')) {
    console.error('Nøkkelen ser ikke ut som en hemmelig nøkkel (den skal starte med sk_).');
    console.error('Den som starter med pk_ er den offentlige — den er ikke nok her.');
    process.exit(1);
  }

  const live = KEY.startsWith('sk_live');
  console.log(`\nPlukkelisten → Stripe (${live ? 'EKTE PENGER' : 'testmodus'})\n`);
  if (DRY) log('👀', 'Tørrkjøring — ingenting blir opprettet.\n');

  // --- 1) Produktet --------------------------------------------------------
  const products = await stripe('GET', '/v1/products?limit=100&active=true');
  const sameName = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  let product = (products.data ?? []).find((p) => sameName(p.name, PRODUCT_NAME));
  if (product) log('↩️ ', `Produktet finnes fra før: ${product.id}`);
  else if (DRY) log('•', `Ville laget produktet «${PRODUCT_NAME}»`);
  else {
    product = await stripe('POST', '/v1/products', {
      name: PRODUCT_NAME,
      description: 'Delt handleliste, middagsplan og tilbud for husholdningen.',
    });
    log('✅', `Produkt opprettet: ${product.id}`);
  }

  // --- 2) Prisen -----------------------------------------------------------
  let price = null;
  if (product) {
    const prices = await stripe('GET', `/v1/prices?product=${product.id}&limit=100&active=true`);
    price = (prices.data ?? []).find((p) =>
      p.unit_amount === PRICE_ORE && p.currency === 'nok' && p.recurring?.interval === 'month');
  }
  if (price) log('↩️ ', `Prisen finnes fra før: ${price.id}`);
  else if (DRY) log('•', `Ville laget prisen ${PRICE_ORE / 100} kr per måned`);
  else {
    price = await stripe('POST', '/v1/prices', {
      product: product.id,
      unit_amount: PRICE_ORE,
      currency: 'nok',
      recurring: { interval: 'month' },
    });
    log('✅', `Pris opprettet: ${price.id}`);
  }

  // --- 3) Kupongen: 100 % i én måned --------------------------------------
  const couponName = `${MONTHS} md gratis`;
  const coupons = await stripe('GET', '/v1/coupons?limit=100');
  let coupon = (coupons.data ?? []).find((c) =>
    c.percent_off === 100 && c.duration === 'repeating' && c.duration_in_months === MONTHS);
  if (coupon) log('↩️ ', `Kupongen finnes fra før: ${coupon.id}`);
  else if (DRY) log('•', `Ville laget kupongen «${couponName}»`);
  else {
    coupon = await stripe('POST', '/v1/coupons', {
      percent_off: 100, duration: 'repeating', duration_in_months: MONTHS, name: couponName,
    });
    log('✅', `Kupong opprettet: ${coupon.id}`);
  }

  // --- 4) Kampanjekoden ----------------------------------------------------
  const codes = await stripe('GET', `/v1/promotion_codes?code=${encodeURIComponent(CODE)}&limit=1`);
  const existingCode = (codes.data ?? [])[0];
  if (existingCode) log('↩️ ', `Koden «${CODE}» finnes fra før: ${existingCode.id}`);
  else if (DRY) log('•', `Ville laget kampanjekoden «${CODE}»`);
  else {
    const promo = await stripe('POST', '/v1/promotion_codes', { coupon: coupon.id, code: CODE });
    log('✅', `Kampanjekode opprettet: ${CODE} (${promo.id})`);
  }

  // --- 5) Kundeportalen ----------------------------------------------------
  // Uten den må hver eneste oppsigelse gå gjennom deg på Messenger.
  const configs = await stripe('GET', '/v1/billing_portal/configurations?limit=10');
  const existingPortal = (configs.data ?? []).find((c) => c.is_default);
  const portalSettings = {
    // Lenkene til vilkår og personvern legges inn når de sidene finnes.
    // Stripe kontrollerer at de peker et sted, så en 404 her ville
    // stoppet hele oppsettet.
    business_profile: { headline: 'Plukkelisten — abonnementet ditt' },
    features: {
      customer_update: { enabled: true, allowed_updates: { 0: 'email', 1: 'address' } },
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },
      subscription_cancel: { enabled: true, mode: 'at_period_end' },
    },
  };
  if (DRY) log('•', 'Ville satt opp kundeportalen (bytte kort, kvitteringer, si opp)');
  else if (existingPortal) {
    await stripe('POST', `/v1/billing_portal/configurations/${existingPortal.id}`, portalSettings);
    log('✅', `Kundeportalen oppdatert: ${existingPortal.id}`);
  } else {
    const portal = await stripe('POST', '/v1/billing_portal/configurations', portalSettings);
    log('✅', `Kundeportal opprettet: ${portal.id}`);
  }

  // --- Oppsummering --------------------------------------------------------
  if (DRY) { console.log('\nTørrkjøring ferdig. Kjør uten --dry for å gjøre det på ekte.\n'); return; }

  console.log(`
────────────────────────────────────────────────────────
Ferdig. Sett disse i PowerShell:

  supabase secrets set STRIPE_PRICE_ID=${price.id}
  supabase secrets set APP_URL=https://plukkelisten.no/app/

Nøkkelen du alt har:

  supabase secrets set STRIPE_SECRET_KEY=<den samme sk_-nøkkelen>

Så gjenstår bare webhooken — den må lages i dashbordet, fordi
Stripe bare viser signaturnøkkelen én gang. Se SETUP.md, punkt 11.4.

Kampanjekoden er «${CODE}» og gir ${MONTHS} måned${MONTHS === 1 ? '' : 'er'} gratis
på toppen av de 30 dagene alle får.
────────────────────────────────────────────────────────
`);
}

// Lar seg importere av testen uten å kjøre.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('\n❌', e.message, '\n'); process.exit(1); });
}
