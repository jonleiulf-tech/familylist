import { useMemo, useState } from 'react';
import { Dialog } from './Dialog.jsx';
import { kr, estimateCost } from '../lib/format.js';

/**
 * Gjennomgangsdialogen — ETT delt mønster for alle «legg til»-flyter:
 * middagsingredienser, forslag, gjentaksvarer og lagrede lister.
 *
 * Avhukbar vareliste med −/+ antall og pris. Varer som allerede ligger på
 * handlelisten merkes «Ligger på listen – økes».
 *
 * rows: [{ name, qty, unit, category, price, price_source, pack_size }]
 * existingNames: Set med navn som alt ligger på listen (lowercase)
 */
export function ReviewDialog({ title, subtitle, rows, existingNames, onCancel, onSubmit }) {
  const [state, setState] = useState(() =>
    rows.map((r) => ({ ...r, checked: true }))   // alle forhåndsavhuket
  );

  const selected = useMemo(() => state.filter((r) => r.checked), [state]);
  const total = useMemo(
    () => selected.reduce((s, r) => s + estimateCost(r), 0),
    [selected],
  );
  const allExact = selected.length > 0 && selected.every((r) => r.price_source === 'kassalapp');

  const patch = (idx, next) =>
    setState((cur) => cur.map((r, i) => (i === idx ? { ...r, ...next } : r)));

  const step = (idx, dir) => {
    const r = state[idx];
    const pack = Number(r.pack_size) || 0;
    const stepBy = pack > 0 ? pack : 1;
    const next = Math.max(stepBy, (Number(r.qty) || 0) + dir * stepBy);
    patch(idx, { qty: next });
  };

  return (
    <Dialog
      title={title}
      subtitle={subtitle}
      onClose={onCancel}
      footer={
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={!selected.length}
          onClick={() => onSubmit(selected, state)}
        >
          Send til handlelisten ({selected.length})
          {total > 0 && (
            <span style={{ marginLeft: 'auto', fontWeight: 400 }}>
              {allExact ? '' : 'ca. '}{kr(total)}
            </span>
          )}
        </button>
      }
    >
      <div className="stack" style={{ gap: 0 }}>
        {state.map((r, idx) => {
          const already = existingNames?.has(r.name.toLowerCase());
          return (
            <div key={`${r.name}-${idx}`} className="item-row" style={{ paddingLeft: 0, paddingRight: 0 }}>
              <input
                type="checkbox"
                className="checkbox"
                checked={r.checked}
                onChange={(e) => patch(idx, { checked: e.target.checked })}
                aria-label={r.name}
              />
              <div className="item-mid">
                <div className="item-name">{r.name}</div>
                <div className="item-sub">
                  {already
                    ? <span style={{ color: 'var(--color-accent)' }}>Ligger på listen – økes</span>
                    : r.category || ''}
                </div>
              </div>
              <div className="row" style={{ gap: 6 }}>
                <div className="stepper">
                  <button type="button" className="stepper-btn" onClick={() => step(idx, -1)} aria-label="Færre">−</button>
                  <div className="stepper-val">
                    <div>{r.qty} {r.unit}</div>
                    {Number(r.price) > 0 && (
                      <div className="text-muted" style={{ fontSize: 10 }}>
                        {r.price_source === 'kassalapp' ? '' : 'ca. '}{kr(estimateCost(r))}
                      </div>
                    )}
                  </div>
                  <button type="button" className="stepper-btn" onClick={() => step(idx, 1)} aria-label="Flere">+</button>
                </div>
              </div>
            </div>
          );
        })}
        {!state.length && <p className="text-muted" style={{ fontSize: 13 }}>Ingenting å legge til.</p>}
      </div>
    </Dialog>
  );
}
