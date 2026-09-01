import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Sparkles, Lock, ShoppingCart, Plus, BookOpen, Users, Minus, X, CalendarDays, Copy, SlidersHorizontal, Check } from 'lucide-react';
import { ReviewDialog } from '../components/ReviewDialog.jsx';
// Kokebok-søket lastes først når dialogen åpnes — holder oppstarten lett.
const InspirationDialog = lazy(() =>
  import('../components/InspirationDialog.jsx').then((m) => ({ default: m.InspirationDialog })));
// Dagvelgeren åpnes bare når en middag skal plasseres.
const DayPickerDialog = lazy(() =>
  import('../components/DayPickerDialog.jsx').then((m) => ({ default: m.DayPickerDialog })));
import { candidateToMeal } from '../lib/recipes/inspiration.js';
import { Dialog } from '../components/Dialog.jsx';
import { dayLabel } from '../lib/format.js';
import { resolveCatalogItem, guessUnit } from '../lib/catalog.js';
import { generatePlan, PLAN_MODES } from '../lib/planner.js';
import { ruleProgress } from '../lib/rulesInsights.js';
import { MealEditorDialog } from '../components/MealEditorDialog.jsx';
import { MealDetailsDialog } from '../components/MealDetailsDialog.jsx';
import {
  householdPortions, portionLabel, formatPortions, mealScaleFactor, scaleQty,
} from '../lib/portions.js';
import { kr, isoDate, shortDate, estimateCost } from '../lib/format.js';
import { loadNutritionPref, saveNutritionPref } from '../lib/nutrition.js';
import { NutritionNote } from '../components/NutritionNote.jsx';

/**
 * Middagsplanen. Dagskort med middag og knapper for å velge/endre/hoppe over.
 * «Ingredienser →» samler alle planlagte middagers ingredienser (summert på
 * tvers av middager) og sender dem gjennom den delte gjennomgangsdialogen.
 */
/**
 * Middagsbiblioteket er skrevet for 2 voksne + 2 barn = 3 porsjoner, slik
 * skjemakommentaren sier. meal_library har ingen base_servings-kolonne, så
 * uten dette ble bibliotekmiddager aldri skalert til familiens størrelse.
 */
const LIBRARY_BASE_SERVINGS = 3;

/**
 * Tilstandsmerke i datostripen: låst, spist, hoppet over. Små versaler i
 * stripen i stedet for farge på hele kortet — dagen skal kunne leses på
 * en halv skjermlengde uten at noen av tilstandene roper.
 */
function DayMark({ icon: Icon, text, tone }) {
  return (
    <span
      className="row"
      style={{
        gap: 4,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '.07em',
        textTransform: 'uppercase',
        color: tone === 'herb' ? 'var(--color-herb-600)' : 'var(--color-text-muted)',
      }}
    >
      {Icon && <Icon size={10} aria-hidden="true" />}
      {text}
    </span>
  );
}

