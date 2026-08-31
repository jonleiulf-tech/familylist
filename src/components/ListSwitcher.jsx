import { useState } from 'react';
import { ChevronDown, Plus, Check, Pencil } from 'lucide-react';
import { Dialog } from './Dialog.jsx';

const KIND_LABEL = {
  familie: 'Familie',
  venner: 'Venner',
  jobb: 'Jobb',
  annet: 'Annet',
};

/** Velger mellom brukerens delte lister. Vises i headeren. */
export function ListSwitcher({ lists, activeList, onSelect, onCreate, onRename }) {
  const [open, setOpen] = useState(false);
  // { id, name } mens en liste får nytt navn — også lister man ikke står i.
  const [renaming, setRenaming] = useState(null);
  const [renameError, setRenameError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState('venner');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const create = async (e) => {
    e.preventDefault();
    // Knappen er alltid aktiv og sier fra, i stedet for å stå død når
    // feltet er tomt — en grå eksempeltekst er lett å ta for en verdi.
    if (!name.trim()) { setError('Gi listen et navn først.'); return; }
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

  const saveName = async (e) => {
    e.preventDefault();
    const name = renaming.name.trim();
    if (!name) { setRenameError('Gi listen et navn.'); return; }
    setRenameError(null);
    const err = await onRename?.(renaming.id, name);
    if (err) { setRenameError(err); return; }
    setRenaming(null);
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
          onClose={() => { setOpen(false); setCreating(false); setRenaming(null); setRenameError(null); }}
        >
          {!creating ? (
            <>
              <div className="stack" style={{ gap: 0 }}>
                {lists.map((l) => (
                  <div
                    key={l.id}
                    className="item-row"
                    style={{
                      paddingLeft: 0, paddingRight: 0,
                      borderBottom: '1px solid var(--color-divider-soft)',
                    }}
                  >
                    {renaming?.id === l.id ? (
                      <form onSubmit={saveName} style={{ flex: 1 }}>
                        <div className="row" style={{ gap: 6 }}>
                          <input
                            className="input"
                            value={renaming.name}
                            onChange={(e) => setRenaming({ id: l.id, name: e.target.value })}
                            aria-label={`Nytt navn på ${l.name}`}
                            autoFocus
                          />
                          <button type="submit" className="btn btn-primary btn-sm">Lagre</button>
                          <button
                            type="button" className="btn btn-sm"
                            onClick={() => { setRenaming(null); setRenameError(null); }}
                          >
                            Avbryt
                          </button>
                        </div>
                        {renameError && (
                          <p style={{ fontSize: 11, margin: '6px 0 0', color: 'var(--color-accent)' }}>
                            {renameError}
                          </p>
                        )}
                      </form>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="item-mid"
                          style={{ background: 'none', border: 0, textAlign: 'left', cursor: 'pointer', padding: 0 }}
                          onClick={() => { onSelect(l.id); setOpen(false); }}
                        >
                          <div className="item-name">{l.name}</div>
                          <div className="item-sub">
                            {KIND_LABEL[l.kind] ?? l.kind}
                            {l.myRole === 'owner' && ' · du er admin'}
                          </div>
                        </button>
                        {l.myRole === 'owner' && onRename && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => { setRenaming({ id: l.id, name: l.name }); setRenameError(null); }}
                            aria-label={`Endre navn på ${l.name}`}
                            title="Endre navn"
                          >
                            <Pencil size={14} />
                          </button>
                        )}
                        {l.id === activeList?.id && <Check size={18} color="var(--color-accent)" />}
                      </>
                    )}
                  </div>
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
                  className="input" autoFocus placeholder="f.eks. Hyttetur 2026"
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
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>
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
