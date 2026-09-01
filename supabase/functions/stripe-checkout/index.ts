// Edge Function: start et abonnement.
//
// POST { household_id }  →  { url }   (Stripes betalingsside)
//
// Kortet legges inn med én gang, men trekkes ikke før prøveperioden er
// over. Kampanjekoden legger på en måned til — feltet for den ligger i
// Stripes eget skjema, så vi håndterer ingen koder selv.
//
// Denne funksjonen tar ingen avgjørelser om hvem som får abonnere på
// vegne av hvem: det spørsmålet stilles til databasen med brukerens egen
// JWT, og medlemskapet avgjør.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { cors, json, stripeClient } from '../_shared/stripe.ts';

const APP_URL = Deno.env.get('APP_URL') ?? 'https://plukkelisten.no/app/';

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin') ?? '*';
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
  if (req.method !== 'POST') return json({ error: 'Kun POST er støttet.' }, 405, origin);

  const stripe = stripeClient();
  const priceId = Deno.env.get('STRIPE_PRICE_ID');
  if (!stripe || !priceId) {
    return json({ error: 'Betaling er ikke satt opp ennå.', code: 'NO_STRIPE' }, 501, origin);
  }

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

  // Bare eieren av listen kan binde den til et kort. Spørringen går med
  // brukerens JWT, så RLS avgjør — vi stoler ikke på household_id alene.
  const { data: membership } = await supabase
    .from('members').select('role')
    .eq('household_id', householdId).eq('user_id', user.id).maybeSingle();
  if (!membership) return json({ error: 'Du er ikke medlem av denne listen.' }, 403, origin);
  if (membership.role !== 'owner') {
    return json({ error: 'Bare den som eier listen kan starte abonnementet.' }, 403, origin);
  }

  const { data: sub } = await supabase
    .from('subscriptions').select('*').eq('household_id', householdId).maybeSingle();

  if (sub?.status === 'grunnlegger') {
    return json({ error: 'Dere er grunnleggere — appen er gratis for dere.' }, 409, origin);
  }
  if (sub?.status === 'aktiv' && !sub?.cancel_at_period_end) {
    return json({ error: 'Abonnementet er allerede aktivt.', code: 'ALREADY' }, 409, origin);
  }

  // Resten av prøveperioden følger med inn i abonnementet. Den som tegner
  // på dag tre får de 27 som er igjen — ikke 30 nye. Ellers ville en
  // oppsigelse og en ny tegning gitt gratis måneder i det uendelige.
  const daysLeft = sub?.paid_until
    ? Math.ceil((Date.parse(`${sub.paid_until}T12:00:00Z`) - Date.now()) / 86400000)
    : 0;
  const trialDays = Math.min(60, Math.max(0, daysLeft));

  const listName = (await supabase
    .from('households').select('name').eq('id', householdId).maybeSingle()).data?.name;

  try {
    // Gjenbruk kunden hvis husholdningen har handlet før, slik at
    // betalingshistorikken henger sammen i Stripe.
    let customerId = sub?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        name: listName ?? undefined,
        metadata: { household_id: householdId, app: 'plukkelisten' },
      });
      customerId = customer.id;
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      // Feltet for kampanjekoden. «VENNER» gir én måned til på toppen.
      allow_promotion_codes: true,
      // Kortet lagres nå, selv om det ikke trekkes før prøven er over.
      payment_method_collection: 'always',
      locale: 'nb',
      client_reference_id: householdId,
      subscription_data: {
        ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
        metadata: { household_id: householdId },
      },
      success_url: `${APP_URL}?abonnement=takk`,
      cancel_url: `${APP_URL}?abonnement=avbrutt`,
    });

    // Kunde-ID-en lagres med en gang. Ombestemmer de seg i skjemaet, har
    // vi likevel kunden klar til neste forsøk.
    await supabase.from('subscriptions')
      .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
      .eq('household_id', householdId);

    return json({ url: session.url, trial_days: trialDays }, 200, origin);
  } catch (e) {
    console.error('stripe-checkout', e);
    return json({ error: 'Kunne ikke åpne betalingssiden.',
                  hint: String((e as Error)?.message ?? e).slice(0, 200) }, 502, origin);
  }
});
