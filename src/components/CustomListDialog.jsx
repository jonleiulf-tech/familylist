import { useState } from 'react';
import { Copy, Trash2, RotateCcw } from 'lucide-react';
import { Dialog } from './Dialog.jsx';
import { addItem, toggleItem, removeItem, splitItems, resetChecks } from '../lib/customLists.js';

/** Åpnet liste: avhuking, «Plukket»-seksjon, legg til, kopier, nullstill, slett. */
export function CustomListDialog({ list, onClose, onUpdate, onCopy, onDelete }) {
  const [draft, setDraft] = useState('');
  const items = list.items ?? [];
  const { open, picked } = splitItems(items);

  // Indeks i den fulle lista, siden visningen er delt i to seksjoner.
  const indexOf = (item) => items.findIndex((i) => i.n === item.n);

  const patch = (next) => onUpdate(list.id, { items: next });

  const add = (e) => {
    e.preventDefault();
    const next = addItem(items, draft);
    if (next !== items) patch(next);
    setDraft('');
  };

  return (
    <Dialog
      title={list.name}
      subtitle={[list.type, list.shared ? 'delt' : 'privat'].filter(Boolean).join(' · ')}
      onClose={onClose}
      footer={
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-sm" onClick={() => onCopy(list)}>
            <Copy size={14} /> Kopier
          </button>
          {picked.length > 0 && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => patch(resetChecks(items))}
            >
              <RotateCcw size={14} /> Nullstill
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn btn-sm" onClick={() => onDelete(list)}>
            <Trash2 size={14} /> Slett
          </button>
        </div>
      }
    >
      <form onSubmit={add} className="row" style={{ gap: 8, marginBottom: 'var(--space-4)' }}>
        <input
          className="input"
          placeholder="Legg til …"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Legg til på listen"
        />
        <button type="submit" className="btn" disabled={!draft.trim()}>Legg til</button>
      </form>

      {open.map((item) => (
        <div key={item.n} className="item-row" style={{ paddingLeft: 0, paddingRight: 0 }}>
          <input
            type="checkbox"
            className="checkbox"
            checked={false}
            onChange={() => patch(toggleItem(items, indexOf(item)))}
            aria-label={`Kryss av ${item.n}`}
          />
          <div className="item-mid"><div className="item-name">{item.n}</div></div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => patch(removeItem(items, indexOf(item)))}
            aria-label={`Fjern ${item.n}`}
          >
            ×
          </button>
        </div>
      ))}

      {!items.length && (
        <p className="text-muted" style={{ fontSize: 13 }}>Listen er tom. Legg til noe over.</p>
      )}

      {picked.length > 0 && (
        <>
          <hr className="divider" style={{ margin: 'var(--space-4) 0 0', height: 1, background: 'var(--color-divider-soft)' }} />
          <div className="section-head" style={{ paddingLeft: 0, paddingRight: 0 }}>
            <span className="section-title">Plukket</span>
            <span className="text-muted" style={{ fontSize: 11 }}>{picked.length}</span>
          </div>
          {picked.map((item) => (
            <div key={item.n} className="item-row is-checked" style={{ paddingLeft: 0, paddingRight: 0 }}>
              <input
                type="checkbox"
                className="checkbox"
                checked
                onChange={() => patch(toggleItem(items, indexOf(item)))}
                aria-label={`Angre ${item.n}`}
              />
              <div className="item-mid"><div className="item-name">{item.n}</div></div>
            </div>
          ))}
        </>
      )}
    </Dialog>
  );
}

/** «Opprett ny liste»: navn, type, og mulighet til å lime inn en tidligere liste. */
export function NewListDialog({ onClose, onCreate }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('pakking');
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);

  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError('Gi listen et navn først.'); return; }
    setError(null);
    setBusy(true);
    try { await onCreate({ name: name.trim(), type, paste }); }
    finally { setBusy(false); }
  };

  return (
    <Dialog
      title="Opprett ny liste"
      onClose={onClose}
      footer={
        <button
          type="submit"
          form="new-list-form"
          className="btn btn-primary btn-block"
          disabled={busy}
        >
          {busy ? 'Lager …' : 'Opprett listen'}
        </button>
      }
    >
      <form id="new-list-form" onSubmit={submit}>
        <label className="field">
          <span className="field-label">Navn</span>
          <input
            className="input" placeholder="f.eks. Fotballcup"
            value={name} onChange={(e) => setName(e.target.value)}
          />
        </label>

        <label className="field">
          <span className="field-label">Type</span>
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="pakking">Pakking</option>
            <option value="sport">Sport</option>
            <option value="verktøy">Verktøy</option>
            <option value="annet">Annet</option>
          </select>
        </label>

        <label className="field">
          <span className="field-label">Lim inn en tidligere liste (valgfritt)</span>
          <textarea
            className="input"
            rows={5}
            placeholder={'Sovepose\nHodelykt\nUllsokker'}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
          />
          <span className="text-muted" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
            Én ting per linje. Punkttegn og avkryssingsbokser blir fjernet automatisk.
          </span>
        </label>
        {error && <p style={{ fontSize: 12, color: 'var(--color-accent)' }}>{error}</p>}
      </form>
    </Dialog>
  );
}
