import { useState } from 'react';
import { ExternalLink, Minus, Plus, Users, ChefHat } from 'lucide-react';
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
  meal, planDay, household, onSaveMeal, onSetGuests, onClose, toast,
}) {
  const [text, setText] = useState(meal?.instructions ?? '');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

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
      {/* ---------- Gjester på denne middagen ---------- */}
      {planDay && (
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
      {(meal?.ingredients ?? []).length > 0 && (
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

      {!editing && meal?.instructions && (
        <div style={{
          whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.6,
          background: 'var(--color-surface)', border: '1px solid var(--color-divider)',
          borderRadius: 'var(--radius)', padding: '12px 14px',
        }}>
          {meal.instructions}
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
            <button type="button" className="btn" onClick={() => { setEditing(false); setText(meal?.instructions ?? ''); }} disabled={busy}>
              Avbryt
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ color: 'var(--color-accent)', fontWeight: 600, paddingLeft: 0, marginTop: meal?.instructions ? 8 : 0 }}
          onClick={() => setEditing(true)}
          disabled={!meal?.id}
        >
          {meal?.instructions ? 'Rediger familiens fremgangsmåte' : '+ Skriv familiens egen fremgangsmåte'}
        </button>
      )}

      {!meal?.instructions && !meal?.instructions_url && !editing && (
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
    </Dialog>
  );
}
