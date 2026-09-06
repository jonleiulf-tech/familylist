import { useEffect, useState } from 'react';
import { useStrings } from '../lib/i18n.jsx';
import { registrerSw, taIBrukNyVersjon } from '../lib/pwa.js';

/* Den ene stripa nederst som service workeren trenger: «ny versjon klar»
   med en knapp, og en beskjed når nettet er borte.

   Vi bytter aldri versjon under beina på noen. Skriver man en nyhet i
   admin når utrullingen kommer, skal ingenting lastes på nytt før man
   selv trykker. */
export default function NyVersjon() {
  const s = useStrings();
  const [venter, setVenter] = useState(null);
  const [uteAvNett, setUteAvNett] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);

  useEffect(() => registrerSw({ onNyVersjon: setVenter }), []);

  useEffect(() => {
    const på = () => setUteAvNett(false);
    const av = () => setUteAvNett(true);
    window.addEventListener('online', på);
    window.addEventListener('offline', av);
    return () => {
      window.removeEventListener('online', på);
      window.removeEventListener('offline', av);
    };
  }, []);

  if (!venter && !uteAvNett) return null;
  return (
    <div className="stripe" role="status" aria-live="polite">
      {venter ? (
        <>
          <span>{s.app.updateReady}</span>
          <button type="button" className="btn btn--primary btn--sm" onClick={() => taIBrukNyVersjon(venter)}>
            {s.app.update}
          </button>
        </>
      ) : (
        <span>{s.app.offline}</span>
      )}
    </div>
  );
}
