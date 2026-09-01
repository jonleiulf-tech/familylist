// Edge Function: åpne Stripes kundeportal.
//
// POST { household_id }  →  { url }
//
// Der kan folk bytte kort, se kvitteringene sine og si opp selv. Det er
// verdt en hel del: uten den blir hver eneste oppsigelse en melding på
// Messenger som noen må svare på manuelt.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { cors, json, stripeClient } from '../_shared/stripe.ts';

const APP_URL = Deno.env.get('APP_URL') ?? 'https://plukkelisten.no/app/';

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin') ?? '*';
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
  if (req.method !== 'POST') return json({ error: 'Kun POST er støttet.' }, 405, origin);

  const stripe = stripeClient();
  if (!stripe) return json({ error: 'Betaling er ikke satt opp ennå.', code: 'NO_STRIPE' }, 501, origin);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return json({ error: 'Ikke innlogget.' }, 401, origin);

  let body: { household_id?: string };
  try { body = await req.json(); }
  catch { return json({ error: 'Ugyldig forespørsel.' }, 400, origin); }

  const householdId = String(body.household_id ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(householdId)) {
    return json({ error: 'Mangler hvilken liste det gjelder.' }, 400, origin);
  }

  const { data: membership } = await supabase
    .from('members').select('role')
    .eq('household_id', householdId).eq('user_id', user.id).maybeSingle();
  if (membership?.role !== 'owner') {
    return json({ error: 'Bare den som eier listen kan endre betalingen.' }, 403, origin);
  }

  // Raden leses med brukerens JWT, så RLS bekrefter medlemskapet en gang til.
  const { data: sub } = await supabase
    .from('subscriptions').select('stripe_customer_id')
    .eq('household_id', householdId).maybeSingle();
  if (!sub?.stripe_customer_id) {
    return json({ error: 'Dere har ikke noe abonnement å administrere ennå.',
                  code: 'NO_CUSTOMER' }, 404, origin);
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: APP_URL,
      locale: 'nb',
    });
    return json({ url: session.url }, 200, origin);
  } catch (e) {
    console.error('stripe-portal', e);
    return json({ error: 'Kunne ikke åpne kundeportalen.',
                  hint: String((e as Error)?.message ?? e).slice(0, 200) }, 502, origin);
  }
});
