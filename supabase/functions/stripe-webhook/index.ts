// Edge Function: Stripes beskjeder om hva som faktisk har skjedd.
//
// Stripe eier sannheten om hvem som har betalt. subscriptions-tabellen er
// bare en kopi, og det er denne funksjonen som holder kopien à jour.
//
// Kalles av Stripe, ikke av appen: verify_jwt = false i config.toml.
// Til gjengjeld MÅ signaturen kontrolleres — uten den kan hvem som helst
// som kjenner adressen gi seg selv gratis abonnement.
//
//   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...

import { createClient } from 'jsr:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17.7.0';
import { stripeClient, osloDate, periodEnd, mapStatus } from '../_shared/stripe.ts';

const db = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

/** Statuser vi aldri overskriver: gratis er gratis, uansett hva Stripe mener. */
const PROTECTED = new Set(['grunnlegger']);

/**
 * Finn husholdningen et Stripe-objekt hører til.
 * Metadata først, deretter kunde-ID-en — begge er satt av oss.
 */
async function householdFor(sub: Record<string, any>): Promise<string | null> {
  const fromMeta = sub?.metadata?.household_id;
  if (fromMeta) return String(fromMeta);
  const customer = typeof sub?.customer === 'string' ? sub.customer : sub?.customer?.id;
  if (!customer) return null;
  const { data } = await db.from('subscriptions')
    .select('household_id').eq('stripe_customer_id', customer).maybeSingle();
  return data?.household_id ?? null;
}

