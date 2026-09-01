import { CreditCard } from 'lucide-react';
import { needsAttention } from '../lib/billing.js';

/**
 * Ett smalt bånd øverst når abonnementet krever en handling.
 *
 * Vises bare når det faktisk er noe å gjøre — et abonnement som løper
 * videre er ingen nyhet, og et bånd man ser hver dag er et bånd man
 * slutter å se.
 */
export function BillingBanner({ state, onOpen }) {
  if (!needsAttention(state)) return null;
  const stengt = state.tone === 'stengt';

  return (
    <button
      type="button"
      onClick={onOpen}
      className="row"
      style={{
        width: '100%', gap: 10, textAlign: 'left', cursor: 'pointer',
        padding: '10px var(--gutter)',
        border: 'none', borderBottom: '1px solid var(--color-divider)',
        background: stengt ? 'var(--color-accent-100, #fdecea)' : 'var(--color-honey-100)',
        color: 'var(--color-text)',
      }}
    >
      <CreditCard size={15} style={{ flexShrink: 0, color: 'var(--color-text-muted)' }} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 1.45 }}>
        <strong>{state.title}.</strong>{' '}
        <span className="text-muted">{state.detail}</span>
      </span>
      <span className="tag tag-outline" style={{ flexShrink: 0 }}>Se</span>
    </button>
  );
}
