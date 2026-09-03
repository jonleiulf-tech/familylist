import { useEffect, useState } from 'react';
import { CreditCard, ExternalLink, ShieldCheck, Gift, Sparkles } from 'lucide-react';
import { Dialog } from './Dialog.jsx';
import { supabase } from '../lib/supabase.js';
import { billingState, PRICE_LABEL, TRIAL_DAYS, oversettStripe } from '../lib/billing.js';

/**
 * «Abonnement» — hele forholdet til Stripe, samlet ett sted.
 *
 * Tonen er bevisst rolig. Ingen nedtelling med rødt, ingen «siste sjanse».
 * Det verste som kan skje er at man ikke får legge til nye varer, og det
 * sier vi rett ut i stedet for å true med det.
 */
export function SubscriptionDialog({ list, isOwner, onClose, toast }) {
  const [sub, setSub] = useState(undefined);   // undefined = henter ennå
  const [busy, setBusy] = useState(null);      // 'kjøp' | 'portal'
  const [error, setError] = useState(null);
  const [detalj, setDetalj] = useState(null);   // Stripes egen melding

  useEffect(() => {
    let active = true;
    if (!list?.id) { setSub(null); return undefined; }
    supabase.from('subscriptions').select('*').eq('household_id', list.id).maybeSingle()
      .then(({ data }) => { if (active) setSub(data ?? null); });
    return () => { active = false; };
  }, [list?.id]);

  const state = sub === undefined ? null : billingState(sub);

  /** Send brukeren til Stripe. Vi tar aldri imot kortnummer selv. */
  const go = async (fn, which) => {
    setBusy(which);
    setError(null);
    setDetalj(null);
    try {
      const { data, error: err } = await supabase.functions.invoke(fn, {
        body: { household_id: list.id },
      });
      if (err || !data?.url) {
        // Ved annet enn 2xx kaster supabase-klienten, og `data` er null.
        // Den norske setningen ligger da i kroppen, som må leses ut av
        // feilen — ellers får brukeren «Edge Function returned a non-2xx
        // status code» midt i en ellers norsk app.
        let body = data?.error ? data : null;
        if (!body) {
          try { body = (await err?.context?.json?.()) ?? null; } catch { /* behold */ }
        }
        // `hint` er Stripes egen melding, og den ble kastet bort.
        //
        // «Kunne ikke åpne betalingssiden.» alene er ubrukelig — for
        // brukeren OG for den som skal fikse det. Feilen kan være en
        // pris-ID som ikke finnes, en testnøkkel mot en live-pris, eller
        // et utløpt kort hos oss. Alle tre ser like ut, og alle tre har
        // ulik løsning.
        setError(oversettStripe(body?.error, body?.hint)
          ?? 'Kunne ikke åpne betalingssiden. Prøv igjen om litt.');
        setDetalj(body?.hint ?? null);
        return;
      }
      window.location.href = data.url;
    } catch (e) {
      setError(e?.message ?? 'Noe gikk galt.');
    } finally {
      setBusy(null);
    }
  };

  const tone = state?.tone;
  const bg = tone === 'stengt' ? 'var(--color-accent-100, #fdecea)'
    : tone === 'snart' ? 'var(--color-honey-100)'
    : 'var(--color-surface)';
  const border = tone === 'stengt' ? 'var(--color-accent)'
    : tone === 'snart' ? 'var(--color-honey-200)'
    : 'var(--color-divider)';

  return (
    <Dialog title="Abonnement" subtitle={list?.name} onClose={onClose}>
      {sub === undefined && <p className="text-muted" style={{ fontSize: 13 }}>Henter …</p>}

      {state && (
        <>
          <div style={{
            border: `1px solid ${border}`, background: bg,
            borderRadius: 'var(--radius)', padding: '14px 16px',
          }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{state.title}</div>
            {state.detail && (
              <p className="text-muted" style={{ fontSize: 13, lineHeight: 1.5, margin: '6px 0 0' }}>
                {state.detail}
              </p>
            )}
          </div>

          {error && (
            <>
              <p style={{ color: 'var(--color-accent)', fontSize: 13, margin: '12px 0 0' }}>{error}</p>
              {detalj && (
                // Den tekniske detaljen står under, dempet. En bruker
                // trenger den ikke, men den som skal hjelpe trenger den —
                // og da er den bedre her enn bare i en loggfil ingen ser.
                <p className="text-muted" style={{ fontSize: 11.5, margin: '4px 0 0', lineHeight: 1.4 }}>
                  Teknisk: {detalj}
                </p>
              )}
            </>
          )}

          {!isOwner && (state.canSubscribe || state.manage) && (
            <p className="text-muted" style={{ fontSize: 12.5, lineHeight: 1.5, margin: '12px 0 0' }}>
              Det er den som eier listen som styrer abonnementet. Alle andre
              i husholdningen er med på kjøpet.
            </p>
          )}

          {isOwner && state.canSubscribe && (
            <button
              type="button"
              className="btn btn-primary btn-block"
              style={{ marginTop: 'var(--space-3)' }}
              disabled={busy !== null}
              onClick={() => go('stripe-checkout', 'kjøp')}
            >
              <CreditCard size={15} />
              {busy === 'kjøp' ? 'Åpner …' : `Start abonnement — ${PRICE_LABEL} i måneden`}
            </button>
          )}

          {isOwner && state.manage && (
            <button
              type="button"
              className="btn btn-block"
              style={{ marginTop: 'var(--space-3)' }}
              disabled={busy !== null}
              onClick={() => go('stripe-portal', 'portal')}
            >
              <ExternalLink size={15} />
              {busy === 'portal' ? 'Åpner …' : 'Bytt kort, se kvitteringer eller si opp'}
            </button>
          )}

          <div style={{ marginTop: 'var(--space-4)' }}>
            <div className="card-kicker" style={{ marginBottom: 6 }}>Det du bør vite</div>
            {[
              { icon: <Sparkles size={14} />, text: `Alle får ${TRIAL_DAYS} dager gratis. Har du en kampanjekode, limes den inn i betalingsvinduet — da får du en måned til.` },
              { icon: <ShieldCheck size={14} />, text: 'Kortnummeret ditt går rett til Stripe og er aldri innom Plukkelisten.' },
              { icon: <Gift size={14} />, text: '150 Plukkepoeng gir én måned gratis. Poengene finner du under «Plukkepoeng».' },
              { icon: <CreditCard size={14} />, text: 'Ingen bindingstid. Sier du opp, har dere appen ut perioden dere har betalt for.' },
            ].map((r) => (
              <div key={r.text} className="row" style={{ gap: 9, padding: '6px 0', alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--color-text-muted)', marginTop: 2, flexShrink: 0 }}>{r.icon}</span>
                <span style={{ fontSize: 12.5, lineHeight: 1.5 }}>{r.text}</span>
              </div>
            ))}
          </div>

          <p className="text-muted" style={{ fontSize: 11.5, lineHeight: 1.5, marginTop: 'var(--space-3)' }}>
            Går abonnementet ut, blir listene deres liggende. Dere kan lese
            dem og krysse av som før — det er bare å legge til nye ting som
            stopper til dere er i gang igjen.
          </p>
        </>
      )}
    </Dialog>
  );
}
