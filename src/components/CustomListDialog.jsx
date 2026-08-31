import { useState } from 'react';
import { Copy, Trash2, RotateCcw, Users, Check, Pencil, X } from 'lucide-react';
import { Dialog } from './Dialog.jsx';
import { addItem, stepItem, toggleItem, removeItem, splitItems, resetChecks } from '../lib/customLists.js';

/** Åpnet liste: avhuking, «Plukket»-seksjon, legg til, kopier, nullstill, slett. */
export function CustomListDialog({ list, onClose, onUpdate, onCopy, onDelete }) {
  const [draft, setDraft] = useState('');
  const [editName, setEditName] = useState(null);   // null = viser, streng = redigerer
  const items = list.items ?? [];
  const { open, picked } = splitItems(items);

  const saveName = (e) => {
    e.preventDefault();
    const name = editName.trim();
    if (name && name !== list.name) onUpdate(list.id, { name });
    setEditName(null);
  };

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
      subtitle={[list.type, list.shared ? 'vises for alle' : 'skjult for de andre'].filter(Boolean).join(' · ')}
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
              <RotateCcw size={14} /> Tøm plukket
            </button>
          )}
          <button
            type="button"
            className={`btn btn-sm ${list.shared ? 'btn-secondary' : ''}`}
            onClick={() => onUpdate(list.id, { shared: !list.shared })}
            aria-pressed={list.shared}
            title={list.shared
              ? 'Vises i oversikten for alle i husholdningen'
              : 'Skjules i oversikten. Merk: den er fortsatt tilgjengelig for de andre — dette er rydding, ikke personvern.'}
          >
            {list.shared ? <><Check size={14} /> Delt</> : <><Users size={14} /> Del</>}
          </button>
          <span className="spacer" />
          <button type="button" className="btn btn-sm" onClick={() => onDelete(list)}>
            <Trash2 size={14} /> Slett
          </button>
        </div>
      }
    >
      {editName === null ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ paddingLeft: 0, marginBottom: 'var(--space-2)', color: 'var(--color-text-muted)' }}
          onClick={() => setEditName(list.name)}
        >
          <Pencil size={13} /> Endre navn
        </button>
      ) : (
        <form onSubmit={saveName} className="row" style={{ gap: 8, marginBottom: 'var(--space-3)' }}>
          <input
            className="input"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            aria-label="Nytt navn på listen"
            autoFocus
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={!editName.trim()}>Lagre</button>
          <button type="button" className="btn btn-sm" onClick={() => setEditName(null)}>Avbryt</button>
        </form>
      )}

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
          {/* Samme −/+ som handlelisten. Under 1 fjernes tingen med ×. */}
          <div className="stepper">
            <button
              type="button" className="stepper-btn"
              onClick={() => patch(stepItem(items, indexOf(item), -1))}
              aria-label={`Færre ${item.n}`}
            >
              −
            </button>
            <div className="stepper-val" style={{ minWidth: 40 }}>{Number(item.qty) || 1}</div>
            <button
              type="button" className="stepper-btn"
              onClick={() => patch(stepItem(items, indexOf(item), 1))}
              aria-label={`Flere ${item.n}`}
            >
              +
            </button>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ color: 'var(--color-text-muted)' }}
            onClick={() => patch(removeItem(items, indexOf(item)))}
            aria-label={`Fjern ${item.n}`}
          >
            <X size={14} />
          </button>
        </div>
      ))}

      {!items.length && (
        <div style={{
          border: '1px dashed var(--color-divider-strong)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-4)',
        }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16 }}>
            Listen er tom
          </div>
          <p className="text-muted" style={{ fontSize: 13, lineHeight: 1.55, margin: '6px 0 0' }}>
            Skriv inn én ting om gangen i feltet over. Antallet justeres med
            −/+ etterpå, og det du plukker havner nederst.
          </p>
        </div>
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
              <div className="item-mid">
                <div className="item-name">
                  {item.n}{(Number(item.qty) || 1) > 1 ? ` ×${item.qty}` : ''}
                </div>
              </div>
            </div>
          ))}
        </>
      )}
    </Dialog>
  );
}

/** «Opprett ny liste»: navn, type, og mulighet til å lime inn en tidligere liste. */
export function NewListDialog({ onClose, onCreate, initialType = 'pakking' }) {
  const [name, setName] = useState('');
  const [type, setType] = useState(initialType);
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

        <div className="field">
          <span className="field-label">Type</span>
          {/* Chips som brytes over linjer — seks valg i én segmentrad ble
              klemt uleselig sammen på mobil. */}
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {[
              ['pakking', 'Pakking'], ['sport', 'Sport'], ['verktøy', 'Verktøy'],
              ['telling', '🔢 Telling'],
              ['familie', 'Familie'], ['annet', 'Annet'],
            ].map(([v, l]) => (
              <button
                key={v}
                type="button"
                className={`tag tag-button ${type === v ? 'tag-accent' : 'tag-outline'}`}
                aria-pressed={type === v}
                onClick={() => setType(v)}
              >
                {l}
              </button>
            ))}
          </div>
          {type === 'telling' && (
            <p className="text-muted" style={{ fontSize: 11, margin: '8px 0 0', lineHeight: 1.5 }}>
              Telleliste: hovedvare med varianter under (Sko → 39, 40, 41),
              antall som økes i steg på 1, 5 eller 10, og eksport til Excel
              eller PDF. Flere kan telle samtidig.
            </p>
          )}
        </div>

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
