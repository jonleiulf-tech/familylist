import { useState } from 'react';
import { Dialog } from './Dialog.jsx';
import { updatePassword } from '../hooks/useAuth.js';

/**
 * Vises når brukeren kommer inn via «glemt passordet»-lenken.
 * Økten er allerede gyldig — det eneste som gjenstår er å velge passordet.
 */
export function SetPasswordDialog({ onDone, toast }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    if (password.length < 8) { setError('Velg et passord på minst 8 tegn.'); return; }
    setBusy(true);
    setError(null);
    try {
      const err = await updatePassword(password);
      if (err) { setError(err); return; }
      toast('Nytt passord er lagret');
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="Sett nytt passord"
      subtitle="Du er logget inn — velg passordet du vil bruke framover"
      onClose={onDone}
      footer={
        <button type="submit" form="set-password" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Lagrer …' : 'Lagre passord'}
        </button>
      }
    >
      <form id="set-password" onSubmit={save}>
        <label className="field">
          <span className="field-label">Nytt passord</span>
          <input
            className="input" type="password" autoFocus required minLength={8}
            autoComplete="new-password"
            value={password} onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p style={{ fontSize: 12, color: 'var(--color-accent)' }}>{error}</p>}
      </form>
    </Dialog>
  );
}
