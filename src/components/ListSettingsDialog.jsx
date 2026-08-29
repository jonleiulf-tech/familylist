import { useState } from 'react';
import { Dialog } from './Dialog.jsx';
import { KIND_LABEL } from './ListSwitcher.jsx';

/**
 * Innstillinger for den aktive delte listen: navn, type, og for
 * familielister antall voksne og barn — middagsmengdene bygger på det.
 * Bare admin kan lagre; RLS håndhever det uansett hva UI-et viser.
 */
export function ListSettingsDialog({ list, isOwner, onClose, onSave }) {
  const [name, setName] = useState(list.name ?? '');
  const [kind, setKind] = useState(list.kind ?? 'annet');
  const [adults, setAdults] = useState(String(list.adults ?? 2));
  const [children, setChildren] = useState(String(list.children ?? 2));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const patch = { name: name.trim(), kind };
      if (kind === 'familie') {
        patch.adults = Math.max(1, Math.min(10, Number(adults) || 2));
        patch.children = Math.max(0, Math.min(10, Number(children) || 0));
      }
      const err = await onSave(list.id, patch);
      if (err) { setError(err); return; }
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="Listeinnstillinger"
      subtitle={isOwner ? undefined : 'Bare admin kan endre disse'}
      onClose={onClose}
      footer={isOwner ? (
        <button type="submit" form="list-settings" className="btn btn-primary btn-block" disabled={busy || !name.trim()}>
          {busy ? 'Lagrer …' : 'Lagre'}
        </button>
      ) : null}
    >
      <form id="list-settings" onSubmit={save}>
        <label className="field">
          <span className="field-label">Navn</span>
          <input
            className="input" required disabled={!isOwner}
            value={name} onChange={(e) => setName(e.target.value)}
          />
        </label>

        <label className="field">
          <span className="field-label">Type</span>
          <select className="input" disabled={!isOwner} value={kind} onChange={(e) => setKind(e.target.value)}>
            {Object.entries(KIND_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>

        {kind === 'familie' && (
          <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
            <label className="field" style={{ flex: 1 }}>
              <span className="field-label">Voksne</span>
              <input
                className="input" inputMode="numeric" disabled={!isOwner}
                value={adults} onChange={(e) => setAdults(e.target.value)}
              />
            </label>
            <label className="field" style={{ flex: 1 }}>
              <span className="field-label">Barn</span>
              <input
                className="input" inputMode="numeric" disabled={!isOwner}
                value={children} onChange={(e) => setChildren(e.target.value)}
              />
            </label>
          </div>
        )}

        {kind === 'familie' && (
          <p className="text-muted" style={{ fontSize: 11, marginTop: 0 }}>
            Middagsmengdene i biblioteket er beregnet for 2 voksne og 2 barn.
            Tallene her brukes av kommende mengdejustering.
          </p>
        )}

        {error && (
          <p style={{ fontSize: 12, color: 'var(--color-accent)' }}>{error}</p>
        )}
      </form>
    </Dialog>
  );
}
