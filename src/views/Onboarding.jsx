import { useState } from 'react';

/**
 * Første innlogging. Brukeren oppgir visningsnavn, og får sin egen
 * husholdning opprettet med seed-data. Er man invitert, er man allerede
 * plassert i invitererens husholdning og ser aldri denne skjermen.
 */
export function Onboarding({ user, onBootstrap }) {
  const [displayName, setDisplayName] = useState(user?.email?.split('@')[0] ?? '');
  const [householdName, setHouseholdName] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const err = await onBootstrap(displayName.trim(), householdName.trim());
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <div style={{ padding: 'var(--space-5) var(--space-4)' }}>
      <h1 style={{ fontSize: 22 }}>Velkommen</h1>
      <p className="text-muted" style={{ fontSize: 13, lineHeight: 1.5, marginTop: 8 }}>
        Vi setter opp husholdningen din med varedatabasen og middagsbiblioteket.
        Du kan invitere flere etterpå.
      </p>

      <form onSubmit={submit} style={{ marginTop: 'var(--space-5)' }}>
        <label className="field">
          <span className="field-label">Ditt visningsnavn</span>
          <input
            className="input" required placeholder="Marte"
            value={displayName} onChange={(e) => setDisplayName(e.target.value)}
          />
          <span className="text-muted" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
            Dette vises når du krysser av varer, f.eks. «Marte plukket Melk».
          </span>
        </label>

        <label className="field">
          <span className="field-label">Husholdningsnavn (valgfritt)</span>
          <input
            className="input" placeholder="Hansen-familien"
            value={householdName} onChange={(e) => setHouseholdName(e.target.value)}
          />
        </label>

        <button type="submit" className="btn btn-primary btn-block" disabled={busy || !displayName.trim()}>
          {busy ? 'Setter opp …' : 'Kom i gang'}
        </button>
      </form>

      {error && (
        <div className="card" style={{ marginTop: 'var(--space-4)', borderColor: 'var(--color-accent)' }}>
          <div className="card-body" style={{ marginTop: 0 }}>{error}</div>
        </div>
      )}
    </div>
  );
}
