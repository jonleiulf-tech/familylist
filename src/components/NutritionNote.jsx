import { useState } from 'react';
import { Info } from 'lucide-react';
import { mealNutrition, nutritionLabel } from '../lib/nutrition.js';

/**
 * Kalorier ved siden av en middag — som prisen, ikke som en dom.
 *
 * Ingen farge som sier «bra» eller «dårlig», ingen sammenligning mot en
 * kostholdsnorm, ingen sum over dagen. Bare tallet, hvor mange av varene
 * det bygger på, og en åpen forklaring på hva som er usikkert.
 */
export function NutritionNote({ meal, servings = 4, show }) {
  const [open, setOpen] = useState(false);
  if (!show) return null;

  const n = mealNutrition(meal, servings);
  const label = nutritionLabel(n);
  if (!label) return null;

  return (
    <div style={{ marginTop: 6 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="row"
        style={{
          gap: 5, background: 'none', border: 0, padding: 0, cursor: 'pointer',
          font: 'inherit', color: 'var(--color-text-muted)', textAlign: 'left',
        }}
        aria-expanded={open}
      >
        <span className="tnum" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-text)' }}>
          {label.main}
        </span>
        <span style={{ fontSize: 11.5 }}>{label.sub}</span>
        <Info size={11} aria-hidden="true" />
      </button>

      {open && (
        <p className="text-muted" style={{ fontSize: 11, lineHeight: 1.55, margin: '6px 0 0' }}>
          Anslag basert på mengdene i oppskriften, delt på {servings}{' '}
          {servings === 1 ? 'porsjon' : 'porsjoner'}. Tilberedning teller ikke
          med, og næringstallene er foreløpig omtrentlige — de erstattes av
          Matvaretabellen fra Mattilsynet.
          {n.unresolved.length > 0 && (
            <> Ikke medregnet: {n.unresolved.join(', ')}.</>
          )}
        </p>
      )}
    </div>
  );
}
