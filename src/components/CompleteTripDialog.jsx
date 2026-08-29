import { useState } from 'react';
import { Dialog } from './Dialog.jsx';
import { tripName } from '../lib/format.js';

/**
 * Fullfør handletur.
 * «Lagre handlelisten til senere» er avkrysset som forvalg, med et
 * ferdig utfylt navn («Handletur onsdag 27. august»).
 */
export function CompleteTripDialog({ boughtCount, totalCount, onClose, onComplete }) {
  const [save, setSave] = useState(true);
  const [name, setName] = useState(tripName());
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    await onComplete({ save, name: name.trim() || tripName() });
  };

  return (
    <Dialog
      title="Fullfør handletur"
      subtitle={`${boughtCount} av ${totalCount} varer er plukket`}
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-primary btn-block" onClick={submit} disabled={busy}>
          {busy ? 'Fullfører …' : 'Fullfør og nullstill listen'}
        </button>
      }
    >
      <p style={{ fontSize: 13, lineHeight: 1.5, marginTop: 0 }}>
        Hele listen nullstilles, og rekkefølgen dere plukket i lagres slik at
        listen sorterer seg bedre neste gang.
      </p>

      <label className="row" style={{ gap: 10, margin: 'var(--space-4) 0 var(--space-2)' }}>
        <input type="checkbox" className="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} />
        <span style={{ fontSize: 14 }}>Lagre handlelisten til senere</span>
      </label>

      {save && (
        <label className="field">
          <span className="field-label">Navn</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      )}
    </Dialog>
  );
}
