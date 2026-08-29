import { useMemo, useState } from 'react';
import { ReviewDialog } from '../components/ReviewDialog.jsx';
import { Dialog } from '../components/Dialog.jsx';
import { dayLabel } from '../lib/format.js';
import { resolveCatalogItem, guessUnit } from '../lib/catalog.js';

/**
 * Middagsplanen. Dagskort med middag og knapper for å velge/endre/hoppe over.
 * «Ingredienser →» samler alle planlagte middagers ingredienser (summert på
 * tvers av middager) og sender dem gjennom den delte gjennomgangsdialogen.
 */
export function Meals({
  plan, meals, mealLibrary, catalog, normRules, defaultStore,
  existingNames, onSetMeal, onSkipDay, onAddDays, onSendToList,
}) {
  const [picker, setPicker] = useState(null);        // dato det velges middag for
  const [review, setReview] = useState(null);        // rader til gjennomgangsdialogen

  const allMeals = useMemo(() => {
    const seen = new Set(meals.map((m) => m.name.toLowerCase()));
    return [
      ...meals.map((m) => ({ name: m.name, category: m.category, ingredients: m.ingredients, saved: true })),
      ...mealLibrary
        .filter((m) => !seen.has(m.name.toLowerCase()))
        .map((m) => ({ name: m.name, category: m.category, ingredients: m.ingredients, saved: false })),
    ];
  }, [meals, mealLibrary]);

  /** Gjør [{n, qty}] om til rader gjennomgangsdialogen forstår. */
  const toRows = (ingredients) => ingredients.map((ing) => {
    const { name, item } = resolveCatalogItem(ing.n, catalog, normRules);
    return {
      name,
      qty: Number(ing.qty) || 1,
      unit: guessUnit(name, item?.major_category),
      category: item?.major_category || 'Annet',
      store: item?.primary_store || defaultStore,
      price: item?.avg_price ?? null,
      price_source: item?.avg_price ? 'receipt' : null,
    };
  });

  /** Alle planlagte middagers ingredienser, summert per vare. */
  const collectAll = () => {
    const totals = new Map();
    plan.forEach((day) => {
      if (!day.meal_name || day.skipped) return;
      const meal = allMeals.find((m) => m.name === day.meal_name);
      (meal?.ingredients ?? []).forEach((ing) => {
        const key = ing.n.toLowerCase();
        totals.set(key, { n: ing.n, qty: (totals.get(key)?.qty ?? 0) + (Number(ing.qty) || 1) });
      });
    });
    setReview({ title: 'Ingredienser til planen', rows: toRows([...totals.values()]) });
  };

  return (
    <div>
      <div className="section-head">
        <span className="section-title">Middagsplan</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={collectAll} disabled={!plan.length}>
          Ingredienser →
        </button>
      </div>

      {plan.map((day) => (
        <div key={day.plan_date} className="item-row" style={{ alignItems: 'flex-start' }}>
          <div className="item-mid">
            <div className="card-kicker" style={{ marginBottom: 2 }}>{dayLabel(day.plan_date)}</div>
            <div className="item-name">
              {day.skipped ? <span className="text-muted">Hoppet over</span> : (day.meal_name ?? '—')}
            </div>
            {day.reason && <div className="item-sub">{day.reason}</div>}
          </div>
          <div className="stack" style={{ gap: 4 }}>
            <button type="button" className="btn btn-sm" onClick={() => setPicker(day.plan_date)}>
              {day.meal_name ? 'Endre' : 'Velg'}
            </button>
            {!day.skipped && day.meal_name && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onSkipDay(day.plan_date)}>
                Hopp over
              </button>
            )}
          </div>
        </div>
      ))}

      {!plan.length && (
        <p className="text-muted" style={{ padding: 'var(--space-5) var(--space-4)', fontSize: 13 }}>
          Ingen dager planlagt ennå.
        </p>
      )}

      <div className="row" style={{ padding: 'var(--space-4)', gap: 8 }}>
        <button type="button" className="btn" style={{ flex: 1 }} onClick={() => onAddDays(1)}>
          + Legg til en dag
        </button>
        <button type="button" className="btn" style={{ flex: 1 }} onClick={() => onAddDays(7)}>
          + Legg til en uke
        </button>
      </div>

      {/* Middagvelger — valgt middag åpner ingrediens-gjennomgangen umiddelbart */}
      {picker && (
        <Dialog title="Velg middag" subtitle={dayLabel(picker)} onClose={() => setPicker(null)}>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {allMeals.map((m) => (
              <button
                key={m.name}
                type="button"
                className={`tag tag-button ${m.saved ? 'tag-accent' : 'tag-outline'}`}
                onClick={async () => {
                  await onSetMeal(picker, m);
                  setPicker(null);
                  setReview({ title: `Ingredienser til ${m.name}`, rows: toRows(m.ingredients ?? []) });
                }}
              >
                {m.name}
              </button>
            ))}
          </div>
        </Dialog>
      )}

      {review && (
        <ReviewDialog
          title={review.title}
          subtitle="Juster antall før du sender til handlelisten"
          rows={review.rows}
          existingNames={existingNames}
          onCancel={() => setReview(null)}
          onSubmit={async (rows) => { await onSendToList(rows); setReview(null); }}
        />
      )}
    </div>
  );
}
