import { useMemo, useState } from 'react';
import { Pencil } from 'lucide-react';
import { Dialog } from '../components/Dialog.jsx';
import { weekdayName } from '../lib/format.js';
import {
  dietHistogram, suggestRules, ruleTitle, ruleDescription, ruleChip,
} from '../lib/rulesInsights.js';

const RULE_TYPES = [
  { value: 'min', label: 'Minst så mange ganger i uka' },
  { value: 'max', label: 'Høyst så mange ganger i uka' },
  { value: 'interval', label: 'Omtrent hver N. uke' },
  { value: 'weekday', label: 'På bestemte ukedager' },
];

// Avviste forslag skal ikke mase igjen — huskes per enhet.
const DISMISS_KEY = 'fl-rule-dismissed-v1';
const loadDismissed = () => {
  try { return JSON.parse(localStorage.getItem(DISMISS_KEY)) || []; } catch { return []; }
};

/* Én regel i listen. Ligger på modulnivå så React ikke remonterer alle
   radene for hver render av Rules. */
function RuleRow({ rule, onEdit, onToggle, onDelete }) {
  return (
    <div
      className="item-row"
      style={{ alignItems: 'flex-start', opacity: rule.enabled ? 1 : 0.6 }}
    >
      <div className="item-mid" style={{ cursor: 'default' }}>
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 14, letterSpacing: '-0.01em' }}>{ruleTitle(rule)}</div>
        <div className="item-sub">{ruleDescription(rule)}</div>
        <span className="tag" style={{
          marginTop: 6,
          background: 'var(--color-accent-100)',
          borderColor: 'var(--color-accent-100)',
          color: 'var(--color-accent-700)',
        }}>
          {ruleChip(rule)}
        </span>
      </div>
      <div className="stack" style={{ gap: 4, alignItems: 'stretch' }}>
        <button type="button" className="btn btn-sm" onClick={() => onEdit(rule)}>
          <Pencil size={12} /> Endre
        </button>
        <button
          type="button"
          className={`btn btn-sm ${rule.enabled ? 'btn-primary' : ''}`}
          onClick={() => onToggle(rule)}
          aria-pressed={rule.enabled}
        >
          {rule.enabled ? 'På' : 'Av'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDelete(rule)}>Slett</button>
      </div>
    </div>
  );
}

