import { useState } from 'react';
import { ExternalLink, Minus, Plus, Users, ChefHat, Pencil, X, CalendarPlus, Search, Star } from 'lucide-react';
import { Dialog } from './Dialog.jsx';
import { supabase } from '../lib/supabase.js';
import { guessUnit } from '../lib/catalog.js';
import {
  householdPortions, formatPortions, mealScaleFactor, scaleQty,
} from '../lib/portions.js';
import { safeUrl } from '../lib/safeUrl.js';
import { UnitSelect } from './UnitSelect.jsx';
import { convertQty } from '../lib/units.js';

import { trimmed } from '../lib/text.js';
/**
 * Entydig mengde: «3 Kyllingfilet» sier ikke om det er stykker, pakker
 * eller gram. Samme tolkning som prisen bruker (pakke ≈ 400 g når
 * størrelsen er ukjent) — vist i klartekst.
 */
const fmtG = (n) => `${Math.round(n).toLocaleString('nb-NO')} g`;

function ingredientLabel(qty, name) {
  const q = Number(qty) || 0;
  const unit = guessUnit(name, null, q);
  if (unit === 'pakke') return `${q} pk ${name} (ca. ${fmtG(q * 400)})`;
  if (unit === 'g') {
    const pk = Math.max(1, Math.ceil(q / 400));
    return `${q} g ${name}${pk > 1 ? ` (≈ ${pk} pk)` : ''}`;
  }
  if (unit === 'liter') return `${q} l ${name}`;
  return `${q} ${name}`;
}

/** Hint under redigeringsraden: hvordan tallet tolkes, og hvordan angi gram. */
function qtyHint(qty, name) {
  const q = Number(qty) || 0;
  if (!String(name).trim() || q <= 0) return null;
  const unit = guessUnit(name, null, q);
  if (unit === 'pakke') {
    return `Tolkes som ${q} ${q === 1 ? 'pakke' : 'pakker'} à ca. 400 g (ca. ${fmtG(q * 400)} totalt) — mener du gram, skriv f.eks. ${q * 400}`;
  }
  if (unit === 'g') {
    const pk = Math.max(1, Math.ceil(q / 400));
    return `Tolkes som ${fmtG(q)} — kjøpes som ${pk} ${pk === 1 ? 'pakke' : 'pakker'}`;
  }
  return null;
}

/**
 * Beste treff i kokeboka (external_recipe_candidates) for et middagsnavn.
 * Søker på de lengste ordene i navnet og rangerer på relevans — brukes til
 * å koble en nett-oppskrift til familiens middag.
 */
