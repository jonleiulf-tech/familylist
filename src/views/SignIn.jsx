import { useState } from 'react';
import { KassalappCredit } from '../components/About.jsx';
import {
  signInWithPassword, signUpWithPassword, sendMagicLink, resetPassword,
} from '../hooks/useAuth.js';

/**
 * Innlogging: e-post + passord som hovedvei, innloggingslenke som
 * alternativ for den som foretrekker det (og for kontoer laget før
 * passordstøtten fantes — de setter passord via «Glemt passordet?»).
 */
export function SignIn() {
  const [mode, setMode] = useState('login');   // login | signup | magic
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const say = (type, text) => setStatus({ type, text });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      if (mode === 'login') {
        const err = await signInWithPassword(email.trim(), password);
        if (err) say('error', err);
        // Innlogget: onAuthStateChange tar over, ingen melding nødvendig.
      } else if (mode === 'signup') {
        if (password.length < 8) {
          say('error', 'Velg et passord på minst 8 tegn.');
          return;
        }
        const { error, needsConfirm } = await signUpWithPassword(email.trim(), password);
        if (error) say('error', error);
        else if (needsConfirm) say('ok', `Nesten der — klikk lenken vi sendte til ${email.trim()} for å bekrefte kontoen.`);
      } else {
        const err = await sendMagicLink(email.trim());
        say(err ? 'error' : 'ok', err ?? `Sjekk e-posten — vi sendte en innloggingslenke til ${email.trim()}.`);
      }
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    if (!email.trim()) { say('error', 'Skriv inn e-postadressen din først, så sender vi tilbakestillingslenken dit.'); return; }
    setBusy(true);
    try {
      const err = await resetPassword(email.trim());
      say(err ? 'error' : 'ok', err ?? `Vi sendte en lenke til ${email.trim()} for å sette nytt passord.`);
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (m) => { setMode(m); setStatus(null); };

  return (
    <div style={{ padding: 'var(--space-5) var(--space-4)', maxWidth: 440, margin: '0 auto' }}>
      <h1 style={{ fontSize: 30, letterSpacing: '-0.025em', lineHeight: 1.05 }}>
        {mode === 'signup' ? 'Opprett konto' : 'Logg inn'}
      </h1>
      <p className="text-muted" style={{ fontSize: 14, lineHeight: 1.55, marginTop: 10 }}>
        {mode === 'magic'
          ? 'Du får en engangslenke på e-post — ingen passord å huske.'
          : mode === 'signup'
            ? 'E-post og et passord på minst 8 tegn, så er du i gang.'
            : 'Logg inn med e-post og passord.'}
      </p>

      <form onSubmit={submit} style={{
        marginTop: 'var(--space-5)',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-divider)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)',
        padding: 'var(--space-4)',
      }}>
        <label className="field">
          <span className="field-label">E-post</span>
          <input
            className="input" type="email" required autoComplete="email"
            placeholder="navn@example.no"
            value={email} onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        {mode !== 'magic' && (
          <label className="field">
            <span className="field-label">Passord</span>
            <input
              className="input" type="password" required
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              minLength={mode === 'signup' ? 8 : undefined}
              value={password} onChange={(e) => setPassword(e.target.value)}
            />
            {mode === 'login' && (
              <button
                type="button"
                onClick={forgot}
                disabled={busy}
                style={{
                  background: 'none', border: 'none', padding: 0, marginTop: 6,
                  fontFamily: 'var(--font-body)', fontSize: 12,
                  color: 'var(--color-accent)', cursor: 'pointer', textAlign: 'left',
                }}
              >
                Glemt passordet? (setter også passord for deg som bare har brukt lenke)
              </button>
            )}
          </label>
        )}

        <button type="submit" className="btn btn-primary btn-block" disabled={busy || !email.trim()}>
          {busy
            ? 'Vent litt …'
            : mode === 'signup' ? 'Opprett konto'
              : mode === 'magic' ? 'Send innloggingslenke'
                : 'Logg inn'}
        </button>
      </form>

      <div className="stack" style={{ gap: 'var(--space-1)', marginTop: 'var(--space-3)' }}>
        {mode !== 'signup' && (
          <button type="button" className="btn btn-ghost btn-block" onClick={() => switchMode('signup')}>
            Ny her? Opprett konto
          </button>
        )}
        {mode !== 'login' && (
          <button type="button" className="btn btn-ghost btn-block" onClick={() => switchMode('login')}>
            ← Logg inn med passord
          </button>
        )}
        {mode === 'login' && (
          <button type="button" className="btn btn-ghost btn-block" onClick={() => switchMode('magic')}>
            Heller få en lenke på e-post?
          </button>
        )}
      </div>

      {status && (
        <div
          className="card"
          style={{
            marginTop: 'var(--space-4)',
            borderColor: status.type === 'error' ? 'var(--color-accent)' : 'var(--color-divider)',
          }}
        >
          <div className="card-body" style={{ marginTop: 0 }}>{status.text}</div>
        </div>
      )}

      {/* Kildene, nederst — også for den som ikke har logget inn ennå. */}
      <KassalappCredit style={{ marginTop: 'var(--space-6)', textAlign: 'center' }} />
    </div>
  );
}
