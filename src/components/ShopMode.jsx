import { useEffect, useMemo, useRef } from 'react';
import { X, Check, Sparkles } from 'lucide-react';
import { sortShoppingItems } from '../lib/sortItems.js';
import { kr, estimatedTotal } from '../lib/format.js';

/**
 * Butikkmodus: fullskjerm for selve handleturen, med én hånd på vogna.
 * Store trykkflater (hele raden), skjermen holdes våken, og varene står i
 * butikkens lærte plukk-rekkefølge. Avhuking gir et lite vibrasjonsdult.
 */
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
      <div style={{ padding: '12px var(--space-4) 8px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
        <div className="row-between" style={{ marginBottom: 8 }}>
          <div>
            <div className="card-kicker" style={{ marginBottom: 0 }}>Butikkmodus</div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20, letterSpacing: '-0.02em' }}>
              {open.length === 0 ? 'Alt plukket!' : `${open.length} igjen · ${total.label}`}
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
          <Sparkles size={11} color="var(--color-accent)" aria-hidden="true" />
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
            {rows.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => pick(item)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, width: '100%',
                  minHeight: 64, padding: '10px var(--space-4)',
                  background: 'none', border: 'none', borderBottom: '1px solid var(--color-border)',
                  textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                    border: '2.5px solid var(--color-border-strong, var(--color-border))',
                  }}
                />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 18, fontWeight: 600, lineHeight: 1.25 }}>
                    {item.name}
                  </span>
                  <span className="text-muted" style={{ display: 'block', fontSize: 13, marginTop: 2 }}>
                    {item.qty} {item.unit}
                    {item.is_offer ? ' · tilbud' : ''}
                    {item.price ? ` · ca. ${kr(Math.round(item.price * (item.qty || 1)))}` : ''}
                  </span>
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
                    background: 'var(--color-accent)', display: 'grid', placeItems: 'center',
                  }}
                >
                  <Check size={15} color="#fff" />
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
        borderTop: '1px solid var(--color-border)', background: 'var(--color-surface)',
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
