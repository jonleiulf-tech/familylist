import { useEffect, useRef, useState } from 'react';
import { Search, ExternalLink, BookOpen } from 'lucide-react';
import { Dialog } from './Dialog.jsx';
import { supabase } from '../lib/supabase.js';
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
export function InspirationDialog({ onClose, onPick }) {
  const [query, setQuery] = useState('');
  const [chip, setChip] = useState(null);
  const [norwegian, setNorwegian] = useState([]);
  const [international, setInternational] = useState([]);
  const [status, setStatus] = useState('Skriv et søk, eller velg en kategori.');
  const [busyId, setBusyId] = useState(null);
  const runRef = useRef(0);

  const run = async (q, category) => {
    const runId = (runRef.current += 1);
    setStatus('Søker i kokeboka …');
    const [cand, intl] = await Promise.all([
      searchCandidates(supabase, q),
      category ? browseMealDbCategory(category.mealdb) : searchMealDb(q || 'chicken'),
    ]);
    if (runId !== runRef.current) return;   // et nyere søk har tatt over
    let no = cand.results;
    if (category) {
      no = no.filter((r) => (r.category ?? '').toLowerCase().includes(category.label.split(' ')[0].toLowerCase()));
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

  const Row = ({ r }) => (
    <div className="item-row" style={{ paddingLeft: 0, paddingRight: 0 }}>
      {r.image_url && (
        <img
          src={r.image_url.includes('themealdb.com') ? `${r.image_url}/preview` : r.image_url}
          alt=""
          width="44"
          height="44"
          loading="lazy"
          style={{ borderRadius: 'var(--radius-sm)', objectFit: 'cover', flex: 'none' }}
        />
      )}
      <div className="item-mid" style={{ cursor: 'default' }}>
        <div className="item-name">{r.name}</div>
        <div className="item-sub">
          {[
            r.category,
            r.total_time_minutes ? `${r.total_time_minutes} min` : null,
            r.servings?.base_servings ? `${r.servings.base_servings} porsjoner` : 'porsjoner ukjent',
            r.source_label,
          ].filter(Boolean).join(' · ')}
          {r.instructions_url && (
            <>
              {' · '}
              <a href={r.instructions_url} target="_blank" rel="noreferrer noopener">
                oppskrift <ExternalLink size={9} style={{ verticalAlign: -1 }} />
              </a>
            </>
          )}
        </div>
      </div>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={busyId === r.id}
        onClick={() => pick(r)}
      >
        {busyId === r.id ? 'Henter …' : 'Velg'}
      </button>
    </div>
  );

  return (
    <Dialog
      title="Hent inspirasjon"
      subtitle="Søk i kokeboka — norske kilder og internasjonale oppskrifter"
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
          {norwegian.map((r) => <Row key={r.id} r={r} />)}
        </>
      )}
      {international.length > 0 && (
        <>
          <div className="card-kicker" style={{ marginTop: 'var(--space-3)' }}>
            Internasjonalt — oversettes til norsk
          </div>
          {international.map((r) => <Row key={r.id} r={r} />)}
        </>
      )}

      <p className="text-muted" style={{ fontSize: 11, marginTop: 'var(--space-4)' }}>
        <BookOpen size={11} style={{ verticalAlign: -1 }} /> Ingrediensene kobles
        mot varedatabasen din og kan sendes rett til handlelisten.
        Fremgangsmåten leses hos kilden — vi kopierer den ikke. Norske kilder
        (TINE, REMA, MENY m.fl.) dukker opp her når kildegjennomgangen er
        fullført. Internasjonale oppskrifter: TheMealDB.
      </p>
    </Dialog>
  );
}
