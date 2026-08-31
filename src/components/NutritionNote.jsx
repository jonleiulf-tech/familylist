import { useState } from 'react';
import { Info } from 'lucide-react';
import { mealNutrition, nutritionLabel } from '../lib/nutrition.js';
import { formatPortions } from '../lib/portions.js';

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
    <div style={{ marginTop: 4 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="row"
        style={{
          gap: 5, rowGap: 1, flexWrap: 'wrap', background: 'none', border: 0, padding: 0,
          cursor: 'pointer', font: 'inherit', color: 'var(--color-text-muted)', textAlign: 'left',
        }}
        aria-expanded={open}
      >
        {/* Vekten til et faktum, ikke til en overskrift: tallet er lesbart,
            men skal aldri konkurrere med middagsnavnet rett over. */}
        <span className="tnum" style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text)' }}>
          {label.main}
        </span>
        <span style={{ fontSize: 11.5, lineHeight: 1.35 }}>
          {label.sub}{label.reliable ? '' : ' · usikkert anslag'}
        </span>
        <Info size={11} aria-hidden="true" style={{ flexShrink: 0, opacity: 0.7 }} />
      </button>

      {open && (
        <p
          className="text-muted"
          style={{
            fontSize: 11, lineHeight: 1.55, margin: '6px 0 0',
            paddingLeft: 9, borderLeft: '2px solid var(--color-divider)',
          }}
        >
          Anslag basert på mengdene i oppskriften, delt på {formatPortions(servings)}{' '}
          {servings === 1 ? 'porsjon' : 'porsjoner'}. Tilberedning teller ikke
          med, og næringstallene er egne anslag per vare — ikke offisielle tall.
          {n.unresolved.length > 0 && (
            <> Ikke medregnet: {n.unresolved.join(', ')}.</>
          )}
        </p>
      )}
    </div>
  );
}
