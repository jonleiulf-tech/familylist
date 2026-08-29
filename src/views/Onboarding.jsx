import { useState } from 'react';

const KINDS = [
  { value: 'familie', label: 'Familien', hint: 'Handleliste, middagsplan og 30 middager klare' },
  { value: 'venner', label: 'Venner', hint: 'Hyttetur, fest — med oppgjør etterpå' },
  { value: 'jobb', label: 'Jobb', hint: 'Kontorkassa, felles innkjøp' },
  { value: 'annet', label: 'Annet', hint: 'Start blankt' },
];

/**
 * Første innlogging: hva skal listen brukes til, og hvem deles den med?
 * Svaret styrer hva som seedes — familielister får middagsbiblioteket,
 * de andre starter tomme. Flere lister kan lages senere fra toppmenyen.
 */
export function Onboarding({ user, onBootstrap, onCreateList, onRedeem }) {
  const [displayName, setDisplayName] = useState(user?.email?.split('@')[0] ?? '');
  const [kind, setKind] = useState('familie');
  const [listName, setListName] = useState('');
  const [code, setCode] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const placeholder = {
    familie: 'Leiulfsrud-familien',
    venner: 'Hyttetur 2026',
    jobb: 'Kontoret',
    annet: 'Min liste',
  }[kind];

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

  const create = (e) => {
    e.preventDefault();
    run(async () => {
      // Profilnavnet må finnes før listen, så medlemsraden får riktig navn.
      const bootErr = kind === 'familie'
        ? await onBootstrap(displayName.trim(), listName.trim() || placeholder)
        : await onBootstrap(displayName.trim(), null);
      if (bootErr) return bootErr;
      if (kind !== 'familie') {
        const { error: cErr } = await onCreateList(listName.trim() || placeholder, kind);
        return cErr;
      }
      return null;
    });
  };

  const join = (e) => {
    e.preventDefault();
    run(() => onRedeem(code.trim(), displayName.trim()));
  };

  return (
    <div style={{ padding: 'var(--space-5) var(--space-4)' }}>
      <h1 style={{ fontSize: 22 }}>Velkommen</h1>
      <p className="text-muted" style={{ fontSize: 13, lineHeight: 1.5, marginTop: 8 }}>
        {showCode
          ? 'Har du fått en invitasjonskode, havner du rett i listen til den som inviterte deg.'
          : 'Hva skal du bruke Plukkelisten til, og hvem vil du dele med? Du kan lage flere lister senere.'}
      </p>

      <form onSubmit={showCode ? join : create} style={{ marginTop: 'var(--space-5)' }}>
        <label className="field">
          <span className="field-label">Ditt visningsnavn</span>
          <input
            className="input" required placeholder="Jon"
            value={displayName} onChange={(e) => setDisplayName(e.target.value)}
          />
          <span className="text-muted" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
            Vises når du plukker varer — «Jon plukket Melk» — og i oppgjøret.
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
          </label>
        ) : (
          <>
            <div className="field">
              <span className="field-label">Hva skal listen brukes til?</span>
              <div className="stack" style={{ gap: 'var(--space-2)' }}>
                {KINDS.map((k) => (
                  <button
                    key={k.value}
                    type="button"
                    className="btn btn-block"
                    aria-pressed={kind === k.value}
                    style={kind === k.value ? {
                      background: 'var(--color-text)',
                      borderColor: 'var(--color-text)',
                      color: 'var(--color-text-inverse)',
                    } : undefined}
                    onClick={() => setKind(k.value)}
                  >
                    <span style={{ fontWeight: 600 }}>{k.label}</span>
                    <span style={{
                      marginLeft: 'auto', fontSize: 11, fontWeight: 400,
                      opacity: 0.75, textAlign: 'right',
                    }}>
                      {k.hint}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <label className="field">
              <span className="field-label">Navn på listen</span>
              <input
                className="input" placeholder={placeholder}
                value={listName} onChange={(e) => setListName(e.target.value)}
              />
            </label>
          </>
        )}

        <button type="submit" className="btn btn-primary btn-block" disabled={busy || !displayName.trim()}>
          {busy ? 'Setter opp …' : (showCode ? 'Bli med' : 'Kom i gang')}
        </button>
      </form>

      <button
        type="button"
        className="btn btn-ghost btn-block"
        style={{ marginTop: 'var(--space-2)' }}
        onClick={() => { setShowCode(!showCode); setError(null); }}
      >
        {showCode ? '← Lag min egen liste i stedet' : 'Har du en invitasjonskode?'}
      </button>

      {error && (
        <div className="card" style={{ marginTop: 'var(--space-4)', borderColor: 'var(--color-accent)' }}>
          <div className="card-body" style={{ marginTop: 0 }}>{error}</div>
        </div>
      )}
    </div>
  );
}
