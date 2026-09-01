// Fellesdeler for de tre Stripe-funksjonene.
//
// Nøkkelen settes med:
//   supabase secrets set STRIPE_SECRET_KEY=sk_test_...
//   supabase secrets set STRIPE_PRICE_ID=price_...
//   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
// Ingen av dem skal noen gang havne i repoet eller i en .env-fil.

import Stripe from 'npm:stripe@17.7.0';

export const cors = (origin: string) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
});

export const json = (body: unknown, status: number, origin = '*') =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), 'Content-Type': 'application/json; charset=utf-8' },
  });

/** Stripe-klienten. Fetch-basert, som er den eneste varianten som virker i Deno. */
export function stripeClient(): Stripe | null {
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) return null;
  return new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
}

/** Unix-sekunder → «2026-09-01» i norsk tid, slik date-kolonnen vil ha det. */
export function osloDate(unixSeconds: number | null | undefined): string | null {
  if (!unixSeconds) return null;
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo' })
    .format(new Date(unixSeconds * 1000));
}

/**
 * Slutten på inneværende periode.
 *
 * Stripe flyttet current_period_end fra abonnementet ned på linjene i en
 * nyere API-versjon. Vi leser begge steder, så en oppgradering av
 * API-versjonen ikke stille setter paid_until til null.
 */
export function periodEnd(sub: Record<string, any>): number | null {
  return sub?.current_period_end
      ?? sub?.items?.data?.[0]?.current_period_end
      ?? sub?.trial_end
      ?? null;
}

/** Stripes status → vår. Stripe eier sannheten; vi oversetter bare. */
export function mapStatus(stripeStatus: string): string {
  switch (stripeStatus) {
    case 'trialing':            return 'prøve';
    case 'active':              return 'aktiv';
    case 'past_due':
    case 'unpaid':
    case 'incomplete':          return 'forfalt';
    case 'canceled':
    case 'incomplete_expired':  return 'utløpt';
    default:                    return 'forfalt';
  }
}
