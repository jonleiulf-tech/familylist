import { useMemo, useState } from 'react';
import { Sparkles, Lock, ShoppingCart, Plus, BookOpen } from 'lucide-react';
import { ReviewDialog } from '../components/ReviewDialog.jsx';
import { InspirationDialog } from '../components/InspirationDialog.jsx';
import { candidateToMeal } from '../lib/recipes/inspiration.js';
import { Dialog } from '../components/Dialog.jsx';
import { dayLabel } from '../lib/format.js';
import { resolveCatalogItem, guessUnit } from '../lib/catalog.js';
import { generatePlan } from '../lib/planner.js';
import { ruleProgress } from '../lib/rulesInsights.js';
import { MealEditorDialog } from '../components/MealEditorDialog.jsx';
import { kr, isoDate, shortDate } from '../lib/format.js';

/**
 * Middagsplanen. Dagskort med middag og knapper for å velge/endre/hoppe over.
 * «Ingredienser →» samler alle planlagte middagers ingredienser (summert på
 * tvers av middager) og sender dem gjennom den delte gjennomgangsdialogen.
 */
export function Meals({
  plan, meals, mealLibrary, catalog, normRules, defaultStore, rules, history,
  existingNames, onSetMeal, onSkipDay, onAddDays, onToggleLock, onSaveMeal, onSendToList, onApplyGenerated, toast,
}) {
  const [picker, setPicker] = useState(null);        // dato det velges middag for
  const [review, setReview] = useState(null);        // rader til gjennomgangsdialogen
  const [multiSend, setMultiSend] = useState(null);  // { days:Set, extras:Set } for fler-dagers sending
  const [preview, setPreview] = useState(null);      // forslag fra «Generer plan»
  const [busy, setBusy] = useState(false);
  const [showNewMeal, setShowNewMeal] = useState(false);
  const [showAllMeals, setShowAllMeals] = useState(false);
  const [showInspiration, setShowInspiration] = useState(false);

  /**
   * Valgt oppskrift fra kokeboka: lagres som middag (familieoppskrift) og
   * ingrediensene, koblet mot vår varedatabase, går rett til gjennomgang.
   */
  const pickInspiration = async (candidate) => {
    const { meal, rows, unmatched } = candidateToMeal(candidate, catalog, normRules);
    const exists = meals.some((m) => m.name.toLowerCase() === meal.name.toLowerCase());
    if (!exists) {
      const err = await onSaveMeal({ id: null, ...meal });
      if (err) { toast(err); return; }
    }
    setShowInspiration(false);
    toast(exists
      ? `«${meal.name}» finnes alt i lagrede middager`
      : `«${meal.name}» lagret i lagrede middager`);
    setReview({
      title: `Ingredienser til ${meal.name}`,
      subtitle: unmatched.length
        ? `${unmatched.length} ${unmatched.length === 1 ? 'ingrediens' : 'ingredienser'} fant ingen kjent vare — sjekk dem ekstra`
        : undefined,
      rows: rows.map((r) => ({
        name: r.name,
        qty: r.qty ?? 1,
        unit: r.unit ?? guessUnit(r.name, r.catalog_item?.major_category, r.qty ?? 1),
        category: r.catalog_item?.major_category || 'Annet',
        store: r.catalog_item?.primary_store || defaultStore,
        price: r.catalog_item?.avg_price ?? null,
        price_source: r.catalog_item?.avg_price ? 'receipt' : null,
      })),
      mealName: meal.name,
    });
  };

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
      unit: guessUnit(name, item?.major_category, Number(ing.qty) || 1),
      category: item?.major_category || 'Annet',
      store: item?.primary_store || defaultStore,
      price: item?.avg_price ?? null,
      price_source: item?.avg_price ? 'receipt' : null,
    };
  });

  /**
   * «Send til handlelisten for flere dager»: velg hvilke dager i planen (og
   * ev. lagrede middager utenom planen) som skal med, så summeres alle
   * ingrediensene til én gjennomgang.
   */
  const openMultiSend = () => {
    const days = new Set(
      plan
        .filter((d) => d.meal_name && !d.skipped && !d.done)
        .map((d) => d.plan_date),
    );
    setMultiSend({ days, extras: new Set() });
  };

  const submitMultiSend = () => {
    const totals = new Map();
    const add = (ingredients) => (ingredients ?? []).forEach((ing) => {
      const key = ing.n.toLowerCase();
      totals.set(key, { n: ing.n, qty: (totals.get(key)?.qty ?? 0) + (Number(ing.qty) || 1) });
    });
    let count = 0;
    plan.forEach((day) => {
      if (!multiSend.days.has(day.plan_date) || !day.meal_name || day.skipped) return;
      add(allMeals.find((m) => m.name === day.meal_name)?.ingredients);
      count += 1;
    });
    multiSend.extras.forEach((name) => {
      add(allMeals.find((m) => m.name === name)?.ingredients);
      count += 1;
    });
    if (!count) return;
    setMultiSend(null);
    setReview({
      title: `Ingredienser til ${count} ${count === 1 ? 'middag' : 'middager'}`,
      rows: toRows([...totals.values()]),
    });
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

  /**
   * Middagstag: legg på første ledige dag. Middagen lagres i planen med en
   * gang — ingrediensene sendes til handlelisten når uken er klar, via
   * «Send til handlelisten»-knappen (flere dager) eller per dag.
   */
  const quickPlan = async (m) => {
    const free = plan.find((d) => !d.meal_name && !d.skipped && !d.locked);
    let date = free?.plan_date;
    if (!date) {
      const last = plan[plan.length - 1]?.plan_date;
      const next = last ? new Date(`${last}T12:00:00`) : new Date();
      if (last) next.setDate(next.getDate() + 1);
      date = isoDate(next);
    }
    await onSetMeal(date, m);
    toast(`«${m.name}» lagret på ${dayLabel(date).toLowerCase()}`);
  };

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
      border: '1px solid var(--color-divider)',
      borderRadius: 'var(--radius)',
      boxShadow: 'var(--shadow-sm)',
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
        <button type="button" className="btn btn-ghost btn-sm" onClick={openMultiSend} disabled={!plan.length}>
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
        const savedMeal = day.meal_name ? meals.find((m) => m.name === day.meal_name) : null;
        const isToday = day.plan_date === todayIso;
        const empty = !day.meal_name && !day.skipped;
        return (
          <div key={day.plan_date} style={{ borderBottom: '2px solid var(--color-divider)' }}>
            {/* Datostripe */}
            <div className="row-between" style={{ background: 'var(--color-bg-sunken)', padding: '6px var(--space-4)' }}>
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em' }}>
                {shortDate(day.plan_date)}
              </span>
              <span className="row" style={{ gap: 6 }}>
                {day.locked && <Lock size={11} aria-label="Låst" />}
                {isToday && <span className="tag tag-accent" style={{ fontSize: 9 }}>I dag</span>}
              </span>
            </div>

            {empty ? (
              <div style={{ padding: '8px var(--space-4)' }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ color: 'var(--color-accent)', fontWeight: 600, paddingLeft: 0 }}
                  onClick={() => setPicker(day.plan_date)}
                >
                  + Legg til middag
                </button>
              </div>
            ) : (
              <>
                <div className="row" style={{ padding: '12px var(--space-4)', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16, letterSpacing: '-0.015em' }}>
                      {day.skipped ? <span className="text-muted" style={{ fontWeight: 400 }}>Hoppet over</span> : day.meal_name}
                    </div>
                    {day.reason && !day.skipped && <div className="item-sub" style={{ marginTop: 2 }}>{day.reason}</div>}
                    {meal?.category && !day.skipped && (
                      <span className="tag" style={{
                        marginTop: 6,
                        background: 'var(--color-accent-100)',
                        borderColor: 'var(--color-accent-100)',
                        color: 'var(--color-accent-700)',
                      }}>
                        {meal.category}
                      </span>
                    )}
                  </div>

                  {!day.skipped && (
                    <div className="stack" style={{ gap: 6, flexShrink: 0 }}>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => onToggleLock(day.plan_date, !day.locked)}
                        aria-pressed={day.locked}
                      >
                        {day.locked ? 'Låst' : 'Lås'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => setReview({
                          title: `Ingredienser til ${day.meal_name}`,
                          rows: toRows(meal?.ingredients ?? []),
                          mealName: day.meal_name,
                        })}
                      >
                        <ShoppingCart size={13} /> Legg til i handleliste
                      </button>
                    </div>
                  )}
                </div>

                {/* Tre like knapper, som i designet */}
                <div style={{ display: 'flex', borderTop: '1px solid var(--color-divider-soft)' }}>
                  {!day.skipped && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ flex: 1, justifyContent: 'center', borderRight: '1px solid var(--color-divider-soft)', fontSize: 13 }}
                      onClick={() => setReview({
                        title: `Ingredienser til ${day.meal_name}`,
                        rows: toRows(meal?.ingredients ?? []),
                        mealName: day.meal_name,
                      })}
                    >
                      Endre middag
                    </button>
                  )}
                  {!day.skipped && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ flex: 1, justifyContent: 'center', borderRight: '1px solid var(--color-divider-soft)', fontSize: 13 }}
                      onClick={() => onSkipDay(day.plan_date)}
                    >
                      Hopp over
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ flex: 1, justifyContent: 'center', fontSize: 13 }}
                    onClick={() => setPicker(day.plan_date)}
                  >
                    Velg
                  </button>
                </div>
              </>
            )}
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

      {plannedCount > 0 && (
        <div style={{ padding: '0 var(--space-4) var(--space-4)' }}>
          <button type="button" className="btn btn-primary btn-block" onClick={openMultiSend}>
            <ShoppingCart size={16} /> Send til handlelisten for flere dager
          </button>
        </div>
      )}

      {/* ---------- Lagrede middager ---------- */}
      <hr className="divider" />
      <div className="section-head">
        <span className="section-title">Lagrede middager</span>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => setShowNewMeal(true)}
        >
          <Plus size={14} /> Legg til ny middag
        </button>
      </div>
      <div style={{ padding: '0 var(--space-4) var(--space-2)' }}>
        <button type="button" className="btn btn-block" onClick={() => setShowInspiration(true)}>
          <BookOpen size={15} /> Hent inspirasjon — søk i kokeboka
        </button>
      </div>
      <p className="text-muted" style={{ padding: '0 var(--space-4) var(--space-2)', fontSize: 12, margin: 0 }}>
        Trykk på en middag for å lagre den på første ledige dag. Ingrediensene
        sender du til handlelisten når uken er klar — samlet for flere dager,
        eller per dag med «Legg til i handleliste».
      </p>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6, padding: '0 var(--space-4) var(--space-4)' }}>
        {(showAllMeals ? meals : meals.slice(0, 18)).map((m) => (
          <button
            key={m.id}
            type="button"
            className="tag tag-button tag-outline"
            onClick={() => quickPlan(m)}
          >
            {m.name}
          </button>
        ))}
        {!showAllMeals && meals.length > 18 && (
          <button type="button" className="tag tag-button tag-neutral" onClick={() => setShowAllMeals(true)}>
            +{meals.length - 18} flere
          </button>
        )}
        {meals.length === 0 && (
          <span className="text-muted" style={{ fontSize: 13 }}>
            Ingen lagrede middager ennå.
          </span>
        )}
      </div>

      {/* Middagvelger — valgt middag lagres i planen; ingredienser sendes senere */}
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
                  toast(`«${m.name}» lagret på ${dayLabel(picker).toLowerCase()}`);
                }}
              >
                {m.name}
              </button>
            ))}
          </div>
          <p className="text-muted" style={{ fontSize: 11, marginTop: 'var(--space-3)', marginBottom: 0 }}>
            Middagen lagres i planen. Send ingrediensene til handlelisten når du
            er fornøyd med uken — samlet for flere dager, eller per dag.
          </p>
        </Dialog>
      )}

      {showNewMeal && (
        <MealEditorDialog
          mealLibrary={mealLibrary}
          savedNames={new Set(meals.map((m) => m.name.toLowerCase()))}
          onClose={() => setShowNewMeal(false)}
          onCreate={async (data) => {
            const err = await onSaveMeal({ id: null, ...data });
            if (!err) toast(`«${data.name}» lagt til i lagrede middager`);
            return err;
          }}
        />
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

      {/* Fler-dagers sending: velg dager i planen og ev. ekstra middager */}
      {multiSend && (() => {
        const sendable = plan.filter((d) => d.meal_name && !d.skipped);
        const selCount = sendable.filter((d) => multiSend.days.has(d.plan_date)).length
          + multiSend.extras.size;
        const toggleDay = (date) => {
          const days = new Set(multiSend.days);
          days.has(date) ? days.delete(date) : days.add(date);
          setMultiSend({ ...multiSend, days });
        };
        const toggleExtra = (name) => {
          const extras = new Set(multiSend.extras);
          extras.has(name) ? extras.delete(name) : extras.add(name);
          setMultiSend({ ...multiSend, extras });
        };
        return (
          <Dialog
            title="Send til handlelisten"
            subtitle="Velg dagene som skal med — ingrediensene summeres på tvers"
            onClose={() => setMultiSend(null)}
            footer={
              <button
                type="button"
                className="btn btn-primary btn-block"
                onClick={submitMultiSend}
                disabled={!selCount}
              >
                <ShoppingCart size={15} />
                {selCount
                  ? `Gjennomgå ingredienser (${selCount} ${selCount === 1 ? 'middag' : 'middager'})`
                  : 'Velg minst én middag'}
              </button>
            }
          >
            {sendable.length === 0 && (
              <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
                Ingen dager i planen har middag ennå — velg middager på dagene
                først, eller huk av lagrede middager under.
              </p>
            )}
            {sendable.map((day) => (
              <label key={day.plan_date} className="item-row" style={{ paddingLeft: 0, paddingRight: 0, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={multiSend.days.has(day.plan_date)}
                  onChange={() => toggleDay(day.plan_date)}
                />
                <div className="item-mid">
                  <div className="item-name">{dayLabel(day.plan_date)}</div>
                  <div className="item-sub">
                    {day.meal_name}{day.done ? ' · allerede spist' : ''}
                  </div>
                </div>
              </label>
            ))}
            {meals.length > 0 && (
              <>
                <div className="card-kicker" style={{ marginTop: 'var(--space-4)', marginBottom: 4 }}>
                  Lagrede middager utenom planen
                </div>
                <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                  {meals
                    .filter((m) => !sendable.some((d) => d.meal_name === m.name))
                    .map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className={`tag tag-button ${multiSend.extras.has(m.name) ? 'tag-accent' : 'tag-outline'}`}
                        aria-pressed={multiSend.extras.has(m.name)}
                        onClick={() => toggleExtra(m.name)}
                      >
                        {multiSend.extras.has(m.name) ? '✓ ' : ''}{m.name}
                      </button>
                    ))}
                </div>
              </>
            )}
          </Dialog>
        );
      })()}

      {showInspiration && (
        <InspirationDialog
          onClose={() => setShowInspiration(false)}
          onPick={pickInspiration}
        />
      )}

      {review && (
        <ReviewDialog
          title={review.title}
          subtitle={review.subtitle ?? 'Juster antall før du sender til handlelisten'}
          rows={review.rows}
          existingNames={existingNames}
          onCancel={() => setReview(null)}
          onSubmit={async (selected, all) => {
            // Redigerte mengder lagres som familieoppskrift og gjenbrukes
            // alle steder middagen refereres — også avhukede rader beholdes
            // i oppskriften, de var bare ikke nødvendige å kjøpe nå.
            if (review.mealName && all?.length) {
              const saved = meals.find((m) => m.name === review.mealName);
              if (saved) {
                await onSaveMeal({
                  id: saved.id,
                  name: saved.name,
                  category: saved.category,
                  ingredients: all.map((r) => ({ n: r.name, qty: r.qty })),
                });
              }
            }
            await onSendToList(selected);
            setReview(null);
          }}
        />
      )}
    </div>
  );
}
