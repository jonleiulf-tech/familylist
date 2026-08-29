import { useState } from 'react';
// Ingen import herfra lenger: useSharedLists holder ventende invitasjon internt.
// Kodefeltet vises alltid, siden vi ikke kan vite om noen kom via lenke.

/**
 * Første innlogging.
 *
 * Normalt: brukeren oppgir visningsnavn og får sin egen husholdning med
 * seed-data. Er man invitert via lenke, er man allerede plassert i
 * invitererens husholdning og ser aldri denne skjermen.
 *
 * Kodefeltet er redningsveien når lenken ikke virket — da kan man skrive
 * inn koden i stedet for å ende opp i en egen husholdning ved en feil.
 */
export function Onboarding({ user, onBootstrap, onRedeem }) {
  const [displayName, setDisplayName] = useState(user?.email?.split('@')[0] ?? '');
  const [householdName, setHouseholdName] = useState('');
  const [code, setCode] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      const err = await fn();
      if (err) setError(err);
    } finally {
      setBusy(false);
    }
  };

  const createOwn = (e) => {
    e.preventDefault();
    run(() => onBootstrap(displayName.trim(), householdName.trim()));
  };

  const joinExisting = (e) => {
    e.preventDefault();
    run(() => onRedeem(code.trim(), displayName.trim()));
  };

  return (
    <div style={{ padding: 'var(--space-5) var(--space-4)' }}>
      <h1 style={{ fontSize: 22 }}>Velkommen</h1>
      <p className="text-muted" style={{ fontSize: 13, lineHeight: 1.5, marginTop: 8 }}>
        Vi setter opp husholdningen din med varedatabasen og middagsbiblioteket.
        Du kan invitere flere etterpå.
      </p>

      <form onSubmit={showCode ? joinExisting : createOwn} style={{ marginTop: 'var(--space-5)' }}>
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

        {showCode ? (
          <label className="field">
            <span className="field-label">Invitasjonskode</span>
            <input
              className="input" required placeholder="f.eks. a1b2c3d4e5f6a7b8"
              value={code} onChange={(e) => setCode(e.target.value)}
              style={{ fontFamily: 'ui-monospace, monospace' }}
            />
            <span className="text-muted" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
              Koden finner den som inviterte deg under Lister → Inviter.
            </span>
          </label>
        ) : (
          <label className="field">
            <span className="field-label">Husholdningsnavn (valgfritt)</span>
            <input
              className="input" placeholder="Hansen-familien"
              value={householdName} onChange={(e) => setHouseholdName(e.target.value)}
            />
          </label>
        )}

        <button type="submit" className="btn btn-primary btn-block" disabled={busy || !displayName.trim()}>
          {busy
            ? 'Lagrer …'
            : (showCode ? 'Bli med i husholdningen' : 'Opprett husholdningen min')}
        </button>
      </form>

      <button
        type="button"
        className="btn btn-ghost btn-block"
        style={{ marginTop: 'var(--space-2)' }}
        onClick={() => { setShowCode(!showCode); setError(null); }}
      >
        {showCode
          ? '← Opprett min egen husholdning i stedet'
          : 'Har du en invitasjonskode?'}
      </button>

      {error && (
        <div className="card" style={{ marginTop: 'var(--space-4)', borderColor: 'var(--color-accent)' }}>
          <div className="card-body" style={{ marginTop: 0 }}>{error}</div>
        </div>
      )}
    </div>
  );
}
