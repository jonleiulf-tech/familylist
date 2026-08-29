// Edge Function: Kassalapp-proxy.
//
// GET /kassal-products?search=&store=&size=
//   -> https://kassal.app/api/v1/products?search=&store=&unique=1&size=
//
// KASSALAPP_API_KEY leses KUN her, som Supabase-secret. Den skal aldri sendes
// til klienten og aldri havne i logger eller feilmeldinger.
//
// Deploy:  supabase functions deploy kassal-products
// Secret:  supabase secrets set KASSALAPP_API_KEY=<nøkkel>

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { rankProducts } from '../_shared/kassalRank.ts';

const KASSAL_BASE = 'https://kassal.app/api/v1';

// Kun disse butikkodene sendes videre. Hindrer at vilkårlig klientinput
// blir med i URL-en mot Kassalapp.
const STORE_CODES = new Set([
  'COOP_EXTRA', 'KIWI', 'REMA_1000', 'MENY_NO', 'COOP_OBS', 'SPAR_NO', 'JOKER',
]);

const cors = (origin: string) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Vary': 'Origin',
});

const json = (body: unknown, status: number, origin: string) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), 'Content-Type': 'application/json; charset=utf-8' },
  });

/** Kassalapp-produkt -> det forenklede formatet frontend bruker. */
// deno-lint-ignore no-explicit-any
function mapProduct(p: any, fallbackStore: string) {
  const price = p?.current_price && typeof p.current_price === 'object'
    ? p.current_price.price
    : p?.current_price;
  const unit = p?.current_unit_price && typeof p.current_unit_price === 'object'
    ? p.current_unit_price.price
    : p?.current_unit_price;
  return {
    kassal_product_id: p?.id ?? null,
    name: p?.name ?? '',
    brand: p?.brand ?? '',
    vendor: p?.vendor ?? '',
    ean: p?.ean ?? '',
    category: Array.isArray(p?.category)
      // deno-lint-ignore no-explicit-any
      ? p.category.map((c: any) => c?.name).filter(Boolean).join(' / ')
      : (p?.category ?? ''),
    store: p?.store?.code ?? p?.store?.name ?? fallbackStore,
    current_price: typeof price === 'number' ? price : 0,
    current_unit_price: typeof unit === 'number' ? unit : 0,
    weight: p?.weight ?? 0,
    weight_unit: p?.weight_unit ?? '',
    image: p?.image ?? null,
    url: p?.url ?? '',
    last_checked: p?.current_price?.date ?? p?.updated_at ?? new Date().toISOString(),
  };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin') ?? '*';

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
  if (req.method !== 'GET') {
    return json({ error: 'Kun GET er støttet.' }, 405, origin);
  }

  // --- Krev innlogget bruker -------------------------------------------------
  // Uten dette ville hvem som helst kunne bruke vår Kassalapp-kvote.
  const authHeader = req.headers.get('Authorization') ?? '';
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return json({ error: 'Ikke innlogget.' }, 401, origin);
  }

  // --- Nøkkel ----------------------------------------------------------------
  const apiKey = Deno.env.get('KASSALAPP_API_KEY');
  if (!apiKey) {
    // Teksten er fra handoff-spesifikasjonen. Selve nøkkelen nevnes aldri.
    return json({ error: 'KASSALAPP_API_KEY mangler i miljøvariabler.' }, 500, origin);
  }

  // --- Parametre -------------------------------------------------------------
  const url = new URL(req.url);
  const search = (url.searchParams.get('search') ?? '').trim();
  if (!search) return json({ products: [] }, 200, origin);

  const storeParam = (url.searchParams.get('store') ?? '').toUpperCase();
  // Butikkfilter gir ofte 0 treff hos Kassalapp — «alle butikker» er default.
  const store = STORE_CODES.has(storeParam) ? storeParam : '';

  // Familiens snittpris for varen, brukt til å skille «melk» fra
  // «kondensmelk» — produktet nær deres vanlige pris er som regel det de mener.
  const expectedRaw = Number(url.searchParams.get('expected') ?? '');
  const expectedPrice = Number.isFinite(expectedRaw) && expectedRaw > 0 ? expectedRaw : undefined;

  const sizeRaw = Number(url.searchParams.get('size') ?? '10');
  const size = Number.isFinite(sizeRaw) ? Math.min(50, Math.max(1, Math.trunc(sizeRaw))) : 10;

  // Hent bredt og reranger lokalt, ellers drukner gode treff i støy.
  const fetchSize = Math.min(100, Math.max(60, size * 3));
  const target = new URL(`${KASSAL_BASE}/products`);
  target.searchParams.set('search', search);
  if (store) target.searchParams.set('store', store);
  target.searchParams.set('unique', '1');   // NB: '1', ikke 'true'
  target.searchParams.set('size', String(fetchSize));

  // --- Kall Kassalapp --------------------------------------------------------
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 8000);
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal: ctrl.signal,
    });
  } catch (_e) {
    // Fanger både timeout og nettverksfeil. Detaljer utelates bevisst.
    return json({ error: 'Kunne ikke hente priser akkurat nå.' }, 502, origin);
  } finally {
    clearTimeout(timeout);
  }

  if (!upstream.ok) {
    // Logg statuskoden, aldri responsteksten — den kan gjenta URL-en med nøkkel.
    console.error(`Kassalapp svarte ${upstream.status}`);
    if (upstream.status === 429) {
      return json({ error: 'For mange forespørsler mot Kassalapp. Prøv igjen om litt.' }, 429, origin);
    }
    return json({ error: 'Kunne ikke hente priser akkurat nå.' }, 502, origin);
  }

  const body = await upstream.json().catch(() => null);
  const raw = Array.isArray(body?.data) ? body.data : [];

  const mapped = raw.map((p: unknown) => mapProduct(p, store));
  const products = rankProducts(search, mapped, { expectedPrice, size });

  return new Response(JSON.stringify({ products }), {
    status: 200,
    headers: {
      ...cors(origin),
      'Content-Type': 'application/json; charset=utf-8',
      // Priser endres sjelden i løpet av en handletur.
      'Cache-Control': 'private, max-age=300',
    },
  });
});