async function searchCookbook(mealName) {
  const words = String(mealName).toLowerCase()
    .split(/[^a-zæøåé]+/)
    .filter((w) => w.length >= 4)
    .sort((a, b) => b.length - a.length)
    .slice(0, 2);
  const terms = words.length ? words : [String(mealName).toLowerCase().trim()];
  const { data } = await supabase
    .from('external_recipe_candidates')
    .select('id, title, title_no, source_url, total_minutes, servings, relevance_score, source:recipe_sources(name)')
    .or(terms.map((t) => `title.ilike.%${t}%`).join(','))
    .order('relevance_score', { ascending: false, nullsFirst: false })
    .limit(5);
  return data ?? [];
}

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
  meal, planDay, household, onSaveMeal, onSetGuests, onQuickPlan, onMoveDay, onClose, toast,
  // «Endre»-blyanten på dagskortet skal ikke kreve et ekstra trykk inne
  // i dialogen før man er i redigering.
  startInEdit = false,
}) {
  const [text, setText] = useState(meal?.instructions ?? '');
  const [savedText, setSavedText] = useState(meal?.instructions ?? '');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  // Nett-oppskrift koblet til middagen + hvilken fremgangsmåte som er standard.
  const [sourceUrl, setSourceUrl] = useState(meal?.instructions_url ?? null);
  const [sourceLabel, setSourceLabel] = useState(meal?.source_label ?? null);
  const [sourceSteps, setSourceSteps] = useState(
    Array.isArray(meal?.source_instructions) && meal.source_instructions.length
      ? meal.source_instructions : null,
  );
  const [preferred, setPreferred] = useState(meal?.instructions_default ?? 'egen');
  const [hits, setHits] = useState(null);       // null = søket er ikke kjørt
  const [searching, setSearching] = useState(false);
  const [fetching, setFetching] = useState(false);

  /** Hent stegene fra kildesiden via fetch-recipe-funksjonen. */
  const fetchSteps = async (url) => {
    const { data, error } = await supabase.functions.invoke('fetch-recipe', { body: { url } });
    if (error || data?.error) return null;
    return Array.isArray(data?.steps) && data.steps.length ? data.steps : null;
  };

  const patchMeal = async (patch) => {
    if (!meal?.id) return 'Middagen er ikke lagret ennå.';
    return onSaveMeal({
      id: meal.id, name: meal.name, category: meal.category,
      ingredients: meal.ingredients, ...patch,
    });
  };

  const findRecipes = async () => {
    setSearching(true);
    try { setHits(await searchCookbook(meal.name)); }
    finally { setSearching(false); }
  };

  const useRecipe = async (hit) => {
    const label = hit.source?.name ?? 'kilden';
    // Har familien ingen egen tekst, blir nett-oppskriften standarden.
    const nextDefault = savedText ? preferred : 'kilde';
    setFetching(true);
    let steps = null;
    try { steps = await fetchSteps(hit.source_url); }
    finally { setFetching(false); }
    const err = await patchMeal({
      instructions_url: hit.source_url,
      source_label: label,
      source_instructions: steps,
      instructions_default: nextDefault,
    });
    if (err) { toast(err); return; }
    setSourceUrl(hit.source_url);
    setSourceLabel(label);
    setSourceSteps(steps);
    setPreferred(nextDefault);
    setHits(null);
    toast(steps
      ? `«${hit.title_no ?? hit.title}» fra ${label} — ${steps.length} steg hentet inn`
      : `«${hit.title_no ?? hit.title}» fra ${label} er koblet til (fikk ikke hentet teksten — lenken virker)`);
  };

  /** Hent teksten inn for en middag som allerede har lenke, men ingen steg. */
  const fetchExisting = async () => {
    setFetching(true);
    let steps = null;
    try { steps = await fetchSteps(sourceUrl); }
    finally { setFetching(false); }
    if (!steps) { toast('Fikk ikke hentet teksten fra kilden.'); return; }
    const err = await patchMeal({ source_instructions: steps });
    if (err) { toast(err); return; }
    setSourceSteps(steps);
    toast(`${steps.length} steg hentet inn fra ${sourceLabel ?? 'kilden'}`);
  };

  const setDefault = async (which) => {
    if (which === preferred) return;
    setPreferred(which);
    const err = await patchMeal({ instructions_default: which });
    if (err) { toast(err); setPreferred(preferred); return; }
    toast(which === 'egen'
      ? 'Familiens egen fremgangsmåte er standard'
      : `Oppskriften hos ${sourceLabel ?? 'kilden'} er standard`);
  };

  // Redigering av selve middagen: navn, kategori og ingredienser.
  // null = visning; ellers { name, category, rows: [{n, qty}] }.
  const initialEdit = () => ({
    name: meal?.name ?? '',
    category: meal?.category ?? '',
    rows: (meal?.ingredients ?? []).length
      ? meal.ingredients.map((ing) => ({ n: ing.n, qty: ing.qty ?? 1, unit: ing.unit ?? null }))
      : [{ n: '', qty: 1, unit: null }],
  });
  const [edit, setEdit] = useState(() => (startInEdit && meal ? initialEdit() : null));
  const startEdit = () => setEdit({
    name: meal.name,
    category: meal.category ?? '',
    rows: (meal.ingredients ?? []).length
      ? meal.ingredients.map((ing) => ({ n: ing.n, qty: ing.qty ?? 1, unit: ing.unit ?? null }))
      : [{ n: '', qty: 1, unit: null }],
  });
  const editRow = (i, patch) => setEdit((e) => ({
    ...e, rows: e.rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
  }));
  const saveEdit = async () => {
    const name = trimmed(edit.name);
    if (!name) { toast('Middagen må ha et navn.'); return; }
    const ingredients = edit.rows
      // trimmed(r.n): radene bygges fra meal.ingredients, som er jsonb.
      // En ekstern oppskrift kan ha gitt en linje uten navn, og da kastet
      // r.n.trim() midt i lagringen.
      .filter((r) => trimmed(r.n))
      .map((r) => ({ n: trimmed(r.n), qty: Number(String(r.qty).replace(',', '.')) || 1, unit: r.unit ?? null }));
    setBusy(true);
    try {
      const err = await onSaveMeal({
        id: meal.id, name, category: trimmed(edit.category) || null, ingredients,
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
            {edit.rows.map((r, i) => {
              // −/+ som ellers i appen: store mengder (gram) stepper i 10,
              // små i 1. Tallet kan fortsatt skrives rett inn.
              const qtyNum = Number(String(r.qty).replace(',', '.')) || 0;
              const stepBy = qtyNum >= 20 ? 10 : 1;
              const stepQty = (dir) => editRow(i, {
                qty: Math.max(0.25, Math.round((qtyNum + dir * stepBy) * 4) / 4),
              });
              const hint = qtyHint(qtyNum, r.n);
              return (
              // eslint-disable-next-line react/no-array-index-key
              <div key={i}>
              <div className="row" style={{ gap: 4 }}>
                <button
                  type="button"
                  className="btn btn-icon btn-sm"
                  aria-label={`Mindre ${r.n || 'mengde'}`}
                  onClick={() => stepQty(-1)}
                  disabled={qtyNum <= 0.25}
                  style={{ flex: 'none' }}
                >
                  <Minus size={13} />
                </button>
                <input
                  className="input"
                  style={{ width: 46, flex: 'none', textAlign: 'center', padding: '8px 4px' }}
                  inputMode="decimal"
                  value={r.qty}
                  onChange={(e) => editRow(i, { qty: e.target.value })}
                  aria-label="Mengde"
                />
                <button
                  type="button"
                  className="btn btn-icon btn-sm"
                  aria-label={`Mer ${r.n || 'mengde'}`}
                  onClick={() => stepQty(1)}
                  style={{ flex: 'none' }}
                >
                  <Plus size={13} />
                </button>
                {/* Enheten hører mellom mengden og varenavnet: «2 kg mel»
                    leses i den rekkefølgen. Bytter man fra dl til liter
                    regnes tallet om — 20 dl blir 2 l. På tvers av vekt og
                    volum finnes ingen fasit, så da byttes bare enheten. */}
                <UnitSelect
                  value={r.unit}
                  label={`Enhet for ${r.n || 'ingrediensen'}`}
                  width={62}
                  onChange={(u) => {
                    const { qty } = convertQty(r.qty, r.unit, u);
                    editRow(i, { unit: u, qty: qty ?? r.qty });
                  }}
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
                  style={{ flex: 'none' }}
                >
                  <X size={14} />
                </button>
              </div>
              {hint && (
                <div className="text-muted" style={{ fontSize: 11, margin: '2px 0 2px 2px' }}>
                  {hint}
                </div>
              )}
              </div>
              );
            })}
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
      {!edit && (meal?.id || (onQuickPlan && !planDay) || (onMoveDay && planDay?.meal_name)) && (
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
          {meal?.id && (
            <button type="button" className="btn btn-sm" onClick={startEdit}>
              <Pencil size={13} /> Rediger navn og ingredienser
            </button>
          )}
          {onQuickPlan && !planDay && (
            <button type="button" className="btn btn-sm" onClick={() => onQuickPlan(meal)}>
              <CalendarPlus size={13} /> Legg i middagsplanen
            </button>
          )}
          {onMoveDay && planDay?.meal_name && !planDay.locked && (
            <button type="button" className="btn btn-sm" onClick={() => onMoveDay(planDay)}>
              <CalendarPlus size={13} /> Flytt til en annen dag
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
          {/* Én ingrediens per linje. Som en prikkseparert setning måtte man
              lete seg fram midt i matlagingen — en liste leses med øyet. */}
          <ul style={{
            listStyle: 'none', margin: '0 0 var(--space-4)', padding: 0,
            border: '1px solid var(--color-divider)', borderRadius: 'var(--radius)',
            background: 'var(--color-surface)', overflow: 'hidden',
          }}>
            {meal.ingredients.map((ing, i) => (
              <li
                key={`${ing.n}-${i}`}
                style={{
                  fontSize: 14, lineHeight: 1.4, padding: '9px 13px',
                  borderTop: i > 0 ? '1px solid var(--color-divider-soft)' : 'none',
                }}
              >
                {ingredientLabel(scaleQty(ing.qty, factor) ?? ing.qty, ing.n)}
              </li>
            ))}
          </ul>
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

          {/* Standardvelger — vises når begge fremgangsmåtene finnes */}
          {sourceUrl && savedText && (
            <div className="seg" style={{ marginBottom: 10 }}>
              {[['egen', 'Vår egen'], ['kilde', sourceLabel ?? 'Nett-oppskrift']].map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  className="seg-opt"
                  aria-pressed={preferred === v}
                  onClick={() => setDefault(v)}
                >
                  {preferred === v && <Star size={11} style={{ marginRight: 4, verticalAlign: -1 }} />}
                  {l}
                </button>
              ))}
            </div>
          )}

          {/* De to sporene, med standarden først */}
          {[
            sourceUrl && {
              key: 'kilde',
              el: sourceSteps ? (
                <div style={{
                  background: 'var(--color-surface)', border: '1px solid var(--color-divider)',
                  borderRadius: 'var(--radius)', padding: '12px 14px', marginBottom: 'var(--space-3)',
                }}>
                  <ol style={{ margin: 0, paddingLeft: 24, fontSize: 14, lineHeight: 1.75 }}>
                    {sourceSteps.map((s, i) => (
                      // eslint-disable-next-line react/no-array-index-key
                      <li key={i} style={{ marginBottom: 12, paddingLeft: 4 }}>
                        {s.section && (
                          <span style={{
                            display: 'block', fontFamily: 'var(--font-heading)', fontWeight: 700,
                            fontSize: 13, letterSpacing: '-0.01em', color: 'var(--color-herb-700)', margin: '2px 0 4px',
                          }}>
                            {s.section}
                          </span>
                        )}
                        {s.text}
                      </li>
                    ))}
                  </ol>
                  <a
                    className="text-muted"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, marginTop: 8 }}
                    href={safeUrl(sourceUrl)}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    Se kilden hos {sourceLabel || 'kilden'} her <ExternalLink size={11} />
                  </a>
                </div>
              ) : (
                <div style={{ marginBottom: 'var(--space-3)' }}>
                  <a
                    className={preferred === 'kilde' || !savedText ? 'btn btn-primary btn-block' : 'btn btn-secondary btn-block'}
                    style={{ textDecoration: 'none' }}
                    href={sourceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    Les fremgangsmåten hos {sourceLabel || 'kilden'}
                    <ExternalLink size={14} style={{ marginLeft: 'auto' }} />
                  </a>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ color: 'var(--color-accent)', fontWeight: 600, paddingLeft: 0, marginTop: 4 }}
                    onClick={fetchExisting}
                    disabled={fetching}
                  >
                    {fetching ? 'Henter …' : 'Hent teksten inn hit'}
                  </button>
                </div>
              ),
            },
            savedText && !editing && {
              key: 'egen',
              el: (
                <div style={{
                  whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.6,
                  background: 'var(--color-surface)', border: '1px solid var(--color-divider)',
                  borderRadius: 'var(--radius)', padding: '12px 14px', marginBottom: 8,
                }}>
                  {savedText}
                </div>
              ),
            },
          ]
            .filter(Boolean)
            .sort((a, b) => (a.key === preferred ? -1 : b.key === preferred ? 1 : 0))
            .map((b) => <div key={b.key}>{b.el}</div>)}

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
            <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--color-accent)', fontWeight: 600, paddingLeft: 0 }}
                onClick={() => setEditing(true)}
                disabled={!meal?.id}
              >
                {savedText ? 'Rediger vår egen' : '+ Skriv vår egen fremgangsmåte'}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--color-accent)', fontWeight: 600, paddingLeft: 0 }}
                onClick={findRecipes}
                disabled={!meal?.id || searching}
              >
                <Search size={12} /> {searching ? 'Søker i kokeboka …' : sourceUrl ? 'Bytt nett-oppskrift' : 'Finn oppskrift på nettet'}
              </button>
            </div>
          )}

          {/* Treff fra kokeboka — velg hvilken som kobles til middagen */}
          {hits && (
            <div style={{ marginTop: 10 }}>
              {hits.length === 0 && (
                <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>
                  Fant ingen oppskrifter på «{meal.name}» i kokeboka ennå — den
                  vokser hver time, så prøv igjen senere.
                </p>
              )}
              {hits.map((h) => (
                <div key={h.id} className="row" style={{
                  gap: 10, alignItems: 'center', padding: '8px 10px', marginBottom: 6,
                  border: '1px solid var(--color-divider)', borderRadius: 'var(--radius)',
                  background: 'var(--color-surface)',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, letterSpacing: '-0.01em', lineHeight: 1.2 }}>{h.title_no ?? h.title}</div>
                    <div className="item-sub">
                      {[h.source?.name, h.total_minutes ? `${h.total_minutes} min` : null,
                        h.servings ? `${h.servings} porsjoner` : null].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <a className="btn btn-icon btn-sm" href={safeUrl(h.source_url)} target="_blank" rel="noreferrer noopener" aria-label="Se oppskriften">
                    <ExternalLink size={13} />
                  </a>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => useRecipe(h)}>
                    Bruk denne
                  </button>
                </div>
              ))}
            </div>
          )}

          {!savedText && !sourceUrl && !editing && !hits && (
            <p className="text-muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
              Ingen fremgangsmåte ennå. Hent en fra kokeboka på nettet, eller
              skriv familiens egen — eller begge, og velg hvilken som er standard.
            </p>
          )}
          {sourceUrl && (
            <p className="text-muted" style={{ fontSize: 11, margin: '10px 0 0' }}>
              {sourceSteps
                ? <>Utklippet er husholdningens eget, til privat bruk — oppskriften
                    tilhører {sourceLabel || 'kilden'}, kreditert med lenke over.</>
                : <>Fremgangsmåten leses hos {sourceLabel || 'kilden'} — eller hent
                    teksten inn hit som familiens eget utklipp.</>}
            </p>
          )}
        </>
      )}
    </Dialog>
  );
}
