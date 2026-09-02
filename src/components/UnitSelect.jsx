import { UNIT_OPTIONS, normalizeUnit } from '../lib/units.js';

/**
 * Liten enhetsvelger til høyre for mengden: kg, hg, g, l, dl, ml, ss, ts,
 * stk, pakke … Bygget på en vanlig <select> med vilje — mobilen gir da sin
 * egen hjulvelger, som er raskere å treffe enn en egenlaget liste, og den
 * virker med tastatur og skjermleser uten ekstra kode.
 *
 * Enheten varen har fra før beholdes i listen selv om den ikke er en av
 * standardvalgene («porsjon», «klype»), slik at et bytte aldri er
 * påtvunget.
 */
export function UnitSelect({
  value, onChange, label = 'Enhet', width = 74, disabled = false, style,
}) {
  const raw = String(value ?? '').trim();
  const current = normalizeUnit(raw) ?? (raw || '');
  const extra = current && !UNIT_OPTIONS.some((o) => o.value === current)
    ? [{ value: current, label: current }]
    : [];

  return (
    <select
      className="input"
      aria-label={label}
      disabled={disabled}
      value={current}
      onChange={(e) => onChange(e.target.value || null)}
      style={{
        width, flex: 'none', minWidth: 0, padding: '8px 4px',
        fontSize: 12.5, textAlign: 'center', textAlignLast: 'center',
        ...style,
      }}
    >
      {!current && <option value="">enhet</option>}
      {[...extra, ...UNIT_OPTIONS].map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
