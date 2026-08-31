import { Dialog } from './Dialog.jsx';
import { kr, longDate } from '../lib/format.js';
import { discountPercent } from '../lib/offers.js';
import { safeUrl } from '../lib/safeUrl.js';

/**
 * Kommer «førprisen» fra familiens EGEN kvitteringshistorikk (Kassalapp-
 * skannet) i stedet for fra butikken? Da er den en referanse vi selv har
 * regnet ut — ikke en rabatt butikken reklamerer med. Samme regel som i
 * Tilbud-visningen: ingen overstrøket førpris, ingen rødt rabattmerke.
 */
const ownAverage = (offer) => String(offer?.source ?? '').startsWith('Kassalapp');

/** «Torsdag 4. september» — datoer skal leses, ikke dekodes. */
const prettyDate = (iso) => {
  const s = String(iso ?? '');
  if (!s) return '';
  const d = new Date(s.includes('T') ? s : `${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? s : longDate(d);
};

/**
 * Digital tilbudsvisning — kundeavis-kortet.
 * Butikkheader, prisen som hovedsak i et eget felt, og en ærlig
 * referanselinje: butikkens førpris strykes ut, familiens egen snittpris
 * navngis i stedet for å utgi seg for å være en kampanjepris.
 * I produksjon skal «Se hos butikken» bli en eTilbudsavis-dyplenke.
 */
export function OfferCard({ offer, onClose, onAdd }) {
  const discount = discountPercent(offer);
  const own = ownAverage(offer);
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
            padding: '11px 16px',
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <span style={{
            fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 15,
            letterSpacing: '.04em', textTransform: 'uppercase',
          }}>
            {offer.store_name}
          </span>
          {offer.is_sample && (
            <span style={{ fontSize: 10, letterSpacing: '.12em', opacity: 0.72 }}>EKSEMPEL</span>
          )}
        </div>

        <div style={{ padding: 'var(--space-4)' }}>
          <div style={{
            fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 21,
            lineHeight: 1.12, letterSpacing: '-0.015em',
          }}>
            {offer.product_name}
          </div>
          {offer.brand && <div className="text-muted" style={{ fontSize: 12.5, marginTop: 4 }}>{offer.brand}</div>}

          {/* Prisfeltet — hovedsaken på kortet, samlet på varm papirbunn. */}
          <div style={{
            marginTop: 'var(--space-4)',
            background: 'var(--color-bg-sunken)',
            borderRadius: 'var(--radius)',
            padding: '14px 16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span
                className="tnum"
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 800,
                  fontSize: 42,
                  lineHeight: 1,
                  color: 'var(--color-accent)',
                  letterSpacing: '-0.03em',
                }}
              >
                {kr(offer.price)}
              </span>
              {discount > 0 && (
                /* Rødt merke = butikkens egen kampanje. Mot deres eget snitt
                   er tallet vår sammenligning, og skal se dempet ut. */
                <span className={`tag tnum ${own ? 'tag-herb' : 'tag-accent'}`}>
                  −{discount} %{own ? ' under snitt' : ''}
                </span>
              )}
            </div>

            {offer.original_price && (
              own
                ? (
                  <div style={{ fontSize: 13, marginTop: 8, lineHeight: 1.45 }}>
                    <span className="text-muted">Deres snittpris </span>
                    <span className="text-muted tnum">{kr(offer.original_price)}</span>
                    {save > 0 && (
                      <>
                        {' · '}
                        <span className="tnum" style={{ color: 'var(--color-herb-ink)', fontWeight: 700 }}>
                          {kr(save)} under snitt
                        </span>
                      </>
                    )}
                  </div>
                )
                : (
                  <div className="text-muted" style={{ fontSize: 13, marginTop: 8 }}>
                    Vanlig <s className="tnum">{kr(offer.original_price)}</s>
                    {save > 0 && (
                      <> · <span className="tnum" style={{ color: 'var(--color-honey-ink)', fontWeight: 700 }}>spar ca. {kr(save)}</span></>
                    )}
                  </div>
                )
            )}

            {offer.unit_price && (
              <div className="text-muted tnum" style={{ fontSize: 13, marginTop: 4 }}>
                {kr(offer.unit_price)} pr. {offer.unit || 'enhet'}
              </div>
            )}
          </div>

          {/* Ærlighet, med ord: hva sammenlignes prisen egentlig med? */}
          {own && offer.original_price && (
            <p className="text-muted" style={{ fontSize: 11.5, lineHeight: 1.5, margin: '10px 2px 0' }}>
              Sammenlignet med det dere selv har betalt for varen før — ikke
              med butikkens førpris.
            </p>
          )}

          <hr className="divider" style={{ margin: 'var(--space-4) 0', height: 1, background: 'var(--color-divider-soft)' }} />

          <table className="table">
            <tbody>
              {offer.valid_to && (
                <tr>
                  <td className="text-muted">Gyldig til</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{prettyDate(offer.valid_to)}</td>
                </tr>
              )}
              {offer.category && (
                <tr>
                  <td className="text-muted">Kategori</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{offer.category}</td>
                </tr>
              )}
              {offer.source && (
                <tr>
                  <td className="text-muted">Kilde</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{offer.source}</td>
                </tr>
              )}
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
            href={safeUrl(offer.source_url)}
            target="_blank"
            rel="noreferrer noopener"
          >
            Se hos {offer.store_name} ↗
          </a>
        )}
      </div>

      {offer.is_sample && (
        <p className="text-muted" style={{ fontSize: 11, marginTop: 'var(--space-3)', lineHeight: 1.5 }}>
          Dette er et eksempeltilbud som følger med oppsettet, ikke et ekte tilbud
          fra denne ukens kundeavis.
        </p>
      )}
    </Dialog>
  );
}
