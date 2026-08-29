import { useState } from 'react';
import { Dialog } from './Dialog.jsx';
import { normalizeIngredients } from '../lib/recipe.js';

/**
 * «Legg til ny middag» / rediger familieoppskrift.
 *
 * Nytt: eget navnefelt ØVERST, og de 30 vanlige familiemiddagene som
 * startpunkt — mengder for 2 voksne + 2 barn.
 * Eksisterende: redigerte mengder lagres som familieoppskrift
 * (meals.ingredients) og gjenbrukes alle steder middagen refereres.
 */
export function MealEditorDialog({ meal, mealLibrary, onClose, onSave, onDelete }) {
  const isNew = !meal?.id;
  const [name, setName] = useState(meal?.name ?? '');
  const [category, setCategory] = useState(meal?.category ?? '');
  const [rows, setRows] = useState(() =>
    (meal?.ingredients ?? []).map((i) => ({ n: i.n, qty: String(i.qty ?? 1) })));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const patch = (idx, field, value) =>
    setRows((cur) => cur.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  const removeRow = (idx) => setRows((cur) => cur.filter((_, i) => i !== idx));
  const addRow = () => setRows((cur) => [...cur, { n: '', qty: '1' }]);

  /** Startpunkt fra biblioteket: fyller navn, kategori og mengder. */
  const useTemplate = (lib) => {
    setName(lib.name);
    setCategory(lib.category ?? '');
    setRows((lib.ingredients ?? []).map((i) => ({ n: i.n, qty: String(i.qty ?? 1) })));
    setError(null);
  };

  const save = async () => {
    const ingredients = normalizeIngredients(rows);
    if (!name.trim()) { setError('Gi middagen et navn.'); return; }
    if (!ingredients.length) { setError('Legg til minst én ingrediens.'); return; }
    setBusy(true);
    setError(null);
    try {
      const err = await onSave({
        id: meal?.id ?? null,
        name: name.trim(),
        category: category.trim() || null,
        ingredients,
      });
      if (err) { setError(err); return; }
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={isNew ? 'Legg til ny middag' : name || 'Rediger middag'}
      subtitle="Mengdene er for 2 voksne + 2 barn"
      onClose={onClose}
      footer={
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={save} disabled={busy}>
            {busy ? 'Lagrer …' : 'Lagre familieoppskrift'}
          </button>
          {!isNew && onDelete && (
            <button type="button" className="btn" onClick={() => onDelete(meal)} disabled={busy}>Slett</button>
          )}
        </div>
      }
    >
      {/* Navnefeltet ØVERST, som i prototypen */}
      <label className="field">
        <span className="field-label">Navn</span>
        <input
          className="input" autoFocus={isNew} placeholder="f.eks. Mormors fiskegrateng"
          value={name} onChange={(e) => setName(e.target.value)}
        />
      </label>

      <label className="field">
        <span className="field-label">Kategori (valgfritt)</span>
        <input
          className="input" placeholder="f.eks. Fisk"
          value={category} onChange={(e) => setCategory(e.target.value)}
        />
      </label>

      {isNew && mealLibrary.length > 0 && (
        <div className="field">
          <span className="field-label">Eller start fra en vanlig familiemiddag</span>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {mealLibrary.map((lib) => (
              <button
                key={lib.name}
                type="button"
                className="tag tag-button tag-outline"
                onClick={() => useTemplate(lib)}
              >
                {lib.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="field">
        <span className="field-label">Ingredienser</span>
        <div className="stack" style={{ gap: 6 }}>
          {rows.map((row, idx) => (
            // Indeks som nøkkel er trygt her: radene har ingen egen identitet
            // og endres kun via denne dialogen.
            // eslint-disable-next-line react/no-array-index-key
            <div key={idx} className="row" style={{ gap: 6 }}>
              <input
                className="input" placeholder="Ingrediens" style={{ flex: 1 }}
                value={row.n} onChange={(e) => patch(idx, 'n', e.target.value)}
              />
              <input
                className="input" inputMode="decimal" aria-label="Antall"
                style={{ width: 64, textAlign: 'center' }}
                value={row.qty} onChange={(e) => patch(idx, 'qty', e.target.value)}
              />
              <button
                type="button" className="btn btn-ghost btn-sm"
                onClick={() => removeRow(idx)} aria-label={`Fjern ${row.n || 'rad'}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-sm" style={{ marginTop: 8 }} onClick={addRow}>
          + Ingrediens
        </button>
      </div>

      {error && <p style={{ fontSize: 12, color: 'var(--color-accent)' }}>{error}</p>}
    </Dialog>
  );
}
