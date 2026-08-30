import { useEffect, useState } from 'react';
import { RefreshCw, KeyRound, Trash2, ShieldCheck, Bug, Check, PackagePlus, X } from 'lucide-react';
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
  const [feedback, setFeedback] = useState(null);
  const [suggestions, setSuggestions] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);        // user_id + handling
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = async () => {
    setError(null);
    const [s, u, f, g] = await Promise.all([
      call({ action: 'stats' }), call({ action: 'users' }),
      call({ action: 'feedback' }), call({ action: 'suggestions' }),
    ]);
    if (s.error || u.error) { setError(s.error || u.error); return; }
    setStats(s.stats);
    setUsers(u.users);
    setFeedback(f.feedback ?? []);
    setSuggestions(g.suggestions ?? []);
  };

  const decideSuggestion = async (sug, approve) => {
    setBusy(`${sug.id}:sug`);
    const res = await call({
      action: approve ? 'suggestion_approve' : 'suggestion_reject',
      suggestion_id: sug.id,
    });
    setBusy(null);
    toast(res.error ?? res.message);
    if (!res.error) {
      setSuggestions((prev) => prev.map((x) =>
        (x.id === sug.id ? { ...x, status: approve ? 'godkjent' : 'avvist' } : x)));
    }
  };

  const resolveFeedback = async (f) => {
    setBusy(`${f.id}:done`);
    const res = await call({ action: 'feedback_done', feedback_id: f.id });
    setBusy(null);
    if (res.error) toast(res.error);
    else setFeedback((prev) => prev.map((x) => (x.id === f.id ? { ...x, status: 'løst' } : x)));
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

      {suggestions && (
        <>
          <div className="card-kicker" style={{ marginTop: 'var(--space-4)', marginBottom: 4 }}>
            <PackagePlus size={11} style={{ verticalAlign: -1 }} /> Nye varer til godkjenning
            {suggestions.filter((s) => s.status === 'ny').length > 0 &&
              ` (${suggestions.filter((s) => s.status === 'ny').length} nye)`}
          </div>
          {suggestions.length === 0 && (
            <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>Ingen forslag ennå.</p>
          )}
          {suggestions.map((s) => (
            <div
              key={s.id}
              className="item-row"
              style={{ paddingLeft: 0, paddingRight: 0, alignItems: 'flex-start', opacity: s.status === 'ny' ? 1 : 0.55 }}
            >
              <div className="item-mid" style={{ cursor: 'default' }}>
                <div className="item-name">{s.name}</div>
                <div className="item-sub">
                  {[s.category, s.price_estimate ? `ca. kr ${s.price_estimate}` : 'uten pris', s.store,
                    s.email ?? 'ukjent bruker', shortDate(s.created_at),
                    s.status !== 'ny' ? s.status : null]
                    .filter(Boolean).join(' · ')}
                </div>
              </div>
              {s.status === 'ny' && (
                <div className="row" style={{ gap: 4, flexShrink: 0 }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={busy === `${s.id}:sug`}
                    onClick={() => decideSuggestion(s, true)}
                  >
                    <Check size={13} /> Godkjenn
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={busy === `${s.id}:sug`}
                    onClick={() => decideSuggestion(s, false)}
                  >
                    <X size={13} /> Avvis
                  </button>
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {feedback && (
        <>
          <div className="card-kicker" style={{ marginTop: 'var(--space-4)', marginBottom: 4 }}>
            <Bug size={11} style={{ verticalAlign: -1 }} /> Feilrapporter
            {feedback.filter((f) => f.status === 'ny').length > 0 &&
              ` (${feedback.filter((f) => f.status === 'ny').length} nye)`}
          </div>
          {feedback.length === 0 && (
            <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>Ingen rapporter ennå.</p>
          )}
          {feedback.map((f) => (
            <div
              key={f.id}
              className="item-row"
              style={{ paddingLeft: 0, paddingRight: 0, alignItems: 'flex-start', opacity: f.status === 'løst' ? 0.55 : 1 }}
            >
              <div className="item-mid" style={{ cursor: 'default' }}>
                <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{f.message}</div>
                <div className="item-sub">
                  {[f.email ?? 'ukjent bruker', shortDate(f.created_at), f.context, f.status === 'løst' ? 'løst ✓' : null]
                    .filter(Boolean).join(' · ')}
                </div>
              </div>
              {f.status !== 'løst' && (
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={busy === `${f.id}:done`}
                  onClick={() => resolveFeedback(f)}
                >
                  <Check size={13} /> Løst
                </button>
              )}
            </div>
          ))}
        </>
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
