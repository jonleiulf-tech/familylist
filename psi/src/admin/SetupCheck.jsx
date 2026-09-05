import { useEffect, useState } from 'react';
import { supabase, byggInfo } from '../lib/supabase.js';
import { kjørSjekk } from './setupCheck.js';

/* Viser oppsettsjekken. Selve logikken ligger i setupCheck.js, som er
   testet for seg. Her er det bare presentasjon: ett kort per steg, med
   grønn kant når det er i orden og rød når det stopper der. */
export default function SetupCheck() {
  const [åpen, setÅpen] = useState(!supabase);
  const [rader, setRader] = useState(null);

  useEffect(() => {
    if (!åpen || rader) return;
    let alive = true;
    kjørSjekk(supabase, window.location.origin, byggInfo)
      .then((r) => alive && setRader(r))
      .catch((err) => alive && setRader([{ navn: 'Sjekken feilet', status: 'feil', forklaring: err.message }]));
    return () => { alive = false; };
  }, [åpen, rader]);

  return (
    <div className="editor" style={{ marginTop: 'var(--sp-5)' }}>
      <div className="admin__bar" style={{ marginBottom: åpen ? 'var(--sp-4)' : 0 }}>
        <h3 style={{ fontSize: 'var(--fs-lg)' }}>Sjekk oppsettet</h3>
        <button
          className="btn btn--ghost btn--sm"
          onClick={() => { setÅpen((o) => !o); setRader(null); }}
        >
          {åpen ? 'Skjul' : 'Kjør sjekk'}
        </button>
      </div>
      {åpen && (rader === null ? (
        <p className="muted">Sjekker …</p>
      ) : (
        <ol className="check">
          {rader.map((r) => (
            <li key={r.navn} className={r.status === 'ok' ? 'is-ok' : 'is-feil'}>
              <span className="check__merke" aria-hidden="true">{r.status === 'ok' ? '✓' : '!'}</span>
              <div>
                <div className="check__navn">
                  {r.navn}
                  <span className="sr-only">: {r.status === 'ok' ? 'i orden' : 'feiler'}</span>
                </div>
                <div className="check__tekst">{r.forklaring}</div>
                {r.fiks && <div className="check__fiks">{r.fiks}</div>}
              </div>
            </li>
          ))}
        </ol>
      ))}
    </div>
  );
}
