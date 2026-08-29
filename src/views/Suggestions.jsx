import { useMemo, useState } from 'react';
import { ReviewDialog } from '../components/ReviewDialog.jsx';
import { estimatedTotal, kr } from '../lib/format.js';
import { guessUnit } from '../lib/catalog.js';

/**
 * Forslag: tidligere lister, varer dere kjøper igjen og igjen, og ukens tilbud.
 * Alle «legg til»-flyter går gjennom den samme gjennomgangsdialogen.
 */
export function Suggestions({ trips, catalog, offers, existingNames, defaultStore, onSendToList }) {
  const [review, setReview] = useState(null);

  // Varer med tydelig frekvenssignal som ikke ligger på listen nå.
  const repeats = useMemo(() => catalog
    .filter((c) => /Ofte|Svært ofte/.test(c.frequency_sig || ''))
    .filter((c) => !existingNames.has(c.name.toLowerCase()))
    .slice(0, 24), [catalog, existingNames]);

  const [showAllRepeats, setShowAllRepeats] = useState(false);
  const visibleRepeats = showAllRepeats ? repeats : repeats.slice(0, 8);

  const toRow = (c) => ({
    name: c.name,
    qty: 1,
    unit: guessUnit(c.name, c.major_category),
    category: c.major_category || 'Annet',
    store: c.primary_store || defaultStore,
    price: c.avg_price ?? null,
    price_source: c.avg_price ? 'receipt' : null,
  });

  return (
    <div>
      {/* Tidligere lister */}
      <div className="section-head"><span className="section-title">Bruk en av dine tidligere lister</span></div>
      {trips.length === 0 && (
        <p className="text-muted" style={{ padding: '0 var(--space-4) var(--space-3)', fontSize: 13 }}>
          Ingen lagrede lister ennå. Kryss av «Lagre handlelisten» når du fullfører en handletur.
        </p>
      )}
      {trips.map((t) => {
        const total = estimatedTotal(t.items ?? []);
        return (
          <div key={t.id} className="item-row" style={{ alignItems: 'flex-start' }}>
            <div className="item-mid">
              <div className="item-name">{t.name}</div>
              <div className="item-sub">
                {(t.items ?? []).length} varer · {t.trip_date} · {total.label}
              </div>
              <div className="item-sub">
                {(t.items ?? []).slice(0, 4).map((i) => i.name).join(', ')}
                {(t.items ?? []).length > 4 ? ' …' : ''}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setReview({
                title: t.name,
                rows: (t.items ?? []).map((i) => ({ ...i, qty: Number(i.qty) || 1 })),
              })}
            >
              Bruk listen
            </button>
          </div>
        );
      })}

      {/* Gjentaksvarer */}
      <hr className="divider" style={{ marginTop: 'var(--space-4)' }} />
      <div className="section-head">
        <span className="section-title">{repeats.length} varer dere kjøper igjen og igjen</span>
      </div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6, padding: '0 var(--space-4)' }}>
        {visibleRepeats.map((c) => <span key={c.name} className="tag tag-outline">{c.name}</span>)}
        {!showAllRepeats && repeats.length > 8 && (
          <button type="button" className="tag tag-button tag-neutral" onClick={() => setShowAllRepeats(true)}>
            +{repeats.length - 8} flere
          </button>
        )}
      </div>
      {repeats.length > 0 && (
        <div style={{ padding: 'var(--space-3) var(--space-4)' }}>
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={() => setReview({ title: 'Varer dere kjøper ofte', rows: repeats.map(toRow) })}
          >
            Gjennomgå og legg til
          </button>
        </div>
      )}

      {/* Ukens tilbud */}
      {offers.length > 0 && (
        <>
          <hr className="divider" />
          <div className="section-head"><span className="section-title">Ukens relevante tilbud</span></div>
          {offers.slice(0, 3).map((o) => (
            <div key={o.id} className="item-row">
              <div className="item-mid">
                <div className="item-name">{o.product_name}</div>
                <div className="item-sub">
                  {o.store_name} · {kr(o.price)}
                  {o.original_price && <> <s>{kr(o.original_price)}</s></>}
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      {review && (
        <ReviewDialog
          title={review.title}
          subtitle="Alt er avhuket — fjern det dere ikke trenger"
          rows={review.rows}
          existingNames={existingNames}
          onCancel={() => setReview(null)}
          onSubmit={async (rows) => { await onSendToList(rows); setReview(null); }}
        />
      )}
    </div>
  );
}
