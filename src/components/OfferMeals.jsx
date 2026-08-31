import { useMemo, useState } from 'react';
import { ChefHat, Store, ChevronRight } from 'lucide-react';
import {
  rankMealsByOffers, cheapestOfDish, availableDishes,
  coverageLabel, savingLabel, storeLabel,
} from '../lib/offerMeals.js';

/**
 * «Hva kan jeg lage nå?» — tilbudene snudd til middagsforslag.
 *
 * Bevisst ærlig i formuleringene: vi sier hvor mange av varene som er på
 * tilbud, ikke «alt er billig». Mangler førprisen sier vi «minst», aldri
 * et beløp vi ikke kan forsvare.
 */
export function OfferMeals({ meals, offers, onPick, limit = 6 }) {
  const [expanded, setExpanded] = useState(false);
  // null = «alt», ellers en rettfamilie («billigste burger»).
  const [dish, setDish] = useState(null);

  const dishes = useMemo(() => availableDishes(meals).filter((d) => d.count >= 2), [meals]);
  const ranked = useMemo(
    () => (dish
      ? cheapestOfDish(dish, meals, offers, { limit: 12 })
      : rankMealsByOffers(meals, offers, { limit: 12 })),
    [meals, offers, dish],
  );

  // Uten treff i «alt»-visningen finnes det ingenting å vise i det hele
  // tatt. Med en valgt rettfamilie skal seksjonen stå, slik at man kan
  // bytte tilbake — «ingen burger er på tilbud» er også et svar.
  if (!ranked.length && !dish) return null;
  const shown = expanded ? ranked : ranked.slice(0, limit);

  return (
    <>
      <div className="section-head" style={{ paddingBottom: 4 }}>
        <span className="section-title">
          <ChefHat size={13} style={{ verticalAlign: -2, color: 'var(--color-herb)' }} /> Billig middag akkurat nå
        </span>
        <span className="text-muted" style={{ fontSize: 11 }}>{ranked.length}</span>
      </div>
      <p className="text-muted" style={{ padding: '0 var(--space-4) 8px', fontSize: 12.5, lineHeight: 1.5, margin: 0 }}>
        Middager der flere av ingrediensene er på tilbud denne uka. Hovedvaren
        teller mest — så kroner spart. Velg en type rett for å finne den
        billigste varianten av den.
      </p>

      {dishes.length > 0 && (
        <div className="row" style={{ flexWrap: 'wrap', gap: 6, padding: '0 var(--space-4) 10px' }}>
          <button
            type="button"
            className={`tag tag-button ${dish === null ? 'tag-accent' : 'tag-outline'}`}
            aria-pressed={dish === null}
            onClick={() => { setDish(null); setExpanded(false); }}
          >
            Alt
          </button>
          {dishes.map((d) => (
            <button
              key={d.id}
              type="button"
              className={`tag tag-button ${dish === d.id ? 'tag-accent' : 'tag-outline'}`}
              aria-pressed={dish === d.id}
              onClick={() => { setDish(d.id); setExpanded(false); }}
            >
              {d.label}
            </button>
          ))}
        </div>
      )}

      {dish && ranked.length === 0 && (
        <p className="text-muted" style={{ padding: '0 var(--space-4) var(--space-3)', fontSize: 13, margin: 0 }}>
          Ingen av disse rettene har varer på tilbud denne uka.
        </p>
      )}

      <div className="stack" style={{ gap: 10, padding: '4px var(--space-4) var(--space-2)' }}>
        {shown.map((s) => {
          const saving = savingLabel(s);
          const store = storeLabel(s);
          return (
            <div key={s.meal.id ?? s.meal.name} className="card" style={{ padding: 'var(--space-3)' }}>
              <div className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="card-title" style={{ fontSize: 16 }}>{s.meal.name}</div>
                  <div className="card-meta">{coverageLabel(s)}</div>
                </div>
                {saving && s.hits.length > 0 && (
                  <span className={`tag ${s.savedKnown ? 'tag-honey' : 'tag-outline'}`} style={{ whiteSpace: 'nowrap' }}>
                    {saving}
                  </span>
                )}
              </div>

              <div className="row" style={{ flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                {s.hits.slice(0, 5).map((h) => (
                  <span
                    key={h.offer.id}
                    className={`tag ${h.weight >= 1 ? 'tag-herb' : 'tag-outline'}`}
                    title={h.offer.match_name || h.offer.product_name}
                  >
                    {h.ingredient}{h.pct > 0 ? ` −${h.pct}%` : ''}
                  </span>
                ))}
              </div>

              {store && (
                <div className="row" style={{ gap: 5, marginTop: 8 }}>
                  <Store size={12} color="var(--color-text-muted)" aria-hidden="true" />
                  <span className="text-muted" style={{ fontSize: 11.5 }}>{store}</span>
                </div>
              )}

              {onPick && (
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{ marginTop: 10 }}
                  onClick={() => onPick(s)}
                >
                  Sjekk og legg til varene <ChevronRight size={13} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {ranked.length > limit && (
        <div style={{ padding: '0 var(--space-4) var(--space-3)' }}>
          <button type="button" className="btn btn-block btn-sm" onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Vis færre' : `Se alle ${ranked.length} middagene`}
          </button>
        </div>
      )}
    </>
  );
}
