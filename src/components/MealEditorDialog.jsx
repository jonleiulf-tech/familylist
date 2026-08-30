import { useState } from 'react';
import { Check } from 'lucide-react';
import { Dialog } from './Dialog.jsx';

/**
 * «Legg til ny middag» — som i fasiten: eget navnefelt ØVERST for egne
 * middager, deretter de 30 biblioteksmiddagene som rader med kategori-tag,
 * ingrediensforhåndsvisning (mengder for 2 voksne + 2 barn) og «Legg til»
 * per rad. Mengdene finjusteres senere i ingrediens-gjennomgangen, og
 * lagres da som familieoppskrift.
 */
export function MealEditorDialog({ mealLibrary, savedNames, onClose, onCreate }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [added, setAdded] = useState(() => new Set());

  const createCustom = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError('Gi middagen et navn.'); return; }
    setBusy(true);
    setError(null);
    try {
      const err = await onCreate({ name: name.trim(), category: null, ingredients: [] });
      if (err) { setError(err); return; }
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const addLibrary = async (lib) => {
    setBusy(true);
    setError(null);
    try {
      const err = await onCreate({
        name: lib.name,
        category: lib.category ?? null,
        ingredients: lib.ingredients ?? [],
      });
      if (err) { setError(err); return; }
      setAdded((cur) => new Set([...cur, lib.name.toLowerCase()]));
    } finally {
      setBusy(false);
    }
  };

  const preview = (lib) => {
    const parts = (lib.ingredients ?? []).slice(0, 4).map((i) => `${i.qty} ${i.n}`);
    const more = (lib.ingredients ?? []).length - parts.length;
    return parts.join(', ') + (more > 0 ? ` … +${more}` : '');
  };

  return (
    <Dialog
      title="Legg til ny middag"
      subtitle="Mengdene i biblioteket er for 2 voksne + 2 barn"
      onClose={onClose}
    >
      {/* Eget navn øverst */}
      <form onSubmit={createCustom} className="row" style={{ gap: 8, marginBottom: 'var(--space-2)' }}>
        <input
          className="input" autoFocus placeholder="f.eks. Mormors fiskegrateng"
          value={name} onChange={(e) => setName(e.target.value)}
          aria-label="Navn på egen middag"
        />
        <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
          Lagre
        </button>
      </form>
      <p className="text-muted" style={{ fontSize: 11, margin: '0 0 var(--space-3)' }}>
        Egne middager starter uten ingredienser — de legges til første gang du
        planlegger den og går gjennom ingrediensene.
      </p>
      {error && <p style={{ fontSize: 12, color: 'var(--color-accent)' }}>{error}</p>}

      <div className="section-head" style={{ paddingLeft: 0, paddingRight: 0 }}>
        <span className="section-title">Vanlige familiemiddager</span>
        <span className="text-muted" style={{ fontSize: 11 }}>{mealLibrary.length}</span>
      </div>

      <div className="stack" style={{ gap: 0 }}>
        {mealLibrary.map((lib) => {
          const isSaved = savedNames.has(lib.name.toLowerCase()) || added.has(lib.name.toLowerCase());
          return (
            <div key={lib.name} className="item-row" style={{ paddingLeft: 0, paddingRight: 0, alignItems: 'flex-start' }}>
              <div className="item-mid" style={{ cursor: 'default' }}>
                <div className="row" style={{ gap: 6 }}>
                  <span className="item-name" style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, letterSpacing: '-0.01em' }}>{lib.name}</span>
                  {lib.category && <span className="tag tag-herb" style={{ fontSize: 9 }}>{lib.category}</span>}
                </div>
                <div className="item-sub">{preview(lib)}</div>
              </div>
              {isSaved ? (
                <span className="tag tag-herb" style={{ flexShrink: 0 }}>
                  <Check size={11} /> Lagt til
                </span>
              ) : (
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => addLibrary(lib)}
                  disabled={busy}
                  style={{ flexShrink: 0 }}
                >
                  Legg til
                </button>
              )}
            </div>
          );
        })}
      </div>
    </Dialog>
  );
}