export function Rules({ rules, meals, history, onSave, onToggle, onDelete, toast }) {
  const [editing, setEditing] = useState(null);
  const [dismissed, setDismissed] = useState(loadDismissed);

  const histogram = useMemo(() => dietHistogram(history, meals), [history, meals]);
  const maxCount = histogram[0]?.count ?? 1;

  const suggestions = useMemo(
    () => suggestRules(history, meals, rules).filter((s) => !dismissed.includes(s.id)),
    [history, meals, rules, dismissed],
  );

  const active = rules.filter((r) => r.enabled);
  const inactive = rules.filter((r) => !r.enabled);

  const dismiss = (id) => {
    const next = [...dismissed, id];
    setDismissed(next);
    try { localStorage.setItem(DISMISS_KEY, JSON.stringify(next)); } catch { /* ignorer */ }
  };

  const acceptSuggestion = async (s) => {
    await onSave({ scope: s.scope, rule_type: s.rule_type, amount: s.amount, weekdays: s.weekdays, enabled: true });
    toast(`Regelen «${s.title}» er lagt til`);
  };

  // Sletting med angre, som overalt ellers. onSave uten id lager regelen
  // på nytt — den får ny id, men samme innhold.
  const deleteRule = async (rule) => {
    await onDelete(rule.id);
    toast(`Regelen «${ruleTitle(rule)}» slettet`, () => onSave({
      scope: rule.scope, rule_type: rule.rule_type, amount: rule.amount,
      weekdays: rule.weekdays ?? [], enabled: rule.enabled ?? true,
    }));
  };

  return (
    <div>
      <div className="section-head" style={{ alignItems: 'flex-start' }}>
        <div>
          <h4 style={{ fontSize: 19, margin: 0 }}>Middagsregler</h4>
          <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>
            {active.length} aktive · {rules.length} totalt
          </div>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => setEditing({ scope: '', rule_type: 'min', amount: 2, weekdays: [], enabled: true })}
        >
          + Ny regel
        </button>
      </div>

      {/* ---------- Kosthold siste 4 uker ---------- */}
      <hr className="divider" />
      <div className="section-head" style={{ paddingTop: 'var(--space-3)' }}>
        <span className="section-title">Kosthold siste 4 uker</span>
      </div>
      {histogram.length === 0 ? (
        <p className="text-muted" style={{ padding: '0 var(--space-4) var(--space-4)', fontSize: 13, margin: 0 }}>
          Ingen middagshistorikk ennå. Diagrammet fylles etter hvert som
          planlagte middager passerer — fra og med i dag teller dagens middag med.
        </p>
      ) : (
        <>
          <div style={{ padding: '0 var(--space-4) var(--space-4)' }}>
            {histogram.map(({ label, count }) => (
              <div key={label} className="row" style={{ gap: 10, padding: '5px 0' }}>
                <span style={{ minWidth: 80, fontSize: 12, fontWeight: 500, flexShrink: 0 }}>{label}</span>
                <div style={{ flex: 1, height: 9, background: 'var(--color-bg-sunken)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                  <div style={{
                    width: `${Math.max(6, (count / maxCount) * 100)}%`,
                    height: '100%',
                    background: 'var(--color-accent)',
                    borderRadius: 'var(--radius-full)',
                  }} />
                </div>
                <span className="text-muted tnum" style={{ width: 62, fontSize: 11, textAlign: 'right', flexShrink: 0 }}>
                  {count} {count === 1 ? 'gang' : 'ganger'}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ---------- Foreslåtte regler ---------- */}
      {suggestions.length > 0 && (
        <>
          <hr className="divider" />
          <div className="section-head" style={{ paddingTop: 'var(--space-3)' }}>
            <span className="section-title">Foreslåtte regler</span>
          </div>
          <p className="text-muted" style={{ padding: '0 var(--space-4) var(--space-2)', fontSize: 12, margin: 0 }}>
            Basert på middagshistorikk og handlemønster.
          </p>
          {suggestions.map((s) => (
            <div key={s.id} className="item-row" style={{ alignItems: 'flex-start' }}>
              <div className="item-mid" style={{ cursor: 'default' }}>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 14, letterSpacing: '-0.01em' }}>{s.title}</div>
                <div className="item-sub">{s.reason}</div>
              </div>
              <div className="stack" style={{ gap: 4 }}>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => acceptSuggestion(s)}>
                  Legg til
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => dismiss(s.id)}>
                  Avvis
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {/* ---------- Aktive regler ---------- */}
      <hr className="divider" />
      <div className="section-head" style={{ paddingTop: 'var(--space-3)' }}>
        <span className="section-title">Aktive regler</span>
        <span className="text-muted" style={{ fontSize: 11 }}>{active.length}</span>
      </div>
      {active.length === 0 && (
        <p className="text-muted" style={{ padding: '0 var(--space-4)', fontSize: 13 }}>
          Ingen aktive regler. Regler styrer «Foreslå ny ukemeny» — f.eks. fisk to ganger i uka.
        </p>
      )}
      {active.map((r) => (
        <RuleRow key={r.id} rule={r} onEdit={setEditing} onToggle={onToggle} onDelete={deleteRule} />
      ))}

      {/* ---------- Inaktive ---------- */}
      {/* Alltid synlig, også tom — ellers er det ikke å oppdage at en regel
          kan slås av og tas vare på i stedet for å slettes. */}
      <hr className="divider" />
      <div className="section-head" style={{ paddingTop: 'var(--space-3)' }}>
        <span className="section-title">Inaktive regler</span>
        <span className="text-muted" style={{ fontSize: 11 }}>{inactive.length}</span>
      </div>
      {inactive.length === 0 ? (
        <p className="text-muted" style={{ padding: '0 var(--space-4) var(--space-4)', fontSize: 13 }}>
          Ingen inaktive regler. Slå av en regel med «På»-knappen, så havner
          den her — klar til å skrus på igjen, i stedet for å slettes.
        </p>
      ) : (
        inactive.map((r) => (
          <RuleRow key={r.id} rule={r} onEdit={setEditing} onToggle={onToggle} onDelete={deleteRule} />
        ))
      )}

      {editing && (
        <RuleDialog
          rule={editing}
          onClose={() => setEditing(null)}
          onSave={async (r) => { await onSave(r); setEditing(null); }}
          onDelete={editing.id ? async () => { await deleteRule(editing); setEditing(null); } : null}
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

  const amountLabel = {
    min: 'Antall ganger i uka',
    max: 'Antall ganger i uka',
    interval: 'Antall uker mellom hver gang',
  }[type];

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
        <span className="text-muted" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
          Matcher kategori, middagsnavn eller ingrediens.
        </span>
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
          <span className="field-label">{amountLabel}</span>
          <input className="input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
      )}
    </Dialog>
  );
}
