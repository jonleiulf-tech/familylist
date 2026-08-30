import { useState } from 'react';
import { Dialog } from './Dialog.jsx';
import { processImport } from '../lib/keepImport.js';

/**
 * Google Keep-import.
 *
 * Steg 1: lim inn. Steg 2: se hva som gikk rett gjennom, og avgjør de
 * usikre én for én — Legg til / Ny vare / Senere / Dropp.
 *
 * «Senere» skriver til import_queue (vaskelisten) i stedet for å tvinge
 * fram en avgjørelse der og da.
 */
export function ImportDialog({ catalog, normRules, defaultStore, onClose, onImport, onQueue }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  // rad-indeks -> 'add' | 'new' | 'later' | 'drop'
  const [decisions, setDecisions] = useState({});
  const [busy, setBusy] = useState(false);

  const analyse = () => {
    const r = processImport(text, catalog, normRules, defaultStore);
    setResult(r);
    // Forvalg: forslag godtas, ukjente legges til som ny vare.
    setDecisions(Object.fromEntries(
      r.review.map((row, i) => [i, row.suggestion ? 'add' : 'new']),
    ));
  };

  const submit = async () => {
    setBusy(true);
    try {
      const rows = [...result.auto];
      const queued = [];

      result.review.forEach((entry, i) => {
        const choice = decisions[i];
        if (choice === 'add') rows.push(entry.row);
        else if (choice === 'new') rows.push({ ...entry.row, name: entry.raw, category: 'Annet' });
        else if (choice === 'later') queued.push({ raw_text: entry.raw, suggestion: entry.suggestion });
        // 'drop' faller bort med vilje
      });

      if (queued.length) await onQueue(queued);
      await onImport(rows, queued.length);
    } finally {
      setBusy(false);
    }
  };

  const setChoice = (i, choice) => setDecisions((cur) => ({ ...cur, [i]: choice }));

  const willAdd = result
    ? result.auto.length + Object.values(decisions).filter((d) => d === 'add' || d === 'new').length
    : 0;

  return (
    <Dialog
      title="Importer fra Google Keep"
      subtitle={result ? undefined : 'Lim inn listen — én ting per linje'}
      onClose={onClose}
      footer={result ? (
        <button type="button" className="btn btn-primary btn-block" onClick={submit} disabled={busy}>
          {busy ? 'Importerer …' : `Legg til ${willAdd} ${willAdd === 1 ? 'vare' : 'varer'}`}
        </button>
      ) : (
        <button type="button" className="btn btn-primary btn-block" onClick={analyse} disabled={!text.trim()}>
          Vask og se gjennom
        </button>
      )}
    >
      {!result ? (
        <>
          <textarea
            className="input"
            rows={10}
            placeholder={'Melk\n2 brød\nNorwegia\nadvokado x2'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Lim inn listen"
          />
          <p className="text-muted" style={{ fontSize: 11, marginTop: 'var(--space-2)' }}>
            Punkttegn, avkryssingsbokser og nummerering fjernes automatisk.
            Antall («2 liter melk», «melk x2») blir med.
          </p>
        </>
      ) : (
        <>
          {result.auto.length > 0 && (
            <div className="card" style={{
              marginBottom: 'var(--space-4)',
              background: 'var(--color-herb-100)', borderColor: 'var(--color-herb-200)',
            }}>
              <div className="card-kicker" style={{ color: 'var(--color-herb-700)' }}>Gikk rett gjennom</div>
              <div className="card-title" style={{ fontSize: 15 }}>
                {result.auto.length} {result.auto.length === 1 ? 'vare' : 'varer'} gjenkjent
              </div>
              <div className="card-body">
                {result.auto.map((r) => `${r.qty > 1 ? `${r.qty} ` : ''}${r.name}`).join(', ')}
              </div>
            </div>
          )}

          {result.review.length > 0 && (
            <>
              <div className="section-head" style={{ paddingLeft: 0, paddingRight: 0 }}>
                <span className="section-title">Trenger avklaring</span>
                <span className="text-muted" style={{ fontSize: 11 }}>{result.review.length}</span>
              </div>

              {result.review.map((entry, i) => (
                <div key={`${entry.raw}-${i}`} style={{
                  padding: 'var(--space-3) 0',
                  borderBottom: '1px solid var(--color-divider-soft)',
                }}>
                  <div className="item-name">{entry.raw}</div>
                  <div className="item-sub" style={{ marginBottom: 8 }}>
                    {entry.suggestion
                      ? <>Mente du <strong>{entry.suggestion}</strong>?</>
                      : 'Ingen kobling i varedatabasen'}
                  </div>
                  <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                    {entry.suggestion && (
                      <button
                        type="button"
                        className={`tag tag-button ${decisions[i] === 'add' ? 'tag-accent' : 'tag-outline'}`}
                        onClick={() => setChoice(i, 'add')}
                      >
                        Ja, {entry.suggestion}
                      </button>
                    )}
                    <button
                      type="button"
                      className={`tag tag-button ${decisions[i] === 'new' ? 'tag-accent' : 'tag-outline'}`}
                      onClick={() => setChoice(i, 'new')}
                    >
                      Ny vare
                    </button>
                    <button
                      type="button"
                      className={`tag tag-button ${decisions[i] === 'later' ? 'tag-accent' : 'tag-outline'}`}
                      onClick={() => setChoice(i, 'later')}
                    >
                      Senere
                    </button>
                    <button
                      type="button"
                      className={`tag tag-button ${decisions[i] === 'drop' ? 'tag-accent' : 'tag-outline'}`}
                      onClick={() => setChoice(i, 'drop')}
                    >
                      Dropp
                    </button>
                  </div>
                </div>
              ))}
              <p className="text-muted" style={{ fontSize: 11, marginTop: 'var(--space-3)' }}>
                «Senere» legger varen i ventelisten i stedet for å tvinge fram et
                svar nå. Du finner den igjen under Lister.
              </p>
            </>
          )}

          {result.skipped > 0 && (
            <p className="text-muted" style={{ fontSize: 11, marginTop: 'var(--space-3)' }}>
              Hoppet over {result.skipped} tomme {result.skipped === 1 ? 'linje' : 'linjer'}.
            </p>
          )}
        </>
      )}
    </Dialog>
  );
}
