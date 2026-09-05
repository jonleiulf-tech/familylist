import { useState } from 'react';
import { PageHead } from '../../components/Bits.jsx';
import SetupCheck from '../SetupCheck.jsx';
import { passordFeil, MIN_PASSORD } from '../useAdminAuth.js';
import { useToast } from '../ui.jsx';

export default function SignIn({ auth }) {
  const [modus, setModus] = useState('passord');   // passord | lenke | glemt
  const [email, setEpost] = useState('');
  const [passord, setPassord] = useState('');
  const [state, setState] = useState({ status: 'idle', message: '' });

  const bytt = (m) => { setModus(m); setState({ status: 'idle', message: '' }); };

  async function submit(e) {
    e.preventDefault();
    setState({ status: 'busy', message: '' });
    let error = null;
    if (modus === 'passord') ({ error } = await auth.signInMedPassord(email, passord));
    else if (modus === 'lenke') ({ error } = await auth.signInMedLenke(email));
    else ({ error } = await auth.glemtPassord(email));

    if (error) {
      const feil = /Invalid login credentials/i.test(error.message)
        ? 'Feil e-post eller passord. Har du ikke laget passord ennå, logg inn med lenke på e-post og sett et under «Min konto».'
        : error.message;
      setState({ status: 'error', message: feil });
      return;
    }
    setState({ status: modus === 'passord' ? 'idle' : 'sendt', message: '' });
  }

  const sendtTekst = modus === 'glemt'
    ? 'Sjekk e-posten din. Lenken lar deg sette nytt passord.'
    : 'Sjekk e-posten din. Lenken virker i én time.';

  return (
    <>
      <PageHead eyebrow="For styret og gruppelederne" title="Logg inn" intro="Gruppeledere redigerer sin gruppe. Styret redigerer alt." />
      <section className="section"><div className="wrap" style={{ maxWidth: 480 }}>
        {state.status === 'sendt' ? (
          <div className="notice notice--teal" role="status">{sendtTekst}</div>
        ) : (
          <form className="form editor" onSubmit={submit}>
            <div className="field">
              <label htmlFor="login-email">E-post</label>
              <input id="login-email" type="email" required value={email} onChange={(e) => setEpost(e.target.value)} autoComplete="username" />
            </div>
            {modus === 'passord' && (
              <div className="field">
                <label htmlFor="login-pw">Passord</label>
                <input id="login-pw" type="password" required value={passord} onChange={(e) => setPassord(e.target.value)} autoComplete="current-password" />
              </div>
            )}
            {modus === 'glemt' && <p className="hint muted">Vi sender en lenke som lar deg sette nytt passord.</p>}
            {state.status === 'error' && <div className="notice" role="alert">{state.message}</div>}
            <div>
              <button className="btn btn--primary btn--block" disabled={state.status === 'busy'}>
                {state.status === 'busy' ? 'Vent litt …'
                  : modus === 'passord' ? 'Logg inn'
                  : modus === 'lenke' ? 'Send innloggingslenke'
                  : 'Send lenke for nytt passord'}
              </button>
            </div>
            <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap', fontSize: 'var(--fs-sm)' }}>
              {modus !== 'passord' && <button type="button" className="btn btn--ghost btn--sm" onClick={() => bytt('passord')}>Logg inn med passord</button>}
              {modus !== 'lenke' && <button type="button" className="btn btn--ghost btn--sm" onClick={() => bytt('lenke')}>Bruk lenke på e-post</button>}
              {modus !== 'glemt' && <button type="button" className="btn btn--ghost btn--sm" onClick={() => bytt('glemt')}>Glemt passord</button>}
            </div>
          </form>
        )}
        <SetupCheck />
      </div></section>
    </>
  );
}

/* Skjema for å sette passord. Brukes både etter «glemt passord» og fra
   «Min konto» når man er logget inn med lenke. */
export function SetPassword({ auth, onDone, title = 'Sett passord' }) {
  const toast = useToast();
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const feil = passordFeil(a, b);
    if (feil) { toast(feil, 'error'); return; }
    setBusy(true);
    const { error } = await auth.settPassord(a);
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    setA(''); setB('');
    toast('Passordet er lagret. Neste gang kan du logge inn med det.');
    onDone?.();
  }

  return (
    <form className="editor form" onSubmit={submit}>
      <h3>{title}</h3>
      <div className="field">
        <label htmlFor="pw-1">Nytt passord</label>
        <input id="pw-1" type="password" required minLength={MIN_PASSORD} value={a} onChange={(e) => setA(e.target.value)} autoComplete="new-password" />
        <span className="hint">Minst {MIN_PASSORD} tegn. Bruk gjerne passordbehandleren i nettleseren.</span>
      </div>
      <div className="field">
        <label htmlFor="pw-2">Gjenta passordet</label>
        <input id="pw-2" type="password" required minLength={MIN_PASSORD} value={b} onChange={(e) => setB(e.target.value)} autoComplete="new-password" />
      </div>
      <div><button className="btn btn--primary" disabled={busy}>{busy ? 'Lagrer …' : 'Lagre passord'}</button></div>
    </form>
  );
}
