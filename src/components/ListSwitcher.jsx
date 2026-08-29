import { useState } from 'react';
import { ChevronDown, Plus, Check } from 'lucide-react';
import { Dialog } from './Dialog.jsx';

const KIND_LABEL = {
  familie: 'Familie',
  venner: 'Venner',
  jobb: 'Jobb',
  annet: 'Annet',
};

/** Velger mellom brukerens delte lister. Vises i headeren. */
export function ListSwitcher({ lists, activeList, onSelect, onCreate }) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState('venner');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await onCreate(name.trim(), kind);
      if (err) { setError(err); return; }
      setCreating(false);
      setOpen(false);
      setName('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => setOpen(true)}
        style={{ padding: '2px 6px', marginTop: 2 }}
        aria-label="Bytt delt liste"
      >
        <span className="text-muted" style={{ fontSize: 11 }}>
          {activeList?.name ?? 'Ingen liste'}
        </span>
        <ChevronDown size={12} />
      </button>

      {open && (
        <Dialog
          title="Delte lister"
          subtitle={`Du er med i ${lists.length} ${lists.length === 1 ? 'liste' : 'lister'}`}
          onClose={() => { setOpen(false); setCreating(false); }}
        >
          {!creating ? (
            <>
              <div className="stack" style={{ gap: 0 }}>
                {lists.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    className="item-row"
                    style={{
                      width: '100%', paddingLeft: 0, paddingRight: 0,
                      background: 'none', border: 'none',
                      borderBottom: '1px solid var(--color-divider-soft)',
                      cursor: 'pointer', textAlign: 'left',
                    }}
                    onClick={() => { onSelect(l.id); setOpen(false); }}
                  >
                    <div className="item-mid">
                      <div className="item-name">{l.name}</div>
                      <div className="item-sub">
                        {KIND_LABEL[l.kind] ?? l.kind}
                        {l.myRole === 'owner' && ' · du er admin'}
                      </div>
                    </div>
                    {l.id === activeList?.id && <Check size={18} color="var(--color-accent)" />}
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="btn btn-primary btn-block"
                style={{ marginTop: 'var(--space-4)' }}
                onClick={() => setCreating(true)}
              >
                <Plus size={16} /> Ny delt liste
              </button>
            </>
          ) : (
            <form onSubmit={create}>
              <label className="field">
                <span className="field-label">Navn</span>
                <input
                  className="input" required autoFocus placeholder="Hyttetur 2026"
                  value={name} onChange={(e) => setName(e.target.value)}
                />
              </label>

              <label className="field">
                <span className="field-label">Type</span>
                <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
                  <option value="familie">Familie</option>
                  <option value="venner">Venner</option>
                  <option value="jobb">Jobb</option>
                  <option value="annet">Annet</option>
                </select>
                <span className="text-muted" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
                  Familielister får middagsbiblioteket. De andre starter tomme.
                </span>
              </label>

              <div className="row" style={{ gap: 8 }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={busy || !name.trim()}>
                  {busy ? 'Oppretter …' : 'Opprett'}
                </button>
                <button type="button" className="btn" onClick={() => setCreating(false)}>Avbryt</button>
              </div>

              {error && (
                <p style={{ fontSize: 12, marginTop: 'var(--space-2)', color: 'var(--color-accent)' }}>
                  {error}
                </p>
              )}
            </form>
          )}
        </Dialog>
      )}
    </>
  );
}

export { KIND_LABEL };
