import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { kjørSjekk } from './setupCheck.js';

/* Oppsettsjekk for /admin.

   Går innlogging galt, er årsaken nesten alltid ett av fire steg. Denne
   kjører dem i rekkefølge og sier hvilket som feiler, med hva som fikser
   det. Da slipper styret å gjette. Ingen hemmeligheter vises: bare
   adressen til prosjektet, som uansett ligger i hver forespørsel. */

const STEG = { ok: '✅', feil: '❌' };

export default function SetupCheck() {
  const [åpen, setÅpen] = useState(!supabase);
  const [rader, setRader] = useState(null);

  useEffect(() => {
    if (!åpen || rader) return;
    let alive = true;
    kjørSjekk(supabase, window.location.origin)
      .then((r) => alive && setRader(r))
      .catch((err) => alive && setRader([{ navn: 'Sjekken feilet', status: 'feil', forklaring: err.message }]));
    return () => { alive = false; };
  }, [åpen, rader]);

  return (
    <div className="editor" style={{ marginTop: 'var(--sp-4)' }}>
      <div className="admin__bar" style={{ marginBottom: åpen ? 'var(--sp-4)' : 0 }}>
        <h3 style={{ fontSize: 'var(--fs-lg)' }}>Sjekk oppsettet</h3>
        <button className="btn btn--ghost btn--sm" onClick={() => setÅpen((o) => !o)}>
          {åpen ? 'Skjul' : 'Kjør sjekk'}
        </button>
      </div>
      {åpen && (
        rader === null ? (
          <p className="muted">Sjekker …</p>
        ) : (
          <ol className="steps">
            {rader.map((r) => (
              <li key={r.navn} style={{ gridTemplateColumns: '2rem 1fr' }}>
                <span aria-hidden="true" style={{ fontSize: '1.25rem' }}>{STEG[r.status] ?? '…'}</span>
                <div>
                  <b>{r.navn}</b>
                  <span>{r.forklaring}</span>
                  {r.fiks && <span style={{ marginTop: 4 }}>{r.fiks}</span>}
                </div>
              </li>
            ))}
          </ol>
        )
      )}
    </div>
  );
}
