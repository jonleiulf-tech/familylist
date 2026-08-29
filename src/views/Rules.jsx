import { useState } from 'react';
import { Dialog } from '../components/Dialog.jsx';
import { weekdayName } from '../lib/format.js';

const RULE_TYPES = [
  { value: 'min', label: 'Minst så mange ganger i uka' },
  { value: 'max', label: 'Høyst så mange ganger i uka' },
  { value: 'weekday', label: 'På bestemte ukedager' },
];

export function Rules({ rules, onSave, onToggle, onDelete }) {
  const [editing, setEditing] = useState(null);

  const describe = (r) => {
    if (r.rule_type === 'weekday') {
      const days = (r.weekdays ?? []).map(weekdayName).join(', ');
      return days ? `${r.scope} på ${days}` : `${r.scope} — ingen dager valgt`;
    }
    const word = r.rule_type === 'min' ? 'minst' : 'høyst';
    return `${r.scope} ${word} ${r.amount} ${r.amount === 1 ? 'gang' : 'ganger'} i uka`;
  };

  return (
    <div>
      <div className="section-head">
        <span className="section-title">Middagsregler</span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setEditing({ scope: '', rule_type: 'min', amount: 2, weekdays: [], enabled: true })}
        >
          + Ny regel
        </button>
      </div>

      {rules.length === 0 && (
        <p className="text-muted" style={{ padding: '0 var(--space-4)', fontSize: 13 }}>
          Ingen regler ennå. Regler styrer «Generer plan» — f.eks. fisk to ganger i uka.
        </p>
      )}

      {rules.map((r) => (
        <div key={r.id} className="item-row">
          <input
            type="checkbox"
            className="checkbox"
            checked={r.enabled}
            onChange={() => onToggle(r)}
            aria-label={`Slå ${r.enabled ? 'av' : 'på'} regelen ${r.scope}`}
          />
          <button type="button" className="item-mid" onClick={() => setEditing(r)}>
            <div className="item-name">{describe(r)}</div>
            <div className="item-sub">{r.enabled ? 'Aktiv' : 'Av'}</div>
          </button>
        </div>
      ))}

      {editing && (
        <RuleDialog
          rule={editing}
          onClose={() => setEditing(null)}
          onSave={async (r) => { await onSave(r); setEditing(null); }}
          onDelete={editing.id ? async () => { await onDelete(editing.id); setEditing(null); } : null}
        />
      )}
    </div>
  );
}

function RuleDialog({ rule, onClose, onSave, onDelete }) {
  const [scope, setScope] = useState(rule.scope ?? '');
  const [type, setType] = useState(rule.rule_type ?? 'min');
  const [amount, setAmount] = useState(String(rule.amount ?? 1));
  const [days, setDays] = useState(rule.weekdays ?? []);

  const toggleDay = (d) =>
    setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()));

  return (
    <Dialog
      title={rule.id ? 'Rediger regel' : 'Ny regel'}
      onClose={onClose}
      footer={
        <div className="row" style={{ gap: 8 }}>
          <button
            type="button"
            className="btn btn-primary"
            style={{ flex: 1 }}
            disabled={!scope.trim()}
            onClick={() => onSave({
              ...rule,
              scope: scope.trim(),
              rule_type: type,
              amount: Number(amount) || 1,
              weekdays: type === 'weekday' ? days : [],
            })}
          >
            Lagre
          </button>
          {onDelete && <button type="button" className="btn" onClick={onDelete}>Slett</button>}
        </div>
      }
    >
      <label className="field">
        <span className="field-label">Gjelder</span>
        <input
          className="input" placeholder="Fisk, Taco, Kylling …"
          value={scope} onChange={(e) => setScope(e.target.value)}
        />
      </label>

      <label className="field">
        <span className="field-label">Type</span>
        <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
          {RULE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </label>

      {type === 'weekday' ? (
        <div className="field">
          <span className="field-label">Ukedager</span>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <button
                key={d}
                type="button"
                className={`tag tag-button ${days.includes(d) ? 'tag-accent' : 'tag-outline'}`}
                onClick={() => toggleDay(d)}
              >
                {weekdayName(d)}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <label className="field">
          <span className="field-label">Antall ganger i uka</span>
          <input className="input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
      )}
    </Dialog>
  );
}
