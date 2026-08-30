import { useState } from 'react';
import { ExternalLink, Minus, Plus, Users, ChefHat, Pencil, X, CalendarPlus } from 'lucide-react';
import { Dialog } from './Dialog.jsx';
import {
  householdPortions, formatPortions, mealScaleFactor, scaleQty,
} from '../lib/portions.js';

/**
 * Middagsdetaljer: fremgangsmåte og porsjoner for én middag.
 *
 * Fremgangsmåte har to spor som kan leve side om side:
 *  – Kokebok-oppskrifter (TINE, Gilde …) LENKER ut til kilden. Teksten
 *    deres kopieres aldri inn — opphavsretten er kildens.
 *  – Familiens egen tekst (instructions) — «sånn lager VI den» — kan
 *    skrives og redigeres av alle i husholdningen.
 *
 * Åpnes dialogen fra en plandag kan man også legge til gjester for akkurat
 * den middagen: voksne teller 1 porsjon, barn en halv. Bare den dagens
 * mengder skaleres — resten av uken står urørt.
 */
export function MealDetailsDialog({
  meal, planDay, household, onSaveMeal, onSetGuests, onQuickPlan, onClose, toast,
}) {
  const [text, setText] = useState(meal?.instructions ?? '');
  const [savedText, setSavedText] = useState(meal?.instructions ?? '');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  // Redigering av selve middagen: navn, kategori og ingredienser.
  // null = visning; ellers { name, category, rows: [{n, qty}] }.
  const [edit, setEdit] = useState(null);
  const startEdit = () => setEdit({
    name: meal.name,
    category: meal.category ?? '',
    rows: (meal.ingredients ?? []).length
      ? meal.ingredients.map((ing) => ({ n: ing.n, qty: ing.qty ?? 1 }))
      : [{ n: '', qty: 1 }],
  });
  const editRow = (i, patch) => setEdit((e) => ({
    ...e, rows: e.rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
  }));
  const saveEdit = async () => {
    const name = edit.name.trim();
    if (!name) { toast('Middagen må ha et navn.'); return; }
    const ingredients = edit.rows
      .filter((r) => r.n.trim())
      .map((r) => ({ n: r.n.trim(), qty: Number(String(r.qty).replace(',', '.')) || 1 }));
    setBusy(true);
    try {
      const err = await onSaveMeal({
        id: meal.id, name, category: edit.category.trim() || null, ingredients,
      });
      if (err) { toast(err); return; }
      toast(`«${name}» er oppdatert`);
      onClose();   // lukk — visningen bak henter alltid ferske data
    } finally {
      setBusy(false);
    }
  };

  const initialGuests = Number(planDay?.guest_portions) || 0;
  const [guestAdults, setGuestAdults] = useState(Math.floor(initialGuests));
  const [guestKids, setGuestKids] = useState(Math.round((initialGuests - Math.floor(initialGuests)) * 2));
  const guestPortions = guestAdults + guestKids * 0.5;
  const guestsChanged = planDay && guestPortions !== initialGuests;

  const famPortions = householdPortions(household);
  const factor = mealScaleFactor(meal?.base_servings, household, planDay ? guestPortions : 0);
  const canScale = Number(meal?.base_servings) > 0;

  const saveText = async () => {
    if (!meal?.id) return;
    setBusy(true);
    try {
      const err = await onSaveMeal({
        id: meal.id, name: meal.name, category: meal.category,
        ingredients: meal.ingredients, instructions: text.trim() || null,
      });
      if (err) { toast(err); return; }
      setSavedText(text.trim());
      setEditing(false);
      toast('Fremgangsmåten er lagret');
    } finally {
      setBusy(false);
    }
  };

  const saveGuests = async () => {
    setBusy(true);
    try {
      await onSetGuests(planDay.plan_date, guestPortions);
      toast(guestPortions > 0
        ? `Gjester lagt til — middagen beregnes for ${formatPortions(famPortions + guestPortions)} porsjoner`
        : 'Gjestene er fjernet fra middagen');
    } finally {
      setBusy(false);
    }
  };

  const Step = ({ value, onDown, onUp, label }) => (
    <div className="row" style={{ gap: 8, alignItems: 'center' }}>
      <span style={{ flex: 1, fontSize: 13 }}>{label}</span>
      <button type="button" className="btn btn-icon btn-sm" aria-label={`Færre ${label}`} onClick={onDown} disabled={value <= 0}>
        <Minus size={14} />
      </button>
      <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 700 }}>{value}</span>
      <button type="button" className="btn btn-icon btn-sm" aria-label={`Flere ${label}`} onClick={onUp}>
        <Plus size={14} />
      </button>
    </div>
  );

  return (
    <Dialog
      title={meal?.name ?? 'Middag'}
      subtitle={[
        meal?.category,
        canScale ? `oppskriften er til ${formatPortions(meal.base_servings)} porsjoner` : null,
      ].filter(Boolean).join(' · ') || undefined}
      onClose={onClose}
    >
      {/* ---------- Redigeringsmodus: navn, kategori, ingredienser ---------- */}
      {edit && (
        <>
          <label className="field">
            <span className="field-label">Navn</span>
            <input
              className="input"
              value={edit.name}
              onChange={(e) => setEdit({ ...edit, name: e.target.value })}
              placeholder="f.eks. Mammas pannekaker"
              autoFocus
            />
          </label>
          <label className="field" style={{ marginTop: 'var(--space-3)' }}>
            <span className="field-label">Kategori (valgfritt)</span>
            <input
              className="input"
              value={edit.category}
              onChange={(e) => setEdit({ ...edit, category: e.target.value })}
              placeholder="f.eks. Fisk, Kylling, Vegetar …"
            />
          </label>

          <div className="card-kicker" style={{ margin: 'var(--space-4) 0 6px' }}>Ingredienser</div>
          <div className="stack" style={{ gap: 6 }}>
            {edit.rows.map((r, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <div key={i} className="row" style={{ gap: 6 }}>
                <input
                  className="input"
                  style={{ width: 64, flex: 'none', textAlign: 'center' }}
                  inputMode="decimal"
                  value={r.qty}
                  onChange={(e) => editRow(i, { qty: e.target.value })}
                  aria-label="Mengde"
                />
                <input
                  className="input"
                  style={{ flex: 1, minWidth: 0 }}
                  value={r.n}
                  onChange={(e) => editRow(i, { n: e.target.value })}
                  placeholder="f.eks. 3 dl hvetemel — mengde til venstre, vare her"
                  aria-label="Ingrediens"
                />
                <button
                  type="button"
                  className="btn btn-icon btn-sm"
                  aria-label={`Fjern ${r.n || 'raden'}`}
                  onClick={() => setEdit((e) => ({ ...e, rows: e.rows.filter((_, idx) => idx !== i) }))}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ color: 'var(--color-accent)', fontWeight: 600, paddingLeft: 0, marginTop: 6 }}
            onClick={() => setEdit((e) => ({ ...e, rows: [...e.rows, { n: '', qty: 1 }] }))}
          >
            + Legg til ingrediens
          </button>

          <div className="row" style={{ gap: 8, marginTop: 'var(--space-4)' }}>
            <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={saveEdit} disabled={busy}>
              {busy ? 'Lagrer …' : 'Lagre middagen'}
            </button>
            <button type="button" className="btn" onClick={() => setEdit(null)} disabled={busy}>
              Avbryt
            </button>
          </div>
          <p className="text-muted" style={{ fontSize: 11, margin: '10px 0 0' }}>
            Mengdene er slik dere pleier å lage den. Tomme rader hoppes over.
          </p>
        </>
      )}

      {/* ---------- Handlinger ---------- */}
      {!edit && (meal?.id || (onQuickPlan && !planDay)) && (
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
          {meal?.id && (
            <button type="button" className="btn btn-sm" onClick={startEdit}>
              <Pencil size={13} /> Rediger navn og ingredienser
            </button>
          )}
          {onQuickPlan && !planDay && (
            <button type="button" className="btn btn-sm" onClick={() => onQuickPlan(meal)}>
              <CalendarPlus size={13} /> Legg på første ledige dag
            </button>
          )}
        </div>
      )}

      {/* ---------- Gjester på denne middagen ---------- */}
      {!edit && planDay && (
        <div style={{
          background: 'var(--color-bg-sunken)', borderRadius: 'var(--radius)',
          padding: '12px 14px', marginBottom: 'var(--space-4)',
        }}>
          <div className="row" style={{ gap: 6, marginBottom: 8 }}>
            <Users size={14} color="var(--color-accent)" />
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase' }}>
              Gjester på denne middagen
            </span>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            <Step label="Voksne gjester (1 porsjon)" value={guestAdults}
              onDown={() => setGuestAdults((v) => Math.max(0, v - 1))}
              onUp={() => setGuestAdults((v) => v + 1)} />
            <Step label="Barn (en halv porsjon)" value={guestKids}
              onDown={() => setGuestKids((v) => Math.max(0, v - 1))}
              onUp={() => setGuestKids((v) => v + 1)} />
          </div>
          <p className="text-muted" style={{ fontSize: 11, margin: '10px 0 0' }}>
            Familien er {formatPortions(famPortions)} porsjoner til vanlig
            {guestPortions > 0 ? ` — med gjestene blir denne middagen ${formatPortions(famPortions + guestPortions)}.` : '.'}
            {!canScale && ' Oppskriften mangler porsjonsbasis, så mengdene skaleres ikke automatisk.'}
          </p>
          {guestsChanged && (
            <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: 10 }} onClick={saveGuests} disabled={busy}>
              {busy ? 'Lagrer …' : 'Lagre gjester'}
            </button>
          )}
        </div>
      )}

      {/* ---------- Ingredienser (skalert) ---------- */}
      {!edit && (meal?.ingredients ?? []).length > 0 && (
        <>
          <div className="card-kicker" style={{ marginBottom: 4 }}>
            Ingredienser{canScale && factor !== 1
              ? ` — skalert til ${formatPortions(famPortions + (planDay ? guestPortions : 0))} porsjoner`
              : ''}
          </div>
          <p style={{ fontSize: 13, lineHeight: 1.7, margin: '0 0 var(--space-4)' }}>
            {meal.ingredients.map((ing, i) => (
              <span key={`${ing.n}-${i}`}>
                {i > 0 && ' · '}
                {scaleQty(ing.qty, factor) ?? ing.qty} {ing.n}
              </span>
            ))}
          </p>
        </>
      )}

      {/* ---------- Fremgangsmåte ---------- */}
      {!edit && (
        <>
          <div className="row" style={{ gap: 6, marginBottom: 6 }}>
            <ChefHat size={14} color="var(--color-accent)" />
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase' }}>
              Fremgangsmåte
            </span>
          </div>

          {meal?.instructions_url && (
            <a
              className="btn btn-secondary btn-block"
              style={{ marginBottom: 'var(--space-3)', textDecoration: 'none' }}
              href={meal.instructions_url}
              target="_blank"
              rel="noreferrer noopener"
            >
              Les fremgangsmåten hos {meal.source_label || 'kilden'}
              <ExternalLink size={14} style={{ marginLeft: 'auto' }} />
            </a>
          )}

          {!editing && savedText && (
            <div style={{
              whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.6,
              background: 'var(--color-surface)', border: '1px solid var(--color-divider)',
              borderRadius: 'var(--radius)', padding: '12px 14px',
            }}>
              {savedText}
            </div>
          )}

          {editing ? (
            <>
              <textarea
                className="input"
                rows={8}
                style={{ width: '100%', resize: 'vertical', lineHeight: 1.5 }}
                placeholder={'Skriv slik dere lager den …\n\n1. Brun kjøttdeigen …\n2. …'}
                value={text}
                onChange={(e) => setText(e.target.value)}
                aria-label="Familiens fremgangsmåte"
              />
              <div className="row" style={{ gap: 8, marginTop: 8 }}>
                <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={saveText} disabled={busy}>
                  {busy ? 'Lagrer …' : 'Lagre fremgangsmåte'}
                </button>
                <button type="button" className="btn" onClick={() => { setEditing(false); setText(savedText); }} disabled={busy}>
                  Avbryt
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ color: 'var(--color-accent)', fontWeight: 600, paddingLeft: 0, marginTop: savedText ? 8 : 0 }}
              onClick={() => setEditing(true)}
              disabled={!meal?.id}
            >
              {savedText ? 'Rediger familiens fremgangsmåte' : '+ Skriv familiens egen fremgangsmåte'}
            </button>
          )}

          {!savedText && !meal?.instructions_url && !editing && (
            <p className="text-muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
              Ingen fremgangsmåte ennå. Alle i husholdningen kan skrive én — da
              ligger den her for alltid, klar når noen andre skal lage middagen.
            </p>
          )}
          {meal?.instructions_url && (
            <p className="text-muted" style={{ fontSize: 11, margin: '10px 0 0' }}>
              Kildens fremgangsmåte kopieres aldri inn i appen — den leses hos
              {' '}{meal.source_label || 'kilden'}. Familiens egne notater kan dere
              derimot skrive her.
            </p>
          )}
        </>
      )}
    </Dialog>
  );
}
