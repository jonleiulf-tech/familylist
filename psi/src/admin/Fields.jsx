import { getPath, setPath } from './schema.js';

const DAYS = ['', 'Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'];

export function Form({ fields, value, onChange }) {
  return (
    <div className="form">
      {fields.map((f) => (
        <Field key={f.key} field={f} value={getPath(value, f.key)} onChange={(v) => onChange(setPath(value, f.key, v))} />
      ))}
    </div>
  );
}

/* Tekstfelt på to språk. Godtar også en ren streng fra fila (blir nb). */
function Bi({ id, value, onChange, multiline }) {
  const v = typeof value === 'string' ? { nb: value, en: '' } : value || { nb: '', en: '' };
  const Tag = multiline ? 'textarea' : 'input';
  return (
    <div className="bi">
      <label><small>Norsk</small><Tag id={id} value={v.nb || ''} onChange={(e) => onChange({ ...v, nb: e.target.value })} /></label>
      <label><small>English</small><Tag value={v.en || ''} onChange={(e) => onChange({ ...v, en: e.target.value })} /></label>
    </div>
  );
}

function ScheduleField({ value = [], onChange }) {
  const update = (i, k, v) => onChange(value.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const remove = (i) => onChange(value.filter((_, j) => j !== i));
  const add = () => onChange([...value, { day: 1, from: '18:00', to: '20:00', venue: '' }]);
  const noteOf = (r) => (typeof r.note === 'string' ? { nb: r.note, en: '' } : r.note || { nb: '', en: '' });
  return (
    <div className="rows">
      {value.map((r, i) => (
        <div className="rows__row" key={i}>
          <div className="rows__head">
            <label><small>Dag</small>
              <select value={r.day} onChange={(e) => update(i, 'day', Number(e.target.value))}>
                {DAYS.slice(1).map((d, j) => <option key={d} value={j + 1}>{d}</option>)}
              </select>
            </label>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => remove(i)}>Fjern</button>
          </div>
          <div className="rows__grid">
            <label><small>Fra</small><input type="time" value={r.from} onChange={(e) => update(i, 'from', e.target.value)} /></label>
            <label><small>Til</small><input type="time" value={r.to} onChange={(e) => update(i, 'to', e.target.value)} /></label>
            <label><small>Fra dato</small><input type="date" value={r.from_date || ''} onChange={(e) => update(i, 'from_date', e.target.value || undefined)} /></label>
            <label><small>Til dato</small><input type="date" value={r.until_date || ''} onChange={(e) => update(i, 'until_date', e.target.value || undefined)} /></label>
            <label className="rows__wide"><small>Sted (tom = gruppas sted)</small><input value={r.venue || ''} onChange={(e) => update(i, 'venue', e.target.value)} placeholder="Porsgrunn Arena" /></label>
          </div>
          {r.skip_dates?.length > 0 && (
            <p className="hint muted">{r.skip_dates.length} avlyst{r.skip_dates.length === 1 ? ' dato' : 'e datoer'} – styres under «Kommende økter».</p>
          )}
          <label><small>Merknad (norsk / engelsk)</small>
            <div className="bi">
              <input value={noteOf(r).nb} onChange={(e) => update(i, 'note', { ...noteOf(r), nb: e.target.value })} placeholder="Innendørs" />
              <input value={noteOf(r).en} onChange={(e) => update(i, 'note', { ...noteOf(r), en: e.target.value })} placeholder="Indoors" />
            </div>
          </label>
        </div>
      ))}
      <div><button type="button" className="btn btn--ghost btn--sm" onClick={add}>+ Legg til økt</button></div>
    </div>
  );
}

export function Field({ field, value, onChange }) {
  const id = `f-${field.key.replace(/\./g, '-')}`;
  if (field.type === 'checkbox') {
    return (
      <label className="check" htmlFor={id}>
        <input id={id} type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
        {field.label}
      </label>
    );
  }
  let input;
  switch (field.type) {
    case 'bi': input = <Bi id={id} value={value} onChange={onChange} />; break;
    case 'bitext': input = <Bi id={id} value={value} onChange={onChange} multiline />; break;
    case 'schedule': input = <ScheduleField value={value || []} onChange={onChange} />; break;
    case 'select':
      input = (
        <select id={id} value={value ?? field.options[0][0]} onChange={(e) => onChange(e.target.value)}>
          {field.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      );
      break;
    case 'number':
      input = <input id={id} type="number" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />;
      break;
    default:
      input = <input id={id} type={field.type} required={field.required} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} />;
  }
  return (
    <div className="field">
      <label htmlFor={id} className="field__label">{field.label}</label>
      {input}
      {field.hint && <span className="hint">{field.hint}</span>}
    </div>
  );
}
