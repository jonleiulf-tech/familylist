import { useMemo, useState } from 'react';
import { Sparkles, Lock, LockOpen, ShoppingCart } from 'lucide-react';
import { ReviewDialog } from '../components/ReviewDialog.jsx';
import { Dialog } from '../components/Dialog.jsx';
import { dayLabel } from '../lib/format.js';
import { resolveCatalogItem, guessUnit } from '../lib/catalog.js';
import { generatePlan } from '../lib/planner.js';
import { ruleProgress } from '../lib/rulesInsights.js';
import { kr, isoDate } from '../lib/format.js';

/**
 * Middagsplanen. Dagskort med middag og knapper for å velge/endre/hoppe over.
 * «Ingredienser →» samler alle planlagte middagers ingredienser (summert på
 * tvers av middager) og sender dem gjennom den delte gjennomgangsdialogen.
 */
export function Meals({
  plan, meals, mealLibrary, catalog, normRules, defaultStore, rules, history,
  existingNames, onSetMeal, onSkipDay, onAddDays, onToggleLock, onSendToList, onApplyGenerated, toast,
}) {
  const [picker, setPicker] = useState(null);        // dato det velges middag for
  const [review, setReview] = useState(null);        // rader til gjennomgangsdialogen
  const [preview, setPreview] = useState(null);      // forslag fra «Generer plan»
  const [busy, setBusy] = useState(false);

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

  // ---- Fliser: regelframdrift, estimert budsjett og dekning ---------------
  const progress = useMemo(
    () => ruleProgress(rules ?? [], plan, allMeals).slice(0, 2),
    [rules, plan, allMeals],
  );

  const weekBudget = useMemo(() => plan.reduce((sum, day) => {
    if (!day.meal_name || day.skipped) return sum;
    const meal = allMeals.find((m) => m.name === day.meal_name);
    return sum + (meal?.ingredients ?? []).reduce((s, ing) => {
      const { item } = resolveCatalogItem(ing.n, catalog, normRules);
      return s + (item?.avg_price ?? 0) * (Number(ing.qty) || 1);
    }, 0);
  }, 0), [plan, allMeals, catalog, normRules]);

  const plannedCount = plan.filter((d) => d.meal_name && !d.skipped).length;
  const todayIso = isoDate(new Date());

  const openDayCount = plan.filter(
    (d) => !d.locked && !d.done && !d.skipped && !d.meal_name,
  ).length;

  const generate = () => {
    const suggestions = generatePlan({ plan, meals: allMeals, rules, history });
    if (!suggestions.length) {
      toast(openDayCount ? 'Fant ingen middager å foreslå' : 'Alle dagene er alt planlagt');
      return;
    }
    setPreview(suggestions);
  };

  const acceptGenerated = async () => {
    setBusy(true);
    try {
      await onApplyGenerated(preview, allMeals);
      toast(`Fylte ${preview.length} ${preview.length === 1 ? 'dag' : 'dager'}`);
      setPreview(null);
    } finally {
      setBusy(false);
    }
  };

  const Tile = ({ value, label, warn }) => (
    <div style={{
      background: 'var(--color-surface)',
      border: '2px solid var(--color-divider)',
      padding: '12px 14px',
    }}>
      <div style={{
        fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22,
        letterSpacing: '-0.02em', lineHeight: 1.1,
        color: warn ? 'var(--color-accent)' : 'var(--color-text)',
      }}>
        {value}
      </div>
      <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>{label}</div>
    </div>
  );

  return (
    <div>
      {/* ---- Fliser ---- */}
      {plan.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
          padding: 'var(--space-4) var(--space-4) var(--space-3)',
        }}>
          {progress.map((p) => (
            <Tile key={p.rule.id ?? p.rule.scope} value={p.value} label={p.label} warn={p.over} />
          ))}
          <Tile value={weekBudget > 0 ? `ca. ${Math.round(weekBudget)}` : '—'} label="Est. budsjett (kr)" />
          <Tile value={`${plannedCount}/${plan.length}`} label="Planlagt" />
        </div>
      )}

      <div className="section-head" style={{ paddingTop: plan.length ? 0 : undefined }}>
        <span className="section-title">Middagsplan{plan.length ? ` · ${plan.length} dager` : ''}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={collectAll} disabled={!plan.length}>
          Ingredienser →
        </button>
      </div>

      {openDayCount > 0 && (
        <div style={{ padding: '0 var(--space-4) var(--space-3)' }}>
          <button type="button" className="btn btn-primary btn-block" onClick={generate}>
            <Sparkles size={16} /> Foreslå ny ukemeny
            <span style={{ marginLeft: 'auto', fontWeight: 400, fontSize: 12 }}>
              {openDayCount} {openDayCount === 1 ? 'tom dag' : 'tomme dager'}
            </span>
          </button>
        </div>
      )}

      {plan.map((day) => {
        const meal = day.meal_name ? allMeals.find((m) => m.name === day.meal_name) : null;
        return (
          <div key={day.plan_date} className="item-row" style={{ alignItems: 'flex-start' }}>
            <div className="item-mid" style={{ cursor: 'default' }}>
              <div className="row" style={{ gap: 6 }}>
                <span className="card-kicker" style={{ marginBottom: 0 }}>{dayLabel(day.plan_date)}</span>
                {day.plan_date === todayIso && <span className="tag tag-accent" style={{ fontSize: 9 }}>I dag</span>}
                {day.locked && <Lock size={11} aria-label="Låst" />}
              </div>
              <div className="item-name" style={{ marginTop: 3 }}>
                {day.skipped ? <span className="text-muted">Hoppet over</span> : (day.meal_name ?? '—')}
              </div>
              {day.reason && <div className="item-sub">{day.reason}</div>}
              {meal?.category && (
                <span className="tag tag-outline" style={{ marginTop: 5, fontSize: 10 }}>{meal.category}</span>
              )}
            </div>
            <div className="stack" style={{ gap: 4 }}>
              <button type="button" className="btn btn-sm" onClick={() => setPicker(day.plan_date)}>
                {day.meal_name ? 'Endre' : 'Velg'}
              </button>
              {day.meal_name && !day.skipped && (
                <>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setReview({
                      title: `Ingredienser til ${day.meal_name}`,
                      rows: toRows(meal?.ingredients ?? []),
                    })}
                  >
                    <ShoppingCart size={13} /> Til lista
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => onToggleLock(day.plan_date, !day.locked)}
                    aria-pressed={day.locked}
                  >
                    {day.locked ? <><LockOpen size={13} /> Lås opp</> : <><Lock size={13} /> Lås</>}
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => onSkipDay(day.plan_date)}>
                    Hopp over
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}

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

      {preview && (
        <Dialog
          title="Forslag til planen"
          subtitle={`${preview.length} ${preview.length === 1 ? 'dag' : 'dager'} fylt fra regler og historikk`}
          onClose={() => setPreview(null)}
          footer={
            <div className="row" style={{ gap: 8 }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={acceptGenerated}
                disabled={busy}
              >
                {busy ? 'Lagrer …' : 'Bruk planen'}
              </button>
              <button type="button" className="btn" onClick={generate} disabled={busy}>
                Prøv igjen
              </button>
            </div>
          }
        >
          <div className="stack" style={{ gap: 0 }}>
            {preview.map((d) => (
              <div key={d.plan_date} className="item-row" style={{ paddingLeft: 0, paddingRight: 0 }}>
                <div className="item-mid">
                  <div className="card-kicker" style={{ marginBottom: 2 }}>{dayLabel(d.plan_date)}</div>
                  <div className="item-name">{d.meal_name}</div>
                  <div className="item-sub">{d.reason}</div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-muted" style={{ fontSize: 11, marginTop: 'var(--space-3)' }}>
            Låste dager og dager dere alt har spist er ikke rørt. «Prøv igjen»
            gir et nytt forslag.
          </p>
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
