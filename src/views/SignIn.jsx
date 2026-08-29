import { useState } from 'react';
import { sendMagicLink } from '../hooks/useAuth.js';

export function SignIn() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const error = await sendMagicLink(email.trim());
    setBusy(false);
    setStatus(error ? { type: 'error', text: error } : {
      type: 'ok',
      text: `Sjekk e-posten. Vi sendte en innloggingslenke til ${email.trim()}.`,
    });
  };

  return (
    <div style={{ padding: 'var(--space-5) var(--space-4)' }}>
      <h1 style={{ fontSize: 22 }}>Logg inn</h1>
      <p className="text-muted" style={{ fontSize: 13, lineHeight: 1.5, marginTop: 8 }}>
        Du får en engangslenke på e-post — ingen passord å huske.
      </p>

      <form onSubmit={submit} style={{ marginTop: 'var(--space-5)' }}>
        <label className="field">
          <span className="field-label">E-post</span>
          <input
            className="input"
            type="email"
            required
            autoComplete="email"
            placeholder="navn@example.no"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <button type="submit" className="btn btn-primary btn-block" disabled={busy || !email.trim()}>
          {busy ? 'Sender …' : 'Send innloggingslenke'}
        </button>
      </form>

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
    </div>
  );
}
