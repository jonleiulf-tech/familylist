import { useEffect, useState } from 'react';
import { RefreshCw, KeyRound, Trash2, ShieldCheck } from 'lucide-react';
import { Dialog } from './Dialog.jsx';
import { supabase } from '../lib/supabase.js';
import { shortDate } from '../lib/format.js';

const call = async (body) => {
  const { data, error } = await supabase.functions.invoke('admin', { body });
  if (error) {
    // Supabase pakker ikke alltid ut svaret ved 4xx/5xx — prøv selv.
    try {
      const parsed = await error.context?.json?.();
      return { error: parsed?.error ?? error.message };
    } catch {
      return { error: error.message };
    }
  }
  return data ?? {};
};

/**
 * Adminpanelet: oversiktstall, brukerliste og support-handlinger
 * (send passord-reset, slett bruker). Kun tilgjengelig for e-postene i
 * ADMIN_EMAILS-secreten — alle andre får høflig avslag fra serveren.
 */
export function AdminDialog({ onClose, toast }) {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);        // user_id + handling
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = async () => {
    setError(null);
    const [s, u] = await Promise.all([call({ action: 'stats' }), call({ action: 'users' })]);
    if (s.error || u.error) { setError(s.error || u.error); return; }
    setStats(s.stats);
    setUsers(u.users);
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const resetPassword = async (u) => {
    setBusy(`${u.id}:reset`);
    const res = await call({ action: 'reset_password', email: u.email });
    setBusy(null);
    toast(res.error ?? res.message ?? 'Sendt.');
  };

  const deleteUser = async (u) => {
    setBusy(`${u.id}:delete`);
    const res = await call({ action: 'delete_user', user_id: u.id });
    setBusy(null);
    setConfirmDelete(null);
    toast(res.error ?? res.message ?? 'Slettet.');
    if (!res.error) load();
  };

  const Tile = ({ value, label }) => (
    <div style={{
      background: 'var(--color-surface)', border: '1px solid var(--color-divider)',
      borderRadius: 'var(--radius)', padding: '10px 12px',
    }}>
      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20 }}>{value}</div>
      <div className="text-muted" style={{ fontSize: 10.5, marginTop: 2 }}>{label}</div>
    </div>
  );

  return (
    <Dialog
      title="Administrasjon"
      subtitle="Drift og support — innholdet i listene er ikke synlig her"
      onClose={onClose}
    >
      {error && <p style={{ fontSize: 13, color: 'var(--color-accent)' }}>{error}</p>}
      {!error && !stats && <p className="text-muted" style={{ fontSize: 13 }}>Henter …</p>}

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <Tile value={stats.users} label="Brukere" />
          <Tile value={stats.active_7d} label="Aktive siste 7 dager" />
          <Tile value={stats.households} label="Delte lister" />
          <Tile value={stats.shopping_items} label="Varer på handlelister" />
          <Tile value={stats.meals} label="Lagrede middager" />
          <Tile value={stats.open_reports} label="Åpne feilmeldinger" />
        </div>
      )}

      {users && (
        <>
          <div className="row-between" style={{ marginTop: 'var(--space-4)', marginBottom: 4 }}>
            <span className="card-kicker" style={{ marginBottom: 0 }}>Brukere</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={load}>
              <RefreshCw size={13} /> Oppdater
            </button>
          </div>
          {users.map((u) => (
            <div key={u.id} className="item-row" style={{ paddingLeft: 0, paddingRight: 0, alignItems: 'flex-start' }}>
              <div className="item-mid" style={{ cursor: 'default' }}>
                <div className="item-name">{u.display_name ?? u.email}</div>
                <div className="item-sub">
                  {u.email} · opprettet {shortDate(u.created_at)} · sist sett{' '}
                  {u.last_sign_in_at ? shortDate(u.last_sign_in_at) : 'aldri'}
                </div>
                {u.lists.length > 0 && (
                  <div className="item-sub">{u.lists.join(' · ')}</div>
                )}
              </div>
              <div className="stack" style={{ gap: 4, flexShrink: 0 }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={busy === `${u.id}:reset`}
                  onClick={() => resetPassword(u)}
                  title="Sender e-post der brukeren setter nytt passord selv"
                >
                  <KeyRound size={13} /> {busy === `${u.id}:reset` ? 'Sender …' : 'Passord-reset'}
                </button>
                {confirmDelete === u.id ? (
                  <div className="row" style={{ gap: 4 }}>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={busy === `${u.id}:delete`}
                      onClick={() => deleteUser(u)}
                    >
                      {busy === `${u.id}:delete` ? 'Sletter …' : 'Ja, slett'}
                    </button>
                    <button type="button" className="btn btn-sm" onClick={() => setConfirmDelete(null)}>
                      Avbryt
                    </button>
                  </div>
                ) : (
                  <button type="button" className="btn btn-sm" onClick={() => setConfirmDelete(u.id)}>
                    <Trash2 size={13} /> Slett bruker
                  </button>
                )}
              </div>
            </div>
          ))}
        </>
      )}

      <p className="text-muted" style={{ fontSize: 11, marginTop: 'var(--space-4)' }}>
        <ShieldCheck size={11} style={{ verticalAlign: -1 }} /> Passord-reset
        sender en e-post der brukeren velger nytt passord selv — passord kan
        aldri leses eller settes direkte. Sletting fjerner brukeren og delte
        lister der de var alene; lister med andre medlemmer består og
        eldste medlem blir admin.
      </p>
    </Dialog>
  );
}
