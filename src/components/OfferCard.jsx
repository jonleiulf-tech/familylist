import { Dialog } from './Dialog.jsx';
import { kr } from '../lib/format.js';
import { discountPercent } from '../lib/offers.js';

/**
 * Digital tilbudsvisning — kundeavis-kortet.
 * Butikkheader, stor pris, førpris gjennomstreket, enhetspris og gyldighet.
 * I produksjon skal «Se hos butikken» bli en eTilbudsavis-dyplenke.
 */
export function OfferCard({ offer, onClose, onAdd }) {
  const discount = discountPercent(offer);
  const save = offer.original_price ? Number(offer.original_price) - Number(offer.price) : 0;

  return (
    <Dialog title={offer.store_name || 'Tilbud'} onClose={onClose}>
      <div
        style={{
          border: '1px solid var(--color-divider)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-sm)',
          background: 'var(--color-surface)',
        }}
      >
        {/* Butikkheader */}
        <div
          style={{
            background: 'var(--color-text)',
            color: 'var(--color-text-inverse)',
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 15, letterSpacing: '.02em' }}>
            {offer.store_name}
          </span>
          {offer.is_sample && <span style={{ fontSize: 10, opacity: 0.75 }}>EKSEMPEL</span>}
        </div>

        <div style={{ padding: 'var(--space-4)' }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20, lineHeight: 1.15 }}>
            {offer.product_name}
          </div>
          {offer.brand && <div className="text-muted" style={{ fontSize: 12, marginTop: 3 }}>{offer.brand}</div>}

          {/* Stor pris */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 'var(--space-4)' }}>
            <span
              className="tnum"
              style={{
                fontFamily: 'var(--font-heading)',
                fontWeight: 800,
                fontSize: 40,
                lineHeight: 1,
                color: 'var(--color-accent)',
                letterSpacing: '-0.03em',
              }}
            >
              {kr(offer.price)}
            </span>
            {discount > 0 && <span className="tag tag-accent">−{discount} %</span>}
          </div>

          {offer.original_price && (
            <div className="text-muted" style={{ fontSize: 13, marginTop: 6 }}>
              Vanlig <s className="tnum">{kr(offer.original_price)}</s>
              {save > 0 && (
                <> · <span className="tnum" style={{ color: 'var(--color-honey)', fontWeight: 700 }}>spar ca. {kr(save)}</span></>
              )}
            </div>
          )}

          {offer.unit_price && (
            <div className="text-muted tnum" style={{ fontSize: 13, marginTop: 4 }}>
              {kr(offer.unit_price)} pr. {offer.unit || 'enhet'}
            </div>
          )}

          <hr className="divider" style={{ margin: 'var(--space-4) 0', height: 1, background: 'var(--color-divider-soft)' }} />

          <table className="table">
            <tbody>
              {offer.valid_to && <tr><td>Gyldig til</td><td>{offer.valid_to}</td></tr>}
              {offer.category && <tr><td>Kategori</td><td>{offer.category}</td></tr>}
              {offer.source && <tr><td>Kilde</td><td>{offer.source}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="stack" style={{ marginTop: 'var(--space-4)' }}>
        <button type="button" className="btn btn-primary btn-block" onClick={onAdd}>
          Legg til på handlelisten
        </button>
        {offer.source_url && (
          <a
            className="btn btn-block"
            href={offer.source_url}
            target="_blank"
            rel="noreferrer noopener"
          >
            Se hos {offer.store_name} ↗
          </a>
        )}
      </div>

      {offer.is_sample && (
        <p className="text-muted" style={{ fontSize: 11, marginTop: 'var(--space-3)' }}>
          Dette er et eksempeltilbud som følger med oppsettet, ikke et ekte tilbud
          fra denne ukens kundeavis.
        </p>
      )}
    </Dialog>
  );
}
