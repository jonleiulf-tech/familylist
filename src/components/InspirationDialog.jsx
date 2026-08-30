import { useEffect, useRef, useState } from 'react';
import { Search, ExternalLink, BookOpen, CalendarPlus, ArrowLeft } from 'lucide-react';
import { Dialog } from './Dialog.jsx';
import { supabase } from '../lib/supabase.js';
import { dayLabel } from '../lib/format.js';
import {
  INSPIRATION_CATEGORIES, searchMealDb, browseMealDbCategory,
  lookupMealDb, searchCandidates,
} from '../lib/recipes/inspiration.js';

/**
 * «Hent inspirasjon» — søk i den store kokeboka. To hyller:
 * norske kilder (external_recipe_candidates, fylles av høstingen) og
 * TheMealDB direkte fra nettleseren. Valgt oppskrift sendes tilbake til
 * Middag-fanen, som lagrer den som middag og åpner ingrediens-gjennomgangen.
 */
export function InspirationDialog({ onClose, onPick, forDayLabel = null, planDays = [], onPlan }) {
  const [query, setQuery] = useState('');
  const [chip, setChip] = useState(null);
  const [norwegian, setNorwegian] = useState([]);
  const [international, setInternational] = useState([]);
  // Hyllene viser noen retter av gangen — «Se flere» ruller ut resten.
  const [noShown, setNoShown] = useState(8);
  const [intShown, setIntShown] = useState(8);
  const [status, setStatus] = useState('Skriv et søk, eller velg en kategori.');
  const [busyId, setBusyId] = useState(null);
  // Planlegg-panelet: retten som skal legges på en dag + bekreftelse på erstatt.
  const [planFor, setPlanFor] = useState(null);
  const [planBusy, setPlanBusy] = useState(false);
  const [replaceDay, setReplaceDay] = useState(null);   // { plan_date, meal_name }
  const runRef = useRef(0);

  const canPlan = Boolean(onPlan) && planDays.length > 0;

  const run = async (q, category) => {
    const runId = (runRef.current += 1);
    setStatus('Søker i kokeboka …');
    setNoShown(8);
    setIntShown(8);
    const [cand, intl] = await Promise.all([
      searchCandidates(supabase, q, { limit: 90 }),
      category ? browseMealDbCategory(category.mealdb) : searchMealDb(q || 'chicken'),
    ]);
    if (runId !== runRef.current) return;   // et nyere søk har tatt over
    let no = cand.results;
    if (category) {
      // Norske kandidater har varierende kategorinavn fra kildene — match
      // chip-ordet mot både kategori og tittel så hyllen ikke blir tom.
      const key = category.label.split(' ')[0].toLowerCase();
      no = no.filter((r) =>
        `${r.category ?? ''} ${r.name ?? ''}`.toLowerCase().includes(key));
    }
    setNorwegian(no);
    setInternational(intl.results);
    setStatus(
      no.length + intl.results.length === 0
        ? (intl.error || cand.error || 'Ingen treff — prøv et annet søkeord.')
        : null,
    );
  };

  // Første visning: litt å bla i med en gang.
  useEffect(() => { run('', INSPIRATION_CATEGORIES[0]); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (e) => {
    e.preventDefault();
    setChip(null);
    run(query, null);
  };

  const pick = async (r) => {
    setBusyId(r.id);
    try {
      const full = r.needs_lookup ? await lookupMealDb(r.mealdb_id) : r;
      if (!full) return;
      await onPick(full);
    } finally {
      setBusyId(null);
    }
  };

  // Legg retten som er valgt i planFor på en gitt dato (onPlan lukker dialogen).
  const planOnDay = async (date) => {
    setPlanBusy(true);
    try {
      const full = planFor.needs_lookup ? await lookupMealDb(planFor.mealdb_id) : planFor;
      if (!full) return;
      await onPlan(full, date);
    } finally {
      setPlanBusy(false);
    }
  };

  const upcoming = [...planDays]
    .filter((d) => !d.skipped || d.meal_name)
    .sort((a, b) => String(a.plan_date).localeCompare(String(b.plan_date)));
  const firstFree = upcoming.find((d) => !d.meal_name && !d.skipped) ?? null;

  const Row = ({ r }) => (
    <div className="item-row" style={{ paddingLeft: 0, paddingRight: 0, alignItems: 'center' }}>
      {r.image_url ? (
        <img
          src={r.image_url.includes('themealdb.com') ? `${r.image_url}/preview` : r.image_url}
          alt=""
          width="56"
          height="56"
          loading="lazy"
          style={{
            borderRadius: 'var(--radius)', objectFit: 'cover', flex: 'none',
            boxShadow: 'var(--shadow-sm)', border: '1px solid var(--color-divider)',
          }}
        />
      ) : (
        <div style={{
          width: 56, height: 56, flex: 'none', borderRadius: 'var(--radius)',
          background: 'var(--color-accent-100)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          boxShadow: 'var(--shadow-sm)', border: '1px solid var(--color-accent-200)',
        }}>
          <BookOpen size={20} color="var(--color-accent)" />
        </div>
      )}
      <div className="item-mid" style={{ cursor: 'default' }}>
        <div className="item-name" style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16, letterSpacing: '-0.01em', lineHeight: 1.2 }}>{r.name}</div>
        <div className="item-sub" style={{ marginTop: 2 }}>
          {[
            r.category,
            r.total_time_minutes ? `${r.total_time_minutes} min` : null,
            r.servings?.base_servings ? `${r.servings.base_servings} porsjoner` : null,
          ].filter(Boolean).join(' · ')}
        </div>
        {(r.source_label || r.instructions_url) && (
          <div className="row" style={{ gap: 6, marginTop: 4 }}>
            {r.source_label && (
              <span className="tag tag-outline" style={{ fontSize: 9 }}>{r.source_label}</span>
            )}
            {r.instructions_url && (
              <a
                href={r.instructions_url}
                target="_blank"
                rel="noreferrer noopener"
                style={{ fontSize: 11 }}
              >
                fremgangsmåte <ExternalLink size={9} style={{ verticalAlign: -1 }} />
              </a>
            )}
          </div>
        )}
      </div>
      <div className="stack" style={{ gap: 4, alignItems: 'stretch' }}>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busyId === r.id}
          onClick={() => pick(r)}
        >
          {busyId === r.id ? 'Henter …' : 'Velg'}
        </button>
        {canPlan && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => { setReplaceDay(null); setPlanFor(r); }}
          >
            <CalendarPlus size={13} /> Planlegg
          </button>
        )}
      </div>
    </div>
  );

  // --- Planlegg-panel: velg hvilken dag retten skal på -----------------------
  if (planFor) {
    return (
      <Dialog
        title={`Planlegg «${planFor.name}»`}
        subtitle="Velg en dag i middagsplanen"
        onClose={() => { setPlanFor(null); setReplaceDay(null); }}
      >
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ color: 'var(--color-accent)', fontWeight: 600, paddingLeft: 0, marginBottom: 'var(--space-3)' }}
          onClick={() => { setPlanFor(null); setReplaceDay(null); }}
        >
          <ArrowLeft size={14} /> Tilbake til kokeboka
        </button>

        {firstFree && (
          <button
            type="button"
            className="btn btn-primary btn-block"
            style={{ marginBottom: 'var(--space-3)' }}
            disabled={planBusy}
            onClick={() => planOnDay(firstFree.plan_date)}
          >
            <CalendarPlus size={15} /> Legg på første ledige dag ({dayLabel(firstFree.plan_date).toLowerCase()})
          </button>
        )}

        <div className="card-kicker" style={{ marginBottom: 4 }}>Eller velg en bestemt dag</div>
        {upcoming.map((d) => {
          const occupied = Boolean(d.meal_name) && !d.skipped;
          const confirming = replaceDay?.plan_date === d.plan_date;
          return (
            <div key={d.plan_date} style={{ borderBottom: '1px solid var(--color-divider-soft)' }}>
              <button
                type="button"
                disabled={planBusy || d.locked}
                onClick={() => (occupied
                  ? setReplaceDay(confirming ? null : { plan_date: d.plan_date, meal_name: d.meal_name })
                  : planOnDay(d.plan_date))}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                  padding: '11px 2px', background: 'none', border: 'none',
                  textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit',
                  opacity: d.locked ? 0.5 : 1,
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>
                    {dayLabel(d.plan_date)}
                  </span>
                  <span className="text-muted" style={{ display: 'block', fontSize: 12 }}>
                    {d.locked ? '🔒 låst' : occupied ? d.meal_name : 'ledig'}
                  </span>
                </span>
                {!occupied && !d.locked && (
                  <span className="tag tag-accent" style={{ flexShrink: 0 }}>Legg her</span>
                )}
                {occupied && !d.locked && (
                  <span className="tag tag-outline" style={{ flexShrink: 0 }}>Erstatt</span>
                )}
              </button>
              {confirming && (
                <div style={{
                  background: 'var(--color-accent-100)', borderRadius: 'var(--radius)',
                  padding: '10px 12px', margin: '0 0 10px',
                }}>
                  <p style={{ fontSize: 13, margin: '0 0 8px' }}>
                    Erstatte <strong>«{d.meal_name}»</strong> på {dayLabel(d.plan_date).toLowerCase()}
                    {' '}med <strong>«{planFor.name}»</strong>?
                  </p>
                  <div className="row" style={{ gap: 8 }}>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={planBusy}
                      onClick={() => planOnDay(d.plan_date)}
                    >
                      {planBusy ? 'Setter inn …' : 'Ja, erstatt'}
                    </button>
                    <button type="button" className="btn btn-sm" onClick={() => setReplaceDay(null)}>
                      Avbryt
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {upcoming.length === 0 && (
          <p className="text-muted" style={{ fontSize: 13 }}>
            Ingen dager i planen ennå — legg til dager på Middag-fanen først.
          </p>
        )}
      </Dialog>
    );
  }

  return (
    <Dialog
      title="Hent inspirasjon"
      subtitle={forDayLabel
        ? `Velg en oppskrift til ${forDayLabel.toLowerCase()} — den legges rett i planen`
        : 'Søk i kokeboka — norske kilder og internasjonale oppskrifter'}
      onClose={onClose}
    >
      <form onSubmit={submit} className="row" style={{ gap: 8 }}>
        <input
          className="input"
          placeholder="f.eks. kylling, laks, pasta …"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Søk i kokeboka"
        />
        <button type="submit" className="btn btn-icon" aria-label="Søk"><Search size={16} /></button>
      </form>

      <div className="row" style={{ flexWrap: 'wrap', gap: 6, margin: 'var(--space-3) 0' }}>
        {INSPIRATION_CATEGORIES.map((c) => (
          <button
            key={c.label}
            type="button"
            className={`tag tag-button ${chip?.label === c.label ? 'tag-accent' : 'tag-outline'}`}
            aria-pressed={chip?.label === c.label}
            onClick={() => { setChip(c); setQuery(''); run('', c); }}
          >
            {c.label}
          </button>
        ))}
      </div>

      {status && <p className="text-muted" style={{ fontSize: 13 }}>{status}</p>}

      {norwegian.length > 0 && (
        <>
          <div className="card-kicker" style={{ marginTop: 'var(--space-2)' }}>Norske kilder</div>
          {norwegian.slice(0, noShown).map((r) => <Row key={r.id} r={r} />)}
          {norwegian.length > noShown && (
            <button
              type="button"
              className="btn btn-block btn-sm"
              style={{ marginTop: 6 }}
              onClick={() => setNoShown((n) => n + 16)}
            >
              Se flere norske retter ({norwegian.length - noShown} til)
            </button>
          )}
        </>
      )}
      {international.length > 0 && (
        <>
          <div className="card-kicker" style={{ marginTop: 'var(--space-3)' }}>
            Internasjonalt — oversettes til norsk
          </div>
          {international.slice(0, intShown).map((r) => <Row key={r.id} r={r} />)}
          {international.length > intShown && (
            <button
              type="button"
              className="btn btn-block btn-sm"
              style={{ marginTop: 6 }}
              onClick={() => setIntShown((n) => n + 16)}
            >
              Se flere internasjonale retter ({international.length - intShown} til)
            </button>
          )}
        </>
      )}

      <p className="text-muted" style={{ fontSize: 11, marginTop: 'var(--space-4)' }}>
        <BookOpen size={11} style={{ verticalAlign: -1 }} /> Ingrediensene kobles
        mot varedatabasen din og kan sendes rett til handlelisten.
        Fremgangsmåten kan hentes inn på middagen som husholdningens eget
        utklipp — kilden krediteres alltid med lenke. Norske kilder: TINE,
        REMA, MENY m.fl. Internasjonale oppskrifter: TheMealDB.
      </p>
    </Dialog>
  );
}
