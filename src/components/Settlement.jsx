import { useMemo, useState } from 'react';
import { Dialog } from './Dialog.jsx';
import { kr } from '../lib/format.js';
import { calculateSettlement } from '../lib/settlement.js';

/**
 * Oppgjør: hvem har lagt ut for hva, og hvem skylder hvem.
 *
 * Grunnlaget er hvem som krysset av hver vare — den som tar varen i
 * butikken er den som betaler for den.
 */
export function Settlement({ items, members, onClose }) {
  // Alle deler som standard, men noen kan tas ut av spleisen.
  const [splitAmong, setSplitAmong] = useState(() => members.map((m) => m.user_id));

  const result = useMemo(
    () => calculateSettlement(items, members, { splitAmong }),
    [items, members, splitAmong],
  );

  const toggle = (id) => setSplitAmong((cur) =>
    cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);

  const boughtCount = items.filter((i) => i.checked && Number(i.price) > 0).length;

  return (
    <Dialog
      title="Oppgjør"
      subtitle={`${boughtCount} ${boughtCount === 1 ? 'vare' : 'varer'} handlet`}
      onClose={onClose}
    >
      <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
        <div className="card-kicker">Totalt handlet</div>
        <div style={{
          fontFamily: 'var(--font-heading)', fontWeight: 800,
          fontSize: 30, letterSpacing: '-0.02em', lineHeight: 1,
        }}>
          {kr(result.total)}
        </div>
        <div className="card-body">
          {splitAmong.length > 0
            ? <>{kr(result.share)} per person, delt på {splitAmong.length}</>
            : 'Ingen er med på spleisen'}
        </div>
        {result.unassigned > 0 && (
          <div className="card-meta">
            {kr(result.unassigned)} mangler kjøper — varer krysset av før vi
            begynte å registrere hvem, eller av noen som har forlatt listen.
            Beløpet er med i totalen.
          </div>
        )}
      </div>

      <div className="section-head" style={{ paddingLeft: 0, paddingRight: 0 }}>
        <span className="section-title">Hvem har lagt ut</span>
      </div>

      {result.balances.map((b) => (
        <div key={b.user_id} className="item-row" style={{ paddingLeft: 0, paddingRight: 0 }}>
          <input
            type="checkbox"
            className="checkbox"
            checked={splitAmong.includes(b.user_id)}
            onChange={() => toggle(b.user_id)}
            aria-label={`${b.display_name} er med på spleisen`}
          />
          <div className="item-mid">
            <div className="item-name">{b.display_name}</div>
            <div className="item-sub">
              handlet for {kr(b.spent)}
              {splitAmong.includes(b.user_id) && <> · skal betale {kr(b.share)}</>}
            </div>
          </div>
          <div style={{ textAlign: 'right', minWidth: 84 }}>
            {Math.abs(b.balance) < 0.01 ? (
              <span className="text-muted" style={{ fontSize: 12 }}>i null</span>
            ) : (
              <>
                <div style={{
                  fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 14,
                  color: b.balance > 0 ? 'var(--color-success)' : 'var(--color-accent)',
                }}>
                  {b.balance > 0 ? '+' : ''}{kr(b.balance)}
                </div>
                <div className="text-muted" style={{ fontSize: 10 }}>
                  {b.balance > 0 ? 'til gode' : 'skylder'}
                </div>
              </>
            )}
          </div>
        </div>
      ))}

      <p className="text-muted" style={{ fontSize: 11, marginTop: 'var(--space-2)' }}>
        Hak av hvem som skal være med på spleisen. Den som ikke er med,
        betaler bare det hen selv har handlet for.
      </p>

      {result.transfers.length > 0 && (
        <>
          <hr className="divider" style={{ margin: 'var(--space-4) 0 0', height: 1, background: 'var(--color-divider-soft)' }} />
          <div className="section-head" style={{ paddingLeft: 0, paddingRight: 0 }}>
            <span className="section-title">Slik gjør dere opp</span>
          </div>
          {result.transfers.map((t, i) => (
            <div key={`${t.from_id}-${t.to_id}-${i}`} className="item-row" style={{ paddingLeft: 0, paddingRight: 0 }}>
              <div className="item-mid">
                <div className="item-name">
                  {t.from} → {t.to}
                </div>
              </div>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 15 }}>
                {kr(t.amount)}
              </div>
            </div>
          ))}
          <p className="text-muted" style={{ fontSize: 11, marginTop: 'var(--space-2)' }}>
            Færrest mulig overføringer for å få alle i null.
          </p>
        </>
      )}

      {result.total === 0 && (
        <p className="text-muted" style={{ fontSize: 13, marginTop: 'var(--space-3)' }}>
          Ingenting å gjøre opp ennå. Priser må ligge på varene, og noen må ha
          krysset dem av.
        </p>
      )}
    </Dialog>
  );
}
