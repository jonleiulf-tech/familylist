import { useMemo, useState } from 'react';
import { Lock, AlertTriangle } from 'lucide-react';
import { Dialog } from './Dialog.jsx';
import { pickerDays, weekGroups, dayNote } from '../lib/dayPicker.js';

/**
 * «Hvilken dag skal denne middagen på?»
 *
 * Hele planen ligger åpen: ledige dager står som ledige, opptatte står med
 * retten som ligger der. Velger man en opptatt dag, spør vi før vi bytter —
 * en middag noen har planlagt skal ikke forsvinne uten at det ble sagt.
 *
 * To bruk, samme visning. Setter man en NY middag inn, erstatter den det som
 * står der. FLYTTER man en middag som alt ligger i planen, bytter de to
 * plass — for det er nesten alltid det man mener med å flytte pannekakene
 * fra tirsdag til torsdag: fisken skal til tirsdag, ikke i søpla.
 */
export function DayPickerDialog({ meal, plan, fromDate = null, onPick, onClose }) {
  const moving = Boolean(fromDate);
  const [confirm, setConfirm] = useState(null);   // dagen som skal overskrives
  const [busy, setBusy] = useState(false);

  const groups = useMemo(() => weekGroups(pickerDays(plan)), [plan]);

  const choose = async (day) => {
    if (day.locked || day.date === fromDate) return;
    // Ledig dag: rett inn. Opptatt: spør først.
    if (day.status === 'opptatt') { setConfirm(day); return; }
    setBusy(true);
    try { await onPick(day.date); } finally { setBusy(false); }
  };

  const confirmReplace = async () => {
    setBusy(true);
    try { await onPick(confirm.date, { replaced: confirm.mealName }); } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  return (
    <Dialog
      title={moving ? 'Flytt til en annen dag' : 'Velg dag'}
      subtitle={meal?.name
        ? `${meal.name} — trykk på dagen den skal ${moving ? 'flyttes til' : 'på'}`
        : undefined}
      onClose={onClose}
    >
      {confirm && (
        <div style={{
          border: '1px solid var(--color-honey-200)', background: 'var(--color-honey-100)',
          borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: 'var(--space-3)',
        }}>
          <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2, color: 'var(--color-honey-600)' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {confirm.weekday} {confirm.dayNum}. {confirm.month} har allerede {confirm.mealName}
              </div>
              <p className="text-muted" style={{ fontSize: 12.5, lineHeight: 1.5, margin: '5px 0 0' }}>
                {moving
                  ? `De bytter plass: ${meal?.name} hit, og ${confirm.mealName} dit ${meal?.name} sto.`
                  : `Setter du ${meal?.name} her, erstattes ${confirm.mealName}.`}
                {confirm.sent && ' Varene til den er allerede sendt til handlelisten — de blir stående.'}
              </p>
            </div>
          </div>
          <div className="row" style={{ gap: 8, marginTop: 12 }}>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={confirmReplace}>
              {busy ? 'Bytter …' : moving ? `Bytt plass med ${confirm.mealName}` : `Erstatt med ${meal?.name}`}
            </button>
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setConfirm(null)}>
              Velg en annen dag
            </button>
          </div>
        </div>
      )}

      {groups.map((g) => (
        <div key={g.weekStart} style={{ marginBottom: 'var(--space-4)' }}>
          <div className="row-between" style={{ marginBottom: 6 }}>
            <span className="card-kicker">{g.label}</span>
            <span className="text-muted tnum" style={{ fontSize: 11 }}>
              {g.free} {g.free === 1 ? 'ledig dag' : 'ledige dager'}
            </span>
          </div>
          <div className="stack" style={{ gap: 5 }}>
            {g.days.map((d) => {
              const isFree = d.status === 'ledig' || d.status === 'hoppet';
              const picked = confirm?.date === d.date;
              const isSource = d.date === fromDate;
              return (
                <button
                  key={d.date}
                  type="button"
                  disabled={d.locked || busy || isSource}
                  onClick={() => choose(d)}
                  className="row"
                  style={{
                    width: '100%', gap: 10, textAlign: 'left', alignItems: 'center',
                    padding: '10px 12px', borderRadius: 'var(--radius)',
                    border: `1px solid ${picked ? 'var(--color-honey-300, var(--color-honey))' : 'var(--color-divider)'}`,
                    background: d.locked ? 'var(--color-bg-sunken)'
                      : picked ? 'var(--color-honey-100)'
                        : isFree ? 'var(--color-surface)' : 'var(--color-bg-sunken)',
                    color: 'var(--color-text)',
                    cursor: d.locked || isSource ? 'default' : 'pointer',
                    opacity: d.locked ? 0.6 : 1,
                  }}
                >
                  {/* Datostripen: ukedagen først, for det er den folk tenker i. */}
                  <span style={{ flexShrink: 0, width: 62 }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>
                      {d.isToday ? 'I dag' : d.weekday.slice(0, 3)}
                    </span>
                    <span className="text-muted tnum" style={{ fontSize: 11 }}>
                      {d.dayNum}. {d.month}
                    </span>
                  </span>

                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5 }}>
                    <span style={{
                      display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      fontWeight: isFree ? 400 : 600,
                      color: isFree ? 'var(--color-text-muted)' : 'var(--color-text)',
                    }}>
                      {dayNote(d)}
                    </span>
                    {d.sent && (
                      <span className="text-muted" style={{ fontSize: 10.5 }}>sendt til handlelisten</span>
                    )}
                  </span>

                  {isSource ? (
                    <span className="tag tag-neutral" style={{ flexShrink: 0 }}>Står her nå</span>
                  ) : d.locked ? <Lock size={13} style={{ flexShrink: 0, opacity: 0.7 }} />
                    : isFree ? (
                      <span className="tag tag-herb" style={{ flexShrink: 0 }}>
                        {moving ? 'Flytt hit' : 'Sett her'}
                      </span>
                    ) : (
                      <span className="tag tag-outline" style={{ flexShrink: 0 }}>
                        {moving ? 'Bytt plass' : 'Bytt'}
                      </span>
                    )}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <p className="text-muted" style={{ fontSize: 11, lineHeight: 1.5, margin: 0 }}>
        Låste dager kan ikke overskrives herfra — låsen tas av på dagskortet i
        planen.{' '}
        {moving
          ? 'Er varene alt sendt til handlelisten, blir de stående — de følger middagen.'
          : 'Ingrediensene sendes til handlelisten når du er klar, ikke nå.'}
      </p>
    </Dialog>
  );
}