export function Meals({
  plan, meals, mealLibrary, catalog, normRules, defaultStore, rules, history,
  existingNames, household, onSetMeal, onSkipDay, onAddDays, onToggleLock,
  onSaveMeal, onDeleteMeal, onSetGuests, onSavePortions, onSendToList, onApplyGenerated,
  onMarkSent, onGoShopping, hiddenMeals, onHideMeal, onUnhideMeal, inspireSignal,
  weekTemplates = [], onRemoveLastDay, onSaveWeekTemplate, onApplyWeekTemplate, onDeleteWeekTemplate,
  rulesPanel, offers = [], toast,
}) {
  const [picker, setPicker] = useState(null);        // dato det velges middag for
  const [dayPick, setDayPick] = useState(null);      // middagen det velges DAG for
  const [review, setReview] = useState(null);        // rader til gjennomgangsdialogen
  const [multiSend, setMultiSend] = useState(null);  // { days:Set, extras:Set } for fler-dagers sending
  const [preview, setPreview] = useState(null);      // forslag fra «Generer plan»
  const [busy, setBusy] = useState(false);
  const [showNewMeal, setShowNewMeal] = useState(false);
  const [showAllMeals, setShowAllMeals] = useState(false);
  const [showInspiration, setShowInspiration] = useState(false);
  // Kalorier er en personlig, avslått-som-standard visning — ikke et fokus
  // i appen, men et faktum for den som vil se det.
  const [showKcal, setShowKcal] = useState(loadNutritionPref);
  // Hvordan de tomme dagene fylles. Reglene er harde uansett — modusen
  // bytter bare rekkefølgen middagene vurderes i.
  const [planMode, setPlanMode] = useState('variert');
  const [inspireForDate, setInspireForDate] = useState(null); // kokebok-valg rett på en dag
  const [details, setDetails] = useState(null);      // { meal, planDay } for detaljdialogen
  const [showPortions, setShowPortions] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showRules, setShowRules] = useState(false);   // preferanser (tidl. Regler-fanen)
  const [saveTemplateName, setSaveTemplateName] = useState(null);  // null = lukket
  const [applyTemplate, setApplyTemplate] = useState(null);        // malen som settes inn
  const [applyDate, setApplyDate] = useState(isoDate(new Date()));

  const famPortions = householdPortions(household);

  // «Hent inspirasjon» kan åpnes utenfra (kortet på Hjem-skjermen).
  useEffect(() => {
    if (inspireSignal) setShowInspiration(true);
  }, [inspireSignal]);

  /**
   * Valgt oppskrift fra kokeboka: lagres som middag (familieoppskrift),
   * mengdene skaleres til familiens porsjoner når oppskriften oppgir sine,
   * og ingrediensene går rett til gjennomgang. Kom valget fra en bestemt
   * dag («hent fra kokeboka» i Velg middag), legges middagen på den dagen.
   */
  const pickInspiration = async (candidate) => {
    const { meal, rows, unmatched, scaledFrom } = candidateToMeal(
      candidate, catalog, normRules, { targetPortions: famPortions },
    );
    const existing = meals.find((m) => m.name.toLowerCase() === meal.name.toLowerCase());
    if (!existing) {
      const err = await onSaveMeal({ id: null, ...meal });
      if (err) { toast(err); return; }
    }
    const forDate = inspireForDate;
    if (forDate) {
      await onSetMeal(forDate, existing ?? meal);
      setInspireForDate(null);
    }
    setShowInspiration(false);
    toast(forDate
      ? `«${meal.name}» lagret på ${dayLabel(forDate).toLowerCase()}`
      : (existing
        ? `«${meal.name}» finnes alt i lagrede middager`
        : `«${meal.name}» lagret i lagrede middager`));
    setReview({
      title: `Ingredienser til ${meal.name}`,
      subtitle: [
        scaledFrom ? `Skalert fra ${formatPortions(scaledFrom)} til ${formatPortions(famPortions)} porsjoner` : null,
        unmatched.length
          ? `${unmatched.length} ${unmatched.length === 1 ? 'ingrediens' : 'ingredienser'} fant ingen kjent vare — sjekk dem ekstra`
          : null,
      ].filter(Boolean).join(' · ') || undefined,
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
      forDates: forDate ? [forDate] : [],
    });
  };

  /**
   * Legg en kokebok-rett rett inn på en valgt dag i planen (uten å tvinge
   * gjennom ingrediens-gjennomgangen — den kan sendes fra dagskortet). Kandidaten
   * er alt slått opp i dialogen. Middagen lagres som familieoppskrift først.
   */
  const planInspiration = async (candidate, date) => {
    const { meal } = candidateToMeal(candidate, catalog, normRules, { targetPortions: famPortions });
    const existing = meals.find((m) => m.name.toLowerCase() === meal.name.toLowerCase());
    if (!existing) {
      const err = await onSaveMeal({ id: null, ...meal });
      if (err) { toast(err); return; }
    }
    await onSetMeal(date, existing ?? meal);
    setShowInspiration(false);
    toast(`«${meal.name}» satt på ${dayLabel(date).toLowerCase()}`);
  };

  const allMeals = useMemo(() => {
    const seen = new Set(meals.map((m) => m.name.toLowerCase()));
    // Slettede biblioteksmiddager («Omelett med skinke») er skjult for denne
    // husholdningen — de foreslås aldri igjen, verken i velgeren eller av
    // «Foreslå ny ukemeny». Lagres navnet på nytt, av-skjules det i App.
    const hidden = new Set((hiddenMeals ?? []).map((n) => String(n).toLowerCase()));
    return [
      // base_servings MÅ være med: «Lettere uke» deler kaloriene på den, og
      // uten feltet ble alle rettene delt på familiens porsjoner i stedet.
      // Da er nevneren lik for alle, og sorteringen blir i praksis på
      // oppskriftens TOTALE kalorier — en rett skrevet for 8 taper alltid.
      ...meals.map((m) => ({
        name: m.name, category: m.category, ingredients: m.ingredients,
        base_servings: m.base_servings ?? null, saved: true,
      })),
      ...mealLibrary
        .filter((m) => !seen.has(m.name.toLowerCase()) && !hidden.has(m.name.toLowerCase()))
        // Biblioteket er skrevet for 2 voksne + 2 barn, altså 3 porsjoner
        // (households-standarden). Kolonnen finnes ikke i meal_library, så
        // den dokumenterte basisen settes her i stedet for å bli borte.
        .map((m) => ({
          name: m.name, category: m.category, ingredients: m.ingredients,
          base_servings: LIBRARY_BASE_SERVINGS, saved: false,
        })),
    ];
  }, [meals, mealLibrary, hiddenMeals]);

  /**
   * Slett en lagret middag (×-knappen). Angre i toasten gjenoppretter alt —
   * også fremgangsmåte og kildelenke. Er middagen fra biblioteket, skjules
   * den samtidig fra alle forslag, så den ikke sniker seg inn igjen.
   */
  const deleteSaved = async (m) => {
    const snapshot = {
      name: m.name, category: m.category, ingredients: m.ingredients,
      instructions: m.instructions ?? null, instructions_url: m.instructions_url ?? null,
      source_label: m.source_label ?? null, base_servings: m.base_servings ?? null,
    };
    const err = await onDeleteMeal(m.id);
    if (err) { toast(err); return; }
    const inLibrary = mealLibrary.some((l) => l.name.toLowerCase() === m.name.toLowerCase());
    if (inLibrary) await onHideMeal(m.name);
    toast(`«${m.name}» slettet${inLibrary ? ' — foreslås ikke igjen' : ''}`, async () => {
      await onSaveMeal({ id: null, ...snapshot });
      if (inLibrary) await onUnhideMeal(m.name);
    });
  };

  /** Skaleringsfaktor for én plandag: familie + dagens gjester mot basis. */
  const dayFactor = (day, meal) =>
    mealScaleFactor(meal?.base_servings, household, Number(day?.guest_portions) || 0);

  /** Gjør [{n, qty}] om til rader gjennomgangsdialogen forstår (ev. skalert). */
  const toRows = (ingredients, factor = 1) => ingredients.map((ing) => {
    const { name, item } = resolveCatalogItem(ing.n, catalog, normRules);
    const raw = Number(ing.qty) || 1;
    // Bruk lagret enhet fra oppskriften; gjett bare når den mangler.
    const unit = ing.unit || guessUnit(name, item?.major_category, raw);
    const qty = scaleQty(raw, factor, unit);   // telle-enheter skaleres til hele
    return {
      name,
      qty,
      unit,
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
    // Hver dags mengder skaleres med DENS faktor (familie + dagens gjester)
    // før de summeres på tvers — søndag med bestemor teller mer enn tirsdag.
    const add = (ingredients, factor = 1) => (ingredients ?? []).forEach((ing) => {
      // Nøkkel på navn OG enhet, så 600 g + 1 pakke ikke summeres til 601.
      const key = `${ing.n.toLowerCase()}|${ing.unit ?? ''}`;
      const qty = scaleQty(Number(ing.qty) || 1, factor, ing.unit);
      totals.set(key, { n: ing.n, unit: ing.unit ?? null, qty: (totals.get(key)?.qty ?? 0) + qty });
    });
    let count = 0;
    plan.forEach((day) => {
      if (!multiSend.days.has(day.plan_date) || !day.meal_name || day.skipped) return;
      const meal = allMeals.find((m) => m.name === day.meal_name);
      const saved = meals.find((m) => m.name === day.meal_name);
      add(meal?.ingredients, dayFactor(day, saved));
      count += 1;
    });
    multiSend.extras.forEach((name) => {
      const saved = meals.find((m) => m.name === name);
      add(allMeals.find((m) => m.name === name)?.ingredients,
        mealScaleFactor(saved?.base_servings, household, 0));
      count += 1;
    });
    if (!count) return;
    const sentDates = plan
      .filter((d) => multiSend.days.has(d.plan_date) && d.meal_name && !d.skipped)
      .map((d) => d.plan_date);
    setMultiSend(null);
    setReview({
      title: `Ingredienser til ${count} ${count === 1 ? 'middag' : 'middager'}`,
      rows: toRows([...totals.values()]),
      forDates: sentDates,
      goToList: true,     // hele uka samlet → hopp til Handel som før
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
    const saved = meals.find((m) => m.name === day.meal_name);
    const factor = dayFactor(day, saved);
    return sum + (meal?.ingredients ?? []).reduce((s, ing) => {
      const { name, item } = resolveCatalogItem(ing.n, catalog, normRules);
      const qty = scaleQty(Number(ing.qty) || 1, factor);
      const unit = guessUnit(name, item?.major_category, qty);
      return s + estimateCost({ price: item?.avg_price, qty, unit });
    }, 0);
  }, 0), [plan, allMeals, meals, catalog, normRules, household]);  // eslint-disable-line react-hooks/exhaustive-deps

  const plannedCount = plan.filter((d) => d.meal_name && !d.skipped).length;
  const todayIso = isoDate(new Date());

  /**
   * Middagstag: legg på første ledige dag. Middagen lagres i planen med en
   * gang — ingrediensene sendes til handlelisten når uken er klar, via
   * «Send til handlelisten»-knappen (flere dager) eller per dag.
   */
  const quickPlan = (m) => setDayPick(m);

  /**
   * Middagen er valgt, dagen er valgt. Sier vi hva som ble byttet ut, kan
   * folk se om de traff feil dag — «lagret» alene forteller ingenting.
   */
  const placeOnDay = async (date, { replaced } = {}) => {
    const m = dayPick;
    setDayPick(null);
    await onSetMeal(date, m);
    toast(replaced
      ? `«${m.name}» erstattet «${replaced}» på ${dayLabel(date).toLowerCase()}`
      : `«${m.name}» satt på ${dayLabel(date).toLowerCase()}`);
  };

  const openDayCount = plan.filter(
    (d) => !d.locked && !d.done && !d.skipped && !d.meal_name,
  ).length;

  const generate = () => {
    const suggestions = generatePlan({
      plan, meals: allMeals, rules, history,
      mode: planMode, offers, servings: famPortions,
    });
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

  const Tile = ({ value, label, warn, tone }) => (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-divider)',
      borderRadius: 'var(--radius)',
      boxShadow: 'var(--shadow-sm)',
      padding: '12px 14px',
    }}>
      <div className="tnum" style={{
        fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22,
        letterSpacing: '-0.02em', lineHeight: 1.1,
        color: warn ? 'var(--color-accent)'
          : tone === 'herb' ? 'var(--color-herb)'
            : tone === 'honey' ? 'var(--color-honey)' : 'var(--color-text)',
      }}>
        {value}
      </div>
      <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>{label}</div>
    </div>
  );

  return (
    <div>
      {/* ---- Kokeboka — løftet helt øverst ---- */}
      <div style={{ padding: 'var(--space-4) var(--space-4) 0' }}>
        <button
          type="button"
          onClick={() => setShowInspiration(true)}
          style={{
            width: '100%', textAlign: 'left', cursor: 'pointer', border: 'none',
            borderRadius: 'var(--radius-lg)', padding: '16px 18px',
            background: 'linear-gradient(135deg, var(--color-accent-400) 0%, var(--color-accent) 52%, var(--color-accent-700) 100%)',
            color: '#fff', boxShadow: 'var(--shadow-md)',
          }}
        >
          <div className="row" style={{ gap: 10, alignItems: 'center' }}>
            <BookOpen size={22} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 17, letterSpacing: '-0.015em' }}>
                Hent inspirasjon fra kokeboka
              </div>
              <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>
                Søk blant hundrevis av norske oppskrifter — den vokser hver time
              </div>
            </div>
            <Sparkles size={16} style={{ flexShrink: 0, opacity: 0.9 }} />
          </div>
        </button>
        {/* Familiens porsjoner — alt i planen beregnes ut fra dette */}
        <div className="row" style={{ gap: 14, marginTop: 4, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ color: 'var(--color-accent)', fontWeight: 600, paddingLeft: 0 }}
            onClick={() => setShowPortions(true)}
          >
            <Users size={13} /> {portionLabel(household)} · Endre
          </button>
          {rulesPanel && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ color: 'var(--color-accent)', fontWeight: 600, paddingLeft: 0 }}
              onClick={() => setShowRules(true)}
            >
              <SlidersHorizontal size={13} /> Preferanser
            </button>
          )}
        </div>
      </div>

      {/* ---- Fliser ---- */}
      {plan.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
          padding: 'var(--space-4) var(--space-4) var(--space-3)',
        }}>
          {progress.map((p) => (
            <Tile key={p.rule.id ?? p.rule.scope} value={p.value} label={p.label} warn={p.over} />
          ))}
          <Tile value={weekBudget > 0 ? `ca. ${Math.round(weekBudget)}` : '—'} label="Est. budsjett (kr)" tone="honey" />
          <Tile value={`${plannedCount}/${plan.length}`} label="Planlagt" tone="herb" />
        </div>
      )}

      <div className="section-head" style={{ paddingTop: plan.length ? 0 : undefined }}>
        <span className="section-title">Middagsplan{plan.length ? ` · ${plan.length} dager` : ''}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={openMultiSend} disabled={!plan.length}>
          Ingredienser →
        </button>
      </div>

      {openDayCount > 0 && (
        /* Modus og knapp hører sammen: ett kort, én overskrift, én
           handling. Løse chips over en knapp så ut som to påfunn. */
        <div style={{ padding: '0 var(--space-4) var(--space-3)' }}>
          <div className="card" style={{ padding: 'var(--space-3)' }}>
            <div className="card-kicker" style={{ marginBottom: 8 }}>
              Slik fylles de tomme dagene
            </div>
            <div className="seg">
              {PLAN_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="seg-opt"
                  aria-pressed={planMode === m.id}
                  title={m.hint}
                  onClick={() => setPlanMode(m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="text-muted" style={{ fontSize: 11.5, lineHeight: 1.5, margin: '8px 0 10px' }}>
              {PLAN_MODES.find((m) => m.id === planMode)?.hint}. Preferansene deres
              gjelder uansett modus.
            </p>
            <button type="button" className="btn btn-primary btn-block" onClick={generate}>
              <Sparkles size={16} /> Foreslå ny ukemeny
              <span style={{ marginLeft: 'auto', fontWeight: 400, fontSize: 12 }}>
                {openDayCount} {openDayCount === 1 ? 'tom dag' : 'tomme dager'}
              </span>
            </button>
          </div>
        </div>
      )}

      {plan.map((day) => {
        const meal = day.meal_name ? allMeals.find((m) => m.name === day.meal_name) : null;
        const savedMeal = day.meal_name ? meals.find((m) => m.name === day.meal_name) : null;
        const isToday = day.plan_date === todayIso;
        const empty = !day.meal_name && !day.skipped;
        const factor = dayFactor(day, savedMeal);
        const guests = Number(day.guest_portions) || 0;
        const openDayReview = () => setReview({
          title: `Ingredienser til ${day.meal_name}`,
          subtitle: factor !== 1
            ? `Skalert til ${formatPortions(famPortions + guests)} porsjoner${guests > 0 ? ' (med gjester)' : ''}`
            : undefined,
          rows: toRows(meal?.ingredients ?? [], factor),
          // Redigerte mengder lagres bare tilbake i familieoppskriften når
          // det IKKE er skalert — en søndag med gjester skal ikke endre den.
          mealName: factor === 1 ? day.meal_name : undefined,
          forDates: [day.plan_date],   // én middag → bli på Middag, merk dagen
        });
        return (
          <div
            key={day.plan_date}
            style={{
              borderBottom: '1px solid var(--color-divider)',
              // I dag: varm papirflate og en tomatstripe i venstrekanten.
              // Dagen man faktisk skal lage mat på skal finnes med øyet
              // under scrolling — uten et eneste ekstra ord.
              background: isToday ? 'var(--color-surface)'
                : day.done ? 'var(--color-bg-sunken)' : undefined,
              boxShadow: isToday ? 'inset 3px 0 0 var(--color-accent)' : undefined,
            }}
          >
            {/* Datostripe */}
            <div
              className="row-between"
              style={{
                background: isToday ? 'var(--color-accent-100)' : 'var(--color-bg-sunken)',
                padding: '6px var(--space-4)',
              }}
            >
              <span
                className="row"
                style={{
                  gap: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '.09em',
                  textTransform: 'uppercase',
                  color: isToday ? 'var(--color-accent-700)' : 'var(--color-text-muted)',
                }}
              >
                {shortDate(day.plan_date)}
                {isToday && <span>· i dag</span>}
              </span>
              <span className="row" style={{ gap: 10 }}>
                {day.done && <DayMark icon={Check} text="Spist" tone="herb" />}
                {day.locked && <DayMark icon={Lock} text="Låst" tone="herb" />}
                {day.skipped && <DayMark text="Hoppet over" />}
              </span>
            </div>

            {day.skipped ? (
              /* Hoppet over er en avgjort dag: den skal ta minst mulig
                 plass, men ha veien tilbake synlig. */
              <div
                className="row-between"
                style={{ padding: '7px var(--space-4)', background: 'var(--color-bg-sunken)' }}
              >
                <span className="text-muted" style={{ fontSize: 13 }}>
                  Ingen middag denne dagen
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--color-accent)', fontWeight: 600, paddingRight: 0 }}
                  onClick={() => setPicker(day.plan_date)}
                >
                  Velg likevel
                </button>
              </div>
            ) : empty ? (
              /* Tom dag: en stiplet plassholder leser som et hull i planen,
                 ikke som en lenke man kan overse. */
              <div style={{ padding: '10px var(--space-4) 12px' }}>
                <button
                  type="button"
                  className="btn btn-block"
                  style={{
                    borderStyle: 'dashed',
                    background: 'transparent',
                    color: 'var(--color-accent)',
                    boxShadow: 'none',
                  }}
                  onClick={() => setPicker(day.plan_date)}
                >
                  <Plus size={14} /> Legg til middag
                </button>
              </div>
            ) : (
              <>
                <div className="row" style={{ padding: '12px var(--space-4)', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Navnet åpner middagsdetaljene: fremgangsmåte + gjester */}
                    <button
                      type="button"
                      onClick={() => setDetails({ meal: savedMeal ?? meal, planDay: day })}
                      style={{
                        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                        textAlign: 'left', fontFamily: 'var(--font-heading)', fontWeight: 800,
                        fontSize: 17, letterSpacing: '-0.015em', lineHeight: 1.15,
                        color: 'var(--color-text)',
                      }}
                    >
                      {day.meal_name}
                    </button>
                    {day.reason && <div className="item-sub" style={{ marginTop: 2 }}>{day.reason}</div>}
                    {(savedMeal ?? meal) && (
                      /* Mengdene i oppskriften gjelder oppskriftens EGEN basis,
                         ikke familiens porsjoner — deler vi på feil tall blir
                         kaloriene per porsjon flere ganger for lave. */
                      <NutritionNote
                        meal={savedMeal ?? meal}
                        servings={(savedMeal ?? meal)?.base_servings || famPortions}
                        show={showKcal}
                      />
                    )}
                    {(meal?.category || guests > 0 || day.sent_to_list_at || savedMeal?.instructions || savedMeal?.instructions_url) && (
                      <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                        {day.sent_to_list_at && (
                          /* Varsel: ingrediensene er alt sendt — trykk for å se dem */
                          <button
                            type="button"
                            className="tag tag-button tag-herb"
                            onClick={onGoShopping}
                          >
                            <ShoppingCart size={10} /> Varene ligger på handlelisten →
                          </button>
                        )}
                        {meal?.category && (
                          <span className="tag" style={{
                            background: 'var(--color-accent-100)',
                            borderColor: 'var(--color-accent-100)',
                            color: 'var(--color-accent-700)',
                          }}>
                            {meal.category}
                          </span>
                        )}
                        {guests > 0 && (
                          <span className="tag tag-outline">
                            <Users size={10} /> +{formatPortions(guests)} gjesteporsjoner
                          </span>
                        )}
                        {(savedMeal?.instructions || savedMeal?.instructions_url) && (
                          <button
                            type="button"
                            className="tag tag-button tag-outline"
                            onClick={() => setDetails({ meal: savedMeal, planDay: day })}
                          >
                            <BookOpen size={10} /> Fremgangsmåte
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="stack" style={{ gap: 6, flexShrink: 0 }}>
                    <button
                      type="button"
                      className="btn btn-sm"
                      style={day.locked ? {
                        background: 'var(--color-herb-100)',
                        borderColor: 'var(--color-herb-200)',
                        color: 'var(--color-herb-700)',
                      } : undefined}
                      onClick={() => onToggleLock(day.plan_date, !day.locked)}
                      aria-pressed={day.locked}
                    >
                      {day.locked ? 'Låst' : 'Lås'}
                    </button>
                    {day.sent_to_list_at ? (
                      /* Alt er sendt — å sende igjen ville doblet varene.
                         Kommer det gjester, sendes bare TILLEGGET. */
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => setDetails({ meal: savedMeal ?? meal, planDay: day })}
                      >
                        <Users size={13} /> Fått gjester? Utvid
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={openDayReview}
                      >
                        <ShoppingCart size={13} /> Legg til i handleliste
                      </button>
                    )}
                  </div>
                </div>

                {/* To like knapper. «Velg» gjorde nøyaktig det samme som
                    «Endre middag» og sto rett ved siden av den. */}
                <div style={{ display: 'flex', borderTop: '1px solid var(--color-divider-soft)' }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ flex: 1, justifyContent: 'center', borderRight: '1px solid var(--color-divider-soft)', fontSize: 13 }}
                    onClick={() => setPicker(day.plan_date)}
                  >
                    Endre middag
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ flex: 1, justifyContent: 'center', fontSize: 13, color: 'var(--color-text-muted)' }}
                    onClick={() => onSkipDay(day.plan_date)}
                  >
                    Hopp over
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}

      {!plan.length && (
        <div style={{ padding: 'var(--space-4)' }}>
          <div style={{
            border: '1px dashed var(--color-divider-strong)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-5) var(--space-4)',
            textAlign: 'center',
          }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16 }}>
              Ingen dager i planen ennå
            </div>
            <p className="text-muted" style={{ fontSize: 13, lineHeight: 1.55, margin: '6px 0 0' }}>
              Legg til en dag eller en uke under — så foreslår vi middager til
              de tomme dagene, eller du henter noe fra kokeboka øverst.
            </p>
          </div>
        </div>
      )}

      <div className="row" style={{ padding: 'var(--space-4)', gap: 8 }}>
        {plan.length > 0 && (
          <button
            type="button"
            className="btn btn-icon"
            aria-label="Fjern siste dag"
            title="Fjern siste dag i planen"
            onClick={async () => {
              const err = await onRemoveLastDay();
              if (err) toast(err);
            }}
          >
            <Minus size={16} />
          </button>
        )}
        <button type="button" className="btn" style={{ flex: 1 }} onClick={() => onAddDays(1)}>
          + En dag
        </button>
        <button type="button" className="btn" style={{ flex: 1 }} onClick={() => onAddDays(7)}>
          + En uke
        </button>
        <button
          type="button"
          className="btn btn-icon"
          aria-label="Kalender"
          title="Få middagene i Google Kalender"
          onClick={() => setShowCalendar(true)}
        >
          <CalendarDays size={16} />
        </button>
      </div>

      {/* ---------- Ukemaler: lagre uken, gjenbruk den senere ---------- */}
      {(plannedCount > 0 || weekTemplates.length > 0) && (
        <div style={{ padding: '0 var(--space-4) var(--space-3)' }}>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <span className="card-kicker" style={{ marginBottom: 0, marginRight: 2 }}>Ukemaler</span>
            {weekTemplates.map((t) => (
              <span
                key={t.id}
                className="tag tag-outline"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 0, padding: 0, overflow: 'hidden' }}
              >
                <button
                  type="button"
                  onClick={() => setApplyTemplate(t)}
                  style={{ background: 'none', border: 'none', font: 'inherit', color: 'inherit', padding: '5px 2px 5px 10px', cursor: 'pointer' }}
                >
                  {t.name}
                </button>
                <button
                  type="button"
                  aria-label={`Slett malen ${t.name}`}
                  onClick={async () => { await onDeleteWeekTemplate(t.id); toast(`Malen «${t.name}» slettet`); }}
                  style={{ background: 'none', border: 'none', color: 'inherit', opacity: 0.5, padding: '5px 8px 5px 4px', cursor: 'pointer', display: 'inline-flex' }}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
            {plannedCount > 0 && (
              <button
                type="button"
                className="tag tag-button tag-accent"
                onClick={() => setSaveTemplateName('')}
              >
                + Lagre uken som mal
              </button>
            )}
          </div>
          {weekTemplates.length > 0 && (
            <p className="text-muted" style={{ fontSize: 11, margin: '6px 0 0' }}>
              Trykk på en mal for å sette den inn fra en valgfri dato —
              «Hvit uke» planlagt én gang, gjenbrukt for alltid.
            </p>
          )}
        </div>
      )}

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
      <p className="text-muted" style={{ padding: '0 var(--space-4) var(--space-2)', fontSize: 12, margin: 0 }}>
        Trykk på en middag for å åpne den — der kan du endre navn,
        ingredienser og fremgangsmåte, eller legge den i planen. × sletter
        middagen fra listen.
      </p>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6, padding: '0 var(--space-4) var(--space-4)' }}>
        {(showAllMeals ? meals : meals.slice(0, 18)).map((m) => (
          <span
            key={m.id}
            className="tag tag-outline"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 0, padding: 0, overflow: 'hidden' }}
          >
            <button
              type="button"
              onClick={() => setDetails({ meal: m, planDay: null })}
              style={{
                background: 'none', border: 'none', font: 'inherit', color: 'inherit',
                padding: '5px 2px 5px 10px', cursor: 'pointer',
              }}
            >
              {m.name}
            </button>
            <button
              type="button"
              aria-label={`Slett ${m.name}`}
              title={`Slett ${m.name}`}
              onClick={() => deleteSaved(m)}
              style={{
                background: 'none', border: 'none', color: 'inherit', opacity: 0.5,
                padding: '5px 8px 5px 4px', cursor: 'pointer', display: 'inline-flex',
              }}
            >
              <X size={11} />
            </button>
          </span>
        ))}
        {!showAllMeals && meals.length > 18 && (
          <button type="button" className="tag tag-button tag-neutral" onClick={() => setShowAllMeals(true)}>
            +{meals.length - 18} flere
          </button>
        )}
        {meals.length === 0 && (
          <span className="text-muted" style={{ fontSize: 13, lineHeight: 1.55 }}>
            Ingen lagrede middager ennå. De dere velger i planen — eller henter
            fra kokeboka — havner her, og kan brukes om igjen senere.
          </span>
        )}
      </div>

      {/* Middagvelger — favorittene først, biblioteket etterpå, og en vei
          rett inn i kokeboka for å hente noe nytt til akkurat denne dagen. */}
      {picker && (() => {
        const chooseMeal = async (m) => {
          await onSetMeal(picker, m);
          setPicker(null);
          toast(`«${m.name}» lagret på ${dayLabel(picker).toLowerCase()}`);
        };
        const favorites = allMeals.filter((m) => m.saved);
        const library = allMeals.filter((m) => !m.saved);
        return (
          <Dialog title="Velg middag" subtitle={dayLabel(picker)} onClose={() => setPicker(null)}>
            {favorites.length > 0 && (
              <>
                <div className="card-kicker" style={{ marginBottom: 6 }}>Familiens favoritter</div>
                <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginBottom: 'var(--space-3)' }}>
                  {favorites.map((m) => (
                    <button key={m.name} type="button" className="tag tag-button tag-accent" onClick={() => chooseMeal(m)}>
                      {m.name}
                    </button>
                  ))}
                </div>
              </>
            )}

            <button
              type="button"
              className="btn btn-secondary btn-block"
              style={{ marginBottom: 'var(--space-3)' }}
              onClick={() => {
                setInspireForDate(picker);
                setPicker(null);
                setShowInspiration(true);
              }}
            >
              <BookOpen size={15} /> … eller hent middag fra kokeboka
              <span style={{ marginLeft: 'auto', fontWeight: 400, fontSize: 12 }}>søk f.eks. laks</span>
            </button>

            {library.length > 0 && (
              <>
                <div className="card-kicker" style={{ marginBottom: 6 }}>Forslag fra biblioteket</div>
                <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                  {library.map((m) => (
                    <button key={m.name} type="button" className="tag tag-button tag-outline" onClick={() => chooseMeal(m)}>
                      {m.name}
                    </button>
                  ))}
                </div>
              </>
            )}
            <p className="text-muted" style={{ fontSize: 11, marginTop: 'var(--space-3)', marginBottom: 0 }}>
              Middagen lagres i planen. Send ingrediensene til handlelisten når du
              er fornøyd med uken — samlet for flere dager, eller per dag.
            </p>
          </Dialog>
        );
      })()}

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
        <Suspense fallback={null}>
          <InspirationDialog
            onClose={() => { setShowInspiration(false); setInspireForDate(null); }}
            onPick={pickInspiration}
            forDayLabel={inspireForDate ? dayLabel(inspireForDate) : null}
            planDays={inspireForDate ? [] : plan}
            onPlan={planInspiration}
          />
        </Suspense>
      )}

      {/* Middagsdetaljer: fremgangsmåte + gjester på en bestemt dag */}
      {details && (
        <MealDetailsDialog
          meal={details.meal}
          planDay={details.planDay}
          household={household}
          onSaveMeal={onSaveMeal}
          onSetGuests={async (date, portions) => {
            const prev = Number(details.planDay?.guest_portions) || 0;
            const dMeal = details.meal;
            await onSetGuests(date, portions);
            setDetails(null);
            // Var dagen alt sendt og det KOM gjester: tilby å sende bare
            // TILLEGGET til handlelisten — aldri hele middagen på nytt.
            if (details.planDay?.sent_to_list_at && portions > prev
                && Number(dMeal?.base_servings) > 0 && (dMeal?.ingredients ?? []).length) {
              const deltaFactor = (portions - prev) / Number(dMeal.base_servings);
              setReview({
                title: `Ekstra til gjestene — ${dMeal.name}`,
                subtitle: `Bare tillegget for ${formatPortions(portions - prev)} ekstra ${portions - prev === 1 ? 'porsjon' : 'porsjoner'} — resten ligger allerede på listen`,
                rows: toRows(dMeal.ingredients, deltaFactor),
              });
            }
          }}
          onQuickPlan={async (m) => {
            setDetails(null);
            await quickPlan(m);
          }}
          onClose={() => setDetails(null)}
          toast={toast}
        />
      )}

      {/* ---------- Velg dag for en middag ---------- */}
      {dayPick && (
        <Suspense fallback={null}>
          <DayPickerDialog
            meal={dayPick}
            plan={plan}
            onPick={placeOnDay}
            onClose={() => setDayPick(null)}
          />
        </Suspense>
      )}

      {/* ---------- Kalender: abonnér i Google Kalender + last ned .ics ---------- */}
      {showCalendar && (() => {
        const feedUrl = household?.calendar_token
          ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/calendar-feed?token=${household.calendar_token}`
          : null;
        const downloadIcs = () => {
          const stamp = (d) => d.replaceAll('-', '');
          const events = plan.filter((d) => d.meal_name && !d.skipped).map((d) => {
            const next = new Date(`${d.plan_date}T12:00:00`);
            next.setDate(next.getDate() + 1);
            return `BEGIN:VEVENT\r\nUID:${d.plan_date}@plukkelisten.no\r\nDTSTART;VALUE=DATE:${stamp(d.plan_date)}\r\nDTEND;VALUE=DATE:${stamp(isoDate(next))}\r\nSUMMARY:🍽 ${d.meal_name}\r\nEND:VEVENT`;
          }).join('\r\n');
          const ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Plukkelisten//NO\r\nX-WR-CALNAME:Middager\r\n${events}\r\nEND:VCALENDAR`;
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
          a.download = 'plukkelisten-middager.ics';
          a.click();
          URL.revokeObjectURL(a.href);
        };
        return (
          <Dialog
            title="Middager i kalenderen"
            subtitle="Abonnér én gang — så dukker middagene opp av seg selv"
            onClose={() => setShowCalendar(false)}
          >
            {feedUrl ? (
              <>
                <div className="card-kicker" style={{ marginBottom: 4 }}>Google Kalender (anbefalt)</div>
                <ol style={{ fontSize: 13, lineHeight: 1.6, margin: '0 0 var(--space-3)', paddingLeft: 20 }}>
                  <li>Kopier lenken under</li>
                  <li>Åpne <strong>calendar.google.com</strong> på PC → tannhjulet → Innstillinger</li>
                  <li>«Legg til kalender» → «Fra nettadresse» → lim inn → Legg til</li>
                </ol>
                <div className="row" style={{ gap: 6 }}>
                  <input className="input" readOnly value={feedUrl} style={{ flex: 1, fontSize: 11 }} onFocus={(e) => e.target.select()} />
                  <button
                    type="button"
                    className="btn btn-icon"
                    aria-label="Kopier lenken"
                    onClick={async () => {
                      try { await navigator.clipboard.writeText(feedUrl); toast('Lenken er kopiert'); }
                      catch { toast('Marker og kopier lenken manuelt'); }
                    }}
                  >
                    <Copy size={15} />
                  </button>
                </div>
                <p className="text-muted" style={{ fontSize: 11, margin: '8px 0 var(--space-4)' }}>
                  Middagene oppdateres automatisk (Google sjekker med noen
                  timers mellomrom). Lenken viser kun middagsnavn — aldri
                  handlelister. Del den bare med husstanden.
                </p>
              </>
            ) : (
              <p className="text-muted" style={{ fontSize: 12 }}>
                Kalenderlenken blir tilgjengelig når databasen er oppdatert
                (supabase db push) og siden er lastet på nytt.
              </p>
            )}
            <div className="card-kicker" style={{ marginBottom: 4 }}>Engangs-eksport</div>
            <button type="button" className="btn btn-block" onClick={downloadIcs} disabled={!plannedCount}>
              <CalendarDays size={15} /> Last ned ukens middager (.ics)
            </button>
            <p className="text-muted" style={{ fontSize: 11, margin: '8px 0 0' }}>
              Filen kan åpnes/importeres i hvilken som helst kalender — men
              oppdaterer seg ikke selv, i motsetning til abonnementet.
            </p>
          </Dialog>
        );
      })()}

      {/* ---------- Lagre uken som ukemal ---------- */}
      {saveTemplateName !== null && (
        <Dialog
          title="Lagre uken som mal"
          subtitle={`${plannedCount} middager lagres med dagene sine — gjenbruk når som helst`}
          onClose={() => setSaveTemplateName(null)}
          footer={
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={!saveTemplateName.trim()}
              onClick={async () => {
                const err = await onSaveWeekTemplate(saveTemplateName);
                if (err) { toast(err); return; }
                toast(`Malen «${saveTemplateName.trim()}» er lagret`);
                setSaveTemplateName(null);
              }}
            >
              Lagre malen
            </button>
          }
        >
          <label className="field">
            <span className="field-label">Navn på malen</span>
            <input
              className="input"
              autoFocus
              placeholder="f.eks. Hvit uke, Vegansk uke, Hverdagsuka"
              value={saveTemplateName}
              onChange={(e) => setSaveTemplateName(e.target.value)}
            />
          </label>
          <p className="text-muted" style={{ fontSize: 11, marginTop: 'var(--space-3)', marginBottom: 0 }}>
            Finnes navnet fra før, oppdateres malen med ukens middager.
          </p>
        </Dialog>
      )}

      {/* ---------- Sett inn en ukemal fra valgt dato ---------- */}
      {applyTemplate && (
        <Dialog
          title={`Sett inn «${applyTemplate.name}»`}
          subtitle={`${(applyTemplate.days ?? []).length} middager legges inn fra datoen du velger`}
          onClose={() => setApplyTemplate(null)}
          footer={
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={async () => {
                const err = await onApplyWeekTemplate(applyTemplate, applyDate);
                if (err) { toast(err); return; }
                toast(`«${applyTemplate.name}» satt inn fra ${dayLabel(applyDate).toLowerCase()}`);
                setApplyTemplate(null);
              }}
            >
              Sett inn uken
            </button>
          }
        >
          <label className="field">
            <span className="field-label">Fra dato</span>
            <input
              type="date"
              className="input"
              value={applyDate}
              min={isoDate(new Date())}
              onChange={(e) => setApplyDate(e.target.value)}
            />
          </label>
          <div className="card-kicker" style={{ margin: 'var(--space-3) 0 4px' }}>Innholdet</div>
          <p style={{ fontSize: 13, lineHeight: 1.7, margin: 0 }}>
            {(applyTemplate.days ?? []).map((d, i) => (
              <span key={`${d.meal_name}-${i}`}>{i > 0 && ' · '}{d.meal_name}</span>
            ))}
          </p>
          <p className="text-muted" style={{ fontSize: 11, marginTop: 'var(--space-3)', marginBottom: 0 }}>
            Låste dager og dager dere alt har spist røres ikke — alt annet i
            perioden overskrives med malens middager.
          </p>
        </Dialog>
      )}

      {/* Preferanser (tidl. Regler-fanen): fisk 2× i uka, taco fredag … */}
      {showRules && (
        <Dialog
          title="Middagspreferanser"
          subtitle="Styrer «Foreslå ny ukemeny» — f.eks. fisk to ganger i uka"
          onClose={() => setShowRules(false)}
        >
          {rulesPanel}

          <hr className="divider" style={{ height: 1, background: 'var(--color-divider-soft)', margin: 'var(--space-4) 0' }} />
          <div className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Vis kalorier per porsjon</div>
              <p className="text-muted" style={{ fontSize: 11.5, lineHeight: 1.5, margin: '3px 0 0' }}>
                Et nøytralt tall ved siden av middagen, på samme måte som prisen.
                Ikke noe dagsbudsjett, ingen vurdering av hva som er sunt. Gjelder
                bare denne nettleseren — de andre i familien bestemmer selv.
              </p>
            </div>
            <button
              type="button"
              className={`btn btn-sm ${showKcal ? 'btn-primary' : ''}`}
              aria-pressed={showKcal}
              onClick={() => { const v = !showKcal; setShowKcal(v); saveNutritionPref(v); }}
            >
              {showKcal ? 'På' : 'Av'}
            </button>
          </div>
        </Dialog>
      )}

      {/* Familiens porsjonsprofil — hvem spiser hvor mye til vanlig? */}
      {showPortions && (
        <PortionsDialog
          household={household}
          onSave={onSavePortions}
          onClose={() => setShowPortions(false)}
          toast={toast}
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
                  ingredients: all.map((r) => ({ n: r.name, qty: r.qty, unit: r.unit ?? null })),
                });
              }
            }
            // Én middag: bli stående på Middag-fanen — dagen får et merke
            // som lenker til handlelisten. Hele uka samlet hopper som før.
            await onSendToList(selected, { goToList: Boolean(review.goToList) });
            if (review.forDates?.length) await onMarkSent(review.forDates);
            setReview(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * Familiens porsjonsprofil. Enkel modell som forklares i én setning:
 * alle som spiser som en voksen teller 1 porsjon, barn som spiser mindre
 * teller en halv. Storebror på 8 som spiser som en voksen? Tell ham som
 * voksen. Kommer bestemor fast hver søndag, legges hun heller til som
 * gjest på akkurat den middagen.
 */
function PortionsDialog({ household, onSave, onClose, toast }) {
  const [adults, setAdults] = useState(Number(household?.adults ?? 2));
  const [kids, setKids] = useState(Number(household?.children ?? 0));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const err = await onSave({ adults, children: kids });
      if (err) { toast(err); return; }
      toast(`Familien er satt til ${portionLabel({ adults, children: kids })}`);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const Row = ({ label, sub, value, onChange }) => (
    <div className="row" style={{ gap: 8, alignItems: 'center', padding: '8px 0' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
        <div className="text-muted" style={{ fontSize: 11 }}>{sub}</div>
      </div>
      <button type="button" className="btn btn-icon btn-sm" aria-label={`Færre: ${label}`}
        onClick={() => onChange(-1)} disabled={value <= 0}>
        <Minus size={14} />
      </button>
      <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 700 }}>{value}</span>
      <button type="button" className="btn btn-icon btn-sm" aria-label={`Flere: ${label}`}
        onClick={() => onChange(1)}>
        <Plus size={14} />
      </button>
    </div>
  );

  return (
    <Dialog
      title="Familie og porsjoner"
      subtitle="Oppskrifter fra kokeboka skaleres automatisk til dette"
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-primary btn-block" onClick={save} disabled={busy}>
          {busy ? 'Lagrer …' : `Lagre — ${formatPortions(Math.max(1, adults + kids * 0.5))} porsjoner`}
        </button>
      }
    >
      <Row
        label="Spiser som en voksen"
        sub="Voksne og barn med voksen appetitt — 1 porsjon hver"
        value={adults}
        onChange={(d) => setAdults((v) => Math.max(0, v + d))}
      />
      <Row
        label="Spiser mindre"
        sub="Barn med mindre appetitt — en halv porsjon hver"
        value={kids}
        onChange={(d) => setKids((v) => Math.max(0, v + d))}
      />
      <p className="text-muted" style={{ fontSize: 11, margin: '10px 0 0' }}>
        Gjelder hele husholdningen og alle middager fremover. Får dere besøk
        én kveld, trykker du på middagsnavnet den dagen og legger til gjester
        der i stedet — da øker bare den middagen.
      </p>
    </Dialog>
  );
}
