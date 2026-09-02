import { useMemo, useState } from 'react';
import { Dialog } from './Dialog.jsx';
import { kr, estimateCost, qtyDetail, stepQty } from '../lib/format.js';
import { UnitSelect } from './UnitSelect.jsx';
import { convertQty } from '../lib/units.js';

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
export function ReviewDialog({
  title, subtitle, rows, existingNames, onCancel, onSubmit,
  // Valgfri vei ut som IKKE sender noe til handlelisten: middagen er alt
  // lagret, og mengdene man har justert her lagres tilbake i oppskriften.
  secondaryLabel = null, secondaryHint = null, onSecondary = null,
}) {
  const [state, setState] = useState(() =>
    rows.map((r) => ({ ...r, checked: true }))   // alle forhåndsavhuket
  );
  const [busy, setBusy] = useState(false);       // hindrer dobbel-innsending

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
    // Snapper til hele trinn — halve tall fra skalering skal kunne rettes.
    patch(idx, { qty: Math.max(stepBy, stepQty(r.qty, dir, stepBy)) });
  };

  return (
    <Dialog
      title={title}
      subtitle={subtitle}
      onClose={onCancel}
      footer={
        <div className="stack" style={{ gap: 6 }}>
          <button
            type="button"
            className="btn btn-primary btn-block"
            style={{ minHeight: 50 }}
            disabled={!selected.length || busy}
            onClick={async () => {
              if (busy) return;
              setBusy(true);
              try { await onSubmit(selected, state); } finally { setBusy(false); }
            }}
          >
            {busy ? 'Sender …' : `Send til handlelisten (${selected.length})`}
            {total > 0 && (
              <span className="tnum" style={{ marginLeft: 'auto', fontWeight: 400 }}>
                {allExact ? '' : 'ca. '}{kr(total)}
              </span>
            )}
          </button>
          {onSecondary && secondaryLabel && (
            <>
              <button
                type="button"
                className="btn btn-ghost btn-block"
                style={{ fontSize: 13 }}
                disabled={busy}
                onClick={async () => {
                  if (busy) return;
                  setBusy(true);
                  try { await onSecondary(state); } finally { setBusy(false); }
                }}
              >
                {secondaryLabel}
              </button>
              {secondaryHint && (
                <p className="text-muted" style={{ fontSize: 11, textAlign: 'center', margin: 0 }}>
                  {secondaryHint}
                </p>
              )}
            </>
          )}
        </div>
      }
    >
      <div className="stack" style={{ gap: 0 }}>
        {state.map((r, idx) => {
          const already = existingNames?.has(r.name.toLowerCase());
          return (
            <div
              key={`${r.name}-${idx}`}
              className="item-row"
              style={{ paddingLeft: 0, paddingRight: 0, minHeight: 60, opacity: r.checked ? 1 : 0.55 }}
            >
              {/* 44×44 trykkflate rundt den 22 px store boksen — de negative
                  margene holder boksen visuelt der den var. */}
              <label style={{
                display: 'grid', placeItems: 'center', width: 44, height: 44,
                margin: -11, flexShrink: 0, cursor: 'pointer',
              }}>
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={r.checked}
                  onChange={(e) => patch(idx, { checked: e.target.checked })}
                  aria-label={r.name}
                />
              </label>
              {/* Mengdeforklaringen («3 pakker à ca. 400 g») hører hjemme her,
                  på full bredde under navnet — ikke inneklemt i den smale
                  antallsruta, der den brekker over fire linjer. */}
              <div className="item-mid">
                <div className="item-name">{r.name}</div>
                <div className="item-sub">
                  {already
                    ? <span style={{ fontWeight: 600, color: 'var(--color-herb-ink, var(--color-herb))' }}>
                        ✓ Ligger på listen — antallet økes
                      </span>
                    : r.category || ''}
                </div>
                {qtyDetail(r.qty, r.unit, r.pack_size) && (
                  <div className="item-sub tnum" style={{ marginTop: 1 }}>
                    {qtyDetail(r.qty, r.unit, r.pack_size)}
                  </div>
                )}
              </div>
              <div className="stack" style={{ gap: 4, flexShrink: 0, alignItems: 'stretch' }}>
                <div className="stepper" style={{ minHeight: 44 }}>
                  <button
                    type="button"
                    className="stepper-btn"
                    style={{ minWidth: 40, fontSize: 20 }}
                    onClick={() => step(idx, -1)}
                    aria-label="Færre"
                  >
                    −
                  </button>
                  <div className="stepper-val" style={{ minWidth: 60, display: 'grid', alignContent: 'center' }}>
                    <div className="tnum" style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {r.qty} {r.unit}
                    </div>
                    {Number(r.price) > 0 && estimateCost(r) > 0 && (
                      <div className="text-muted tnum" style={{ fontSize: 10.5, lineHeight: 1.3 }}>
                        {r.price_source === 'kassalapp' ? '' : 'ca. '}{kr(estimateCost(r))}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    className="stepper-btn"
                    style={{ minWidth: 40, fontSize: 20 }}
                    onClick={() => step(idx, 1)}
                    aria-label="Flere"
                  >
                    +
                  </button>
                </div>
                {/* Enheten kan rettes her: «20 dl mel» blir «2 l» med ett
                    trykk, og pakkestørrelsen faller bort når enheten ikke
                    lenger passer den — ellers ville «à ca. 400 g» hengt
                    igjen på en vare som nå måles i liter. */}
                <UnitSelect
                  value={r.unit}
                  label={`Enhet for ${r.name}`}
                  width={140}
                  onChange={(u) => {
                    const { qty, converted } = convertQty(r.qty, r.unit, u);
                    patch(idx, {
                      unit: u,
                      qty: qty ?? r.qty,
                      pack_size: converted ? r.pack_size : null,
                    });
                  }}
                />
              </div>
            </div>
          );
        })}
        {!state.length && (
          <p className="text-muted" style={{ fontSize: 13, padding: 'var(--space-4) 0', textAlign: 'center' }}>
            Ingenting å legge til.
          </p>
        )}
      </div>
    </Dialog>
  );
}
