import { useState } from 'react';
import { Bug, Lightbulb } from 'lucide-react';
import { Dialog } from './Dialog.jsx';
import { supabase } from '../lib/supabase.js';

/**
 * «Meld feil eller ønske» — én dialog for begge deler, tilgjengelig fra
 * headeren på alle faner og fra profilmenyen. Alt lagres i app_feedback
 * og dukker opp i adminpanelet (feil og ønsker hver for seg).
 */
export function FeedbackDialog({ user, householdId, context = 'app', onClose }) {
  const [kind, setKind] = useState('feil');
  const [text, setText] = useState('');
  const [state, setState] = useState(null);   // 'busy' | 'sent' | feilmelding

  const send = async (e) => {
    e.preventDefault();
    setState('busy');
    const { error } = await supabase.from('app_feedback').insert({
      user_id: user.id,
      household_id: householdId ?? null,
      message: text.trim(),
      kind,
      context,
    });
    if (error) { setState(error.message); return; }
    setState('sent');
  };

  return (
    <Dialog
      title="Meld feil eller ønske"
      subtitle="Meldingen går rett til utvikleren av Plukkelisten"
      onClose={onClose}
    >
      {state === 'sent' ? (
        <>
          <p style={{ fontSize: 14, marginTop: 0 }}>
            Takk! {kind === 'feil' ? 'Rapporten' : 'Ønsket'} er sendt. Vi
            svarer på {user?.email} om vi trenger mer informasjon.
          </p>
          <button type="button" className="btn btn-primary btn-block" onClick={onClose}>
            Lukk
          </button>
        </>
      ) : (
        <form onSubmit={send}>
          <div className="row" style={{ gap: 8, marginBottom: 'var(--space-3)' }}>
            <button
              type="button"
              className={`btn ${kind === 'feil' ? 'btn-primary' : ''}`}
              style={{ flex: 1 }}
              aria-pressed={kind === 'feil'}
              onClick={() => setKind('feil')}
            >
              <Bug size={14} /> Noe er feil
            </button>
            <button
              type="button"
              className={`btn ${kind === 'ønske' ? 'btn-primary' : ''}`}
              style={{ flex: 1 }}
              aria-pressed={kind === 'ønske'}
              onClick={() => setKind('ønske')}
            >
              <Lightbulb size={14} /> Jeg har et ønske
            </button>
          </div>
          <label className="field">
            <span className="field-label">
              {kind === 'feil' ? 'Hva skjedde?' : 'Hva skulle du ønske appen kunne?'}
            </span>
            <textarea
              className="input"
              rows={5}
              value={text}
              placeholder={kind === 'feil'
                ? 'f.eks. «Da jeg trykket Fullfør handletur skjedde det ingenting …»'
                : 'f.eks. «Det hadde vært fint om ukemenyen kunne deles som bilde …»'}
              onChange={(e) => setText(e.target.value)}
              autoFocus
            />
          </label>
          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={state === 'busy' || text.trim().length < 3}
          >
            {state === 'busy' ? 'Sender …' : (kind === 'feil' ? 'Send rapporten' : 'Send ønsket')}
          </button>
          {state && state !== 'busy' && (
            <p style={{ fontSize: 12, color: 'var(--color-accent)', margin: '8px 0 0' }}>{state}</p>
          )}
          <p className="text-muted" style={{ fontSize: 11, marginTop: 'var(--space-3)', marginBottom: 0 }}>
            Gjelder det feil navn eller pris på én bestemt vare? Da er det
            enda bedre å trykke på varen i handlelisten og bruke «Meld feil»
            der — slike rettes automatisk hver natt.
          </p>
        </form>
      )}
    </Dialog>
  );
}
