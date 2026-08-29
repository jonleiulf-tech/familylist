import { useState } from 'react';
import { Copy, Check, UserPlus } from 'lucide-react';
import { Dialog } from '../components/Dialog.jsx';

/**
 * Lister + familiedeling.
 * «Inviter» lager en engangslenke som er gyldig i 7 dager.
 */
export function Lists({ household, members, customLists, onCreateInvite, onSignOut, toast }) {
  const [invite, setInvite] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [problem, setProblem] = useState(null);

  const makeInvite = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const { link, code, expiresAt, error } = await onCreateInvite();
      if (error) { setProblem(error); toast(error); return; }
      setInvite({ link, code, expiresAt });
      setCopied(false);
    } finally {
      // I finally, slik at knappen aldri blir stående og laste
      // uansett hva som gikk galt over.
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invite.link);
      setCopied(true);
    } catch {
      toast('Kunne ikke kopiere automatisk — marker lenken og kopier manuelt.');
    }
  };

  return (
    <div>
      <div className="section-head"><span className="section-title">Familiedeling</span></div>
      <div style={{ padding: '0 var(--space-4) var(--space-4)' }}>
        <div className="card">
          <div className="card-kicker">{household?.name}</div>
          <div className="card-title">
            {members.length} {members.length === 1 ? 'medlem' : 'medlemmer'}
          </div>
          <div className="card-body">
            {members.map((m) => m.display_name).join(', ')}
          </div>
          <div className="card-meta">
            Endringer synkes i sanntid — den andre ser avhukingene dine med én gang.
          </div>
          <button
            type="button"
            className="btn btn-primary btn-block"
            style={{ marginTop: 'var(--space-3)' }}
            onClick={makeInvite}
            disabled={busy}
          >
            <UserPlus size={16} /> {busy ? 'Lager lenke …' : 'Inviter til husholdningen'}
          </button>

          {problem && (
            <p style={{ fontSize: 12, marginTop: 'var(--space-2)', color: 'var(--color-accent)' }}>
              {problem}
            </p>
          )}
        </div>
      </div>

      <hr className="divider" />
      <div className="section-head"><span className="section-title">Egne lister</span></div>
      {customLists.length === 0 && (
        <p className="text-muted" style={{ padding: '0 var(--space-4) var(--space-3)', fontSize: 13 }}>
          Ingen egne lister ennå. Pakkelister, sportsutstyr og verktøy hører hjemme her —
          de kobles ikke mot varedatabasen.
        </p>
      )}
      {customLists.map((l) => (
        <div key={l.id} className="item-row">
          <div className="item-mid">
            <div className="item-name">{l.name}</div>
            <div className="item-sub">
              {(l.items ?? []).length} ting
              {l.type ? ` · ${l.type}` : ''}
              {l.shared ? ' · delt' : ''}
            </div>
          </div>
        </div>
      ))}

      <hr className="divider" style={{ marginTop: 'var(--space-4)' }} />
      <div style={{ padding: 'var(--space-4)' }}>
        <button type="button" className="btn btn-block" onClick={onSignOut}>Logg ut</button>
      </div>

      {invite && (
        <Dialog
          title="Invitasjonslenke"
          subtitle="Engangslenke — gyldig i 7 dager"
          onClose={() => setInvite(null)}
        >
          <p style={{ fontSize: 13, lineHeight: 1.5, marginTop: 0 }}>
            Send denne til den du vil dele husholdningen med. Når hen åpner lenken
            og logger inn, havner hen i samme husholdning som deg — og ser
            handlelisten, middagsplanen og listene deres.
          </p>

          <label className="field" style={{ marginTop: 'var(--space-4)' }}>
            <span className="field-label">Lenke</span>
            <input className="input" readOnly value={invite.link} onFocus={(e) => e.target.select()} />
          </label>

          <label className="field">
            <span className="field-label">Eller bare koden</span>
            <input
              className="input"
              readOnly
              value={invite.code ?? ''}
              onFocus={(e) => e.target.select()}
              style={{ fontFamily: 'ui-monospace, monospace', letterSpacing: '.06em' }}
            />
            <span className="text-muted" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
              Virker ikke lenken, kan hun skrive inn koden under «Har du en
              invitasjonskode?» på innloggingsskjermen.
            </span>
          </label>

          <button type="button" className="btn btn-primary btn-block" onClick={copy}>
            {copied ? <><Check size={16} /> Kopiert</> : <><Copy size={16} /> Kopier lenke</>}
          </button>

          <p className="text-muted" style={{ fontSize: 11, marginTop: 'var(--space-3)' }}>
            Lenken kan brukes én gang, og utløper{' '}
            {invite.expiresAt ? new Date(invite.expiresAt).toLocaleDateString('nb-NO') : 'om 7 dager'}.
            Trenger du flere, lager du bare en ny.
          </p>
        </Dialog>
      )}
    </div>
  );
}