/** Skriv abonnementet inn i vår egen tabell. */
async function saveSubscription(sub: Record<string, any>) {
  const householdId = await householdFor(sub);
  if (!householdId) { console.warn('webhook: fant ingen husholdning for', sub?.id); return; }

  const { data: current } = await db.from('subscriptions')
    .select('status').eq('household_id', householdId).maybeSingle();
  if (current && PROTECTED.has(current.status)) return;

  const status = mapStatus(String(sub.status ?? ''));
  const until = osloDate(periodEnd(sub));
  const price = sub?.items?.data?.[0]?.price?.unit_amount ?? null;
  const customer = typeof sub?.customer === 'string' ? sub.customer : sub?.customer?.id;

  const row: Record<string, unknown> = {
    household_id: householdId,
    status,
    stripe_subscription_id: sub.id,
    cancel_at_period_end: Boolean(sub.cancel_at_period_end),
    last_event_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (until) row.paid_until = until;
  if (price) row.price_ore = price;
  if (customer) row.stripe_customer_id = customer;

  // paid_until er not null, så en helt ny rad må ha en dato uansett.
  if (!current && !row.paid_until) row.paid_until = osloDate(Math.floor(Date.now() / 1000));

  const { error } = await db.from('subscriptions').upsert(row, { onConflict: 'household_id' });
  if (error) console.error('webhook: kunne ikke lagre', error.message);
}

/**
 * Påminnelsen tre dager før første trekk.
 *
 * Prøveperioden er lang — opptil to måneder med kampanjekoden — og ingen
 * husker hva de meldte seg på for åtte uker siden. En uventet trekk fra
 * en venn er verre enn ingen trekk i det hele tatt.
 */
async function sendTrialReminder(stripe: Stripe, sub: Record<string, any>) {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) return;

  const householdId = await householdFor(sub);
  if (!householdId) return;

  // Én påminnelse per abonnement, selv om Stripe skulle sende to.
  const { data: row } = await db.from('subscriptions')
    .select('trial_reminder_at').eq('household_id', householdId).maybeSingle();
  if (row?.trial_reminder_at) return;

  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
  if (!customerId) return;
  const customer = await stripe.customers.retrieve(customerId);
  const email = (customer as Stripe.Customer)?.email;
  if (!email) return;

  const price = sub?.items?.data?.[0]?.price?.unit_amount ?? 1500;
  const kr = (price / 100).toLocaleString('nb-NO');
  const date = osloDate(sub.trial_end) ?? '';
  const pretty = date
    ? new Date(`${date}T12:00:00Z`).toLocaleDateString('nb-NO',
        { day: 'numeric', month: 'long' })
    : 'om noen dager';

  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#e6e4e4;margin:0;padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:#f3f2f2;border:2px solid #201e1d;">
<tr><td style="padding:22px 24px 18px;border-bottom:2px solid #201e1d;">
  <div style="font-family:Archivo,'Helvetica Neue',Arial,sans-serif;font-weight:800;font-size:20px;letter-spacing:-0.015em;color:#201e1d;line-height:1;">PLUKKELISTEN<span style="color:#ec3013;">.</span></div>
</td></tr>
<tr><td style="padding:28px 24px 24px;">
  <h1 style="margin:0 0 14px;font-family:Archivo,'Helvetica Neue',Arial,sans-serif;font-weight:800;font-size:23px;line-height:1.15;color:#201e1d;">Prøveperioden går ut ${pretty}</h1>
  <p style="margin:0 0 18px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:15px;line-height:1.55;color:#201e1d;">
    Hei! Du sa ja til å prøve Plukkelisten, og den perioden nærmer seg slutten.
    ${pretty} trekkes <strong>${kr} kr</strong>, og så går det videre måned for måned.
  </p>
  <p style="margin:0 0 22px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:15px;line-height:1.55;color:#201e1d;">
    Vil du ikke fortsette, sier du opp med to klikk inne i appen — under
    «Min profil» og «Abonnement». Ingen oppsigelsestid, ingen spørsmål.
    Listene deres blir liggende uansett.
  </p>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;">
    <tr><td style="background:#ec3013;">
      <a href="https://plukkelisten.no/app/" style="display:inline-block;padding:14px 22px;font-family:Archivo,'Helvetica Neue',Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">Åpne Plukkelisten</a>
    </td></tr>
  </table>
  <p style="margin:0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;line-height:1.5;color:#625c59;">Takk for at du er med så tidlig. Si gjerne fra hvis noe skurrer — det er sånn appen blir bedre.</p>
</td></tr>
<tr><td style="padding:16px 24px;border-top:2px solid #201e1d;background:#e6e4e4;">
  <p style="margin:0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;color:#625c59;">Plukkelisten · <a href="https://plukkelisten.no" style="color:#ec3013;text-decoration:none;">plukkelisten.no</a></p>
</td></tr>
</table>
</td></tr></table>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Plukkelisten <ikke-svar@plukkelisten.no>',
      to: [email],
      subject: `Prøveperioden går ut ${pretty}`,
      html,
    }),
  });
  if (!res.ok) { console.error('webhook: e-post feilet', await res.text()); return; }

  await db.from('subscriptions')
    .update({ trial_reminder_at: new Date().toISOString() })
    .eq('household_id', householdId);
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Kun POST', { status: 405 });

  const stripe = stripeClient();
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!stripe || !secret) return new Response('Ikke satt opp', { status: 501 });

  const signature = req.headers.get('stripe-signature');
  if (!signature) return new Response('Mangler signatur', { status: 400 });

  // Rå tekst — ikke json(). Signaturen regnes over de nøyaktige bytene.
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      raw, signature, secret, undefined, Stripe.createSubtleCryptoProvider(),
    );
  } catch (e) {
    console.error('webhook: ugyldig signatur', (e as Error)?.message);
    return new Response('Ugyldig signatur', { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const id = typeof session.subscription === 'string'
          ? session.subscription : session.subscription?.id;
        if (id) {
          const sub = await stripe.subscriptions.retrieve(id);
          // client_reference_id er husholdningen vi sendte inn. Den vinner
          // over alt annet — det er den eneste koblingen vi vet er riktig.
          const meta = { ...(sub.metadata ?? {}) };
          if (session.client_reference_id) meta.household_id = session.client_reference_id;
          await saveSubscription({ ...sub, metadata: meta });
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await saveSubscription(event.data.object as unknown as Record<string, any>);
        break;

      case 'customer.subscription.trial_will_end':
        await sendTrialReminder(stripe, event.data.object as unknown as Record<string, any>);
        break;

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const id = typeof (invoice as any).subscription === 'string'
          ? (invoice as any).subscription : (invoice as any).subscription?.id;
        if (id) await saveSubscription(await stripe.subscriptions.retrieve(id));
        break;
      }

      default:
        // Stripe sender mye vi ikke bryr oss om. Det er ikke en feil.
        break;
    }
  } catch (e) {
    // Svarer vi noe annet enn 200 prøver Stripe på nytt i tre døgn. Det
    // er riktig ved midlertidige feil, men her logger vi og går videre —
    // neste hendelse på samme abonnement retter opp kopien uansett.
    console.error('webhook:', event.type, (e as Error)?.message ?? e);
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
});
