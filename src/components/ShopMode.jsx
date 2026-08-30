import { useEffect, useMemo, useRef } from 'react';
import { X, Check, Sparkles } from 'lucide-react';
import { sortShoppingItems } from '../lib/sortItems.js';
import { kr, estimatedTotal, qtyDetail, estimateCost } from '../lib/format.js';

/**
 * Butikkmodus: fullskjerm for selve handleturen, med én hånd på vogna.
 * Store trykkflater (hele raden), skjermen holdes våken, og varene står i
 * butikkens lærte plukk-rekkefølge. Avhuking gir et lite vibrasjonsdult.
 */

// Myk bakgrunnstone per kategori: samme varetype får samme farge hver tur,
// og annenhver rad er litt lysere — lett å se hvor man skal trykke.
// Én sammenhengende, varm palett i slekt med papiret (--color-bg): dempede
// vasker av tomat, honning, urtegrønn og varm nøytral — ingen kalde blå/lilla
// toner. Distinkte nok til å skille kategorier, rolige nok til å høre sammen.
const ROW_TINTS = [
  '#f7e7de', '#f6ecd9', '#eaeed9', '#f1e9dc',
  '#f4e6dd', '#e7ecdb', '#f6ead2', '#f2e6e0',
];

const tintFor = (category) => {
  const s = String(category ?? 'Annet');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) % 997;
  return ROW_TINTS[h % ROW_TINTS.length];
};

/** Annenhver rad i samme kategori tones litt ned (hex-alpha over hvit). */
const rowBg = (category, i) => (i % 2 === 0 ? tintFor(category) : `${tintFor(category)}66`);
export function ShopMode({
  items, stores, activeStore, onPickStore,
  positionOf, hasLearnedFor, defaultStore,
  onToggle, onComplete, onClose,
}) {
  const open = items.filter((i) => !i.checked);
  const picked = items.filter((i) => i.checked);
  const total = estimatedTotal(items);

  const groups = useMemo(
    () => sortShoppingItems(open, 'plukk', { positionOf, defaultStore, currentStore: activeStore }),
    [open, positionOf, defaultStore, activeStore],
  );

  // Skjermen skal ikke slukne midt mellom hyllene. Wake lock slippes av
  // nettleseren ved fanebytte, så vi ber om den igjen når appen er tilbake.
  const lockRef = useRef(null);
  useEffect(() => {
    let alive = true;
    const acquire = async () => {
      try {
        if (alive && document.visibilityState === 'visible') {
          lockRef.current = await navigator.wakeLock?.request('screen');
        }
      } catch { /* lav batteristatus o.l. — modusen virker uansett */ }
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', acquire);
      lockRef.current?.release?.().catch(() => {});
    };
  }, []);

  const pick = (item) => {
    navigator.vibrate?.(12);
    onToggle(item);
  };

  return (
    <div
      role="dialog"
      aria-label="Butikkmodus"
      style={{
        position: 'fixed', inset: 0, zIndex: 80,
        background: 'var(--color-bg)',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Topp: butikkvelger + lukk */}
      <div style={{ padding: '12px var(--space-4) 8px', borderBottom: '1px solid var(--color-divider)', background: 'var(--color-surface)', boxShadow: 'var(--shadow-sm)' }}>
        <div className="row-between" style={{ marginBottom: 8 }}>
          <div>
            <div className="card-kicker" style={{ marginBottom: 0 }}>Butikkmodus</div>
            <div className="tnum" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20, letterSpacing: '-0.02em', color: 'var(--color-text)' }}>
              {open.length === 0
                ? 'Alt plukket!'
                : `${open.length} igjen${total.sum > 0 ? ` · ca. ${kr(Math.round(total.sum))}` : ''}`}
            </div>
          </div>
          <button type="button" className="btn btn-icon" onClick={onClose} aria-label="Avslutt butikkmodus">
            <X size={20} />
          </button>
        </div>
        <div className="row" style={{ gap: 6, overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 2 }}>
          {stores.map((st) => (
            <button
              key={st.code}
              type="button"
              className={`tag tag-button ${activeStore === st.name ? 'tag-accent' : 'tag-outline'}`}
              style={{ flexShrink: 0 }}
              onClick={() => onPickStore(st.name)}
              aria-pressed={activeStore === st.name}
            >
              {st.name}
            </button>
          ))}
        </div>
        <div className="row" style={{ gap: 5, marginTop: 6 }}>
          <Sparkles size={11} color={hasLearnedFor(activeStore) ? 'var(--color-herb)' : 'var(--color-honey)'} aria-hidden="true" />
          <span className="text-muted" style={{ fontSize: 11 }}>
            {hasLearnedFor(activeStore)
              ? `Sortert i ruta deres på ${activeStore}`
              : `Fullfør en tur på ${activeStore}, så lærer lista ruta deres`}
          </span>
        </div>
      </div>

      {/* Selve lista — store trykkflater, hele raden huker av */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {groups.map(({ key, label, rows }) => (
          <section key={key}>
            {label && groups.length > 1 && (
              <div className="section-head" style={{ paddingTop: 12, paddingBottom: 2 }}>
                <span className="section-title" style={{ fontSize: 12 }}>{label}</span>
                <span className="text-muted" style={{ fontSize: 11 }}>{rows.length}</span>
              </div>
            )}
            {rows.map((item, i) => (
              <button
                key={item.id}
                type="button"
                onClick={() => pick(item)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, width: '100%',
                  minHeight: 64, padding: '10px var(--space-4)',
                  background: rowBg(item.category, i),
                  border: 'none', borderBottom: '1px solid rgba(74, 54, 38, 0.07)',
                  textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                    background: 'var(--color-surface)',
                    border: '2.5px solid var(--color-divider-strong)',
                    boxShadow: 'inset 0 1px 2px rgba(74, 54, 38, 0.08)',
                  }}
                />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 18, fontWeight: 600, lineHeight: 1.25 }}>
                    {item.name}
                  </span>
                  {(item.is_offer || item.price || qtyDetail(item.qty, item.unit, item.pack_size)) && (
                    <span className="text-muted" style={{ display: 'block', fontSize: 13, marginTop: 2 }}>
                      {[
                        item.is_offer ? 'tilbud' : null,
                        qtyDetail(item.qty, item.unit, item.pack_size),
                        item.price && estimateCost(item) > 0 ? `ca. ${kr(Math.round(estimateCost(item)))}` : null,
                      ].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </span>
                {/* Mengden som egen tydelig pille — det man faktisk skal se ved hylla */}
                <span className="tnum" style={{
                  flexShrink: 0, background: 'var(--color-surface)',
                  border: '1.5px solid var(--color-divider-strong)', borderRadius: 'var(--radius-full)',
                  padding: '7px 13px', whiteSpace: 'nowrap', color: 'var(--color-text)',
                  fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16,
                  letterSpacing: '-0.01em', boxShadow: 'var(--shadow-sm)',
                }}>
                  {item.qty} {item.unit}
                </span>
              </button>
            ))}
          </section>
        ))}

        {open.length === 0 && (
          <p style={{ padding: 'var(--space-5) var(--space-4)', fontSize: 16, textAlign: 'center' }}>
            🎉 Alt er plukket — fullfør turen under.
          </p>
        )}

        {picked.length > 0 && (
          <section style={{ opacity: 0.55, paddingBottom: 90 }}>
            <div className="section-head" style={{ paddingTop: 14 }}>
              <span className="section-title" style={{ fontSize: 12 }}>Plukket</span>
              <span className="text-muted" style={{ fontSize: 11 }}>{picked.length}</span>
            </div>
            {picked.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => pick(item)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, width: '100%',
                  minHeight: 48, padding: '6px var(--space-4)',
                  background: 'none', border: 'none', textAlign: 'left',
                  cursor: 'pointer', font: 'inherit', color: 'inherit',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                    background: 'var(--color-herb)', display: 'grid', placeItems: 'center',
                  }}
                >
                  <Check size={15} color="var(--color-text-inverse)" />
                </span>
                <span style={{ fontSize: 15, textDecoration: 'line-through' }}>{item.name}</span>
              </button>
            ))}
          </section>
        )}
      </div>

      {/* Bunn: fullfør */}
      <div style={{
        padding: '10px var(--space-4) calc(12px + env(safe-area-inset-bottom))',
        borderTop: '1px solid var(--color-divider)', background: 'var(--color-surface)',
        boxShadow: '0 -2px 12px rgba(74, 54, 38, 0.06)',
      }}>
        <button
          type="button"
          className="btn btn-primary btn-block"
          style={{ minHeight: 52, fontSize: 16 }}
          disabled={!picked.length}
          onClick={onComplete}
        >
          <Check size={18} /> Fullfør handletur ({picked.length} plukket)
        </button>
      </div>
    </div>
  );
}
