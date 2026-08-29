import { useState } from 'react';
import { LogOut, ListChecks, Settings, Pencil } from 'lucide-react';
import { supabase } from '../lib/supabase.js';
import { signOut } from '../hooks/useAuth.js';

/**
 * «Min profil» øverst til høyre: rund avatar med initialer som åpner en
 * meny med navn/e-post, endre visningsnavn, snarveier og logg ut —
 * slik de fleste nettsteder gjør det.
 */
export function ProfileMenu({ user, members, onManageLists, onListSettings, onSaved }) {
  const [open, setOpen] = useState(false);
  const [editName, setEditName] = useState(null);   // null = viser, streng = redigerer
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const me = members.find((m) => m.user_id === user?.id) || null;
  const displayName = me?.display_name || user?.email?.split('@')[0] || 'Meg';
  const initials = (me?.initials || displayName.slice(0, 2)).toUpperCase();

  const saveName = async (e) => {
    e.preventDefault();
    const name = editName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase
        .from('members')
        .update({ display_name: name, initials: name.slice(0, 2).toUpperCase() })
        .eq('user_id', user.id);
      if (err) { setError(err.message); return; }
      setEditName(null);
      await onSaved?.();
    } finally {
      setBusy(false);
    }
  };

  const Item = ({ icon, label, onClick }) => (
    <button
      type="button"
      className="btn btn-ghost btn-block"
      style={{ justifyContent: 'flex-start', textAlign: 'left', borderRadius: 'var(--radius)' }}
      onClick={onClick}
    >
      {icon} {label}
    </button>
  );

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        aria-label="Min profil"
        aria-expanded={open}
        onClick={() => { setOpen((o) => !o); setEditName(null); setError(null); }}
        style={{
          width: 36, height: 36, borderRadius: 'var(--radius-full)',
          border: 'none', cursor: 'pointer',
          background: 'var(--color-accent)', color: '#fff',
          fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 13,
          letterSpacing: '0.02em', boxShadow: 'var(--shadow-sm)',
        }}
      >
        {initials}
      </button>

      {open && (
        <>
          {/* Klikk utenfor lukker menyen */}
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 55 }}
            aria-hidden="true"
          />
          <div
            role="menu"
            style={{
              position: 'absolute', right: 0, top: 44, zIndex: 56,
              width: 264, background: 'var(--color-surface)',
              border: '1px solid var(--color-divider)',
              borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)',
              padding: 'var(--space-3)',
            }}
          >
            <div className="row" style={{ gap: 10, paddingBottom: 'var(--space-3)', borderBottom: '1px solid var(--color-divider)' }}>
              <span style={{
                width: 40, height: 40, borderRadius: 'var(--radius-full)', flex: 'none',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--color-accent-100)', color: 'var(--color-accent-700)',
                fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 14,
              }}>
                {initials}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>{displayName}</div>
                <div className="text-muted" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user?.email}
                </div>
              </div>
            </div>

            <div style={{ paddingTop: 'var(--space-2)' }}>
              {editName === null ? (
                <Item icon={<Pencil size={15} />} label="Endre visningsnavn" onClick={() => setEditName(displayName)} />
              ) : (
                <form onSubmit={saveName} style={{ padding: '4px 0 8px' }}>
                  <input
                    className="input"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    aria-label="Nytt visningsnavn"
                    autoFocus
                    style={{ marginBottom: 8 }}
                  />
                  <div className="row" style={{ gap: 6 }}>
                    <button type="submit" className="btn btn-primary btn-sm" style={{ flex: 1 }} disabled={busy || !editName.trim()}>
                      {busy ? 'Lagrer …' : 'Lagre'}
                    </button>
                    <button type="button" className="btn btn-sm" onClick={() => setEditName(null)}>Avbryt</button>
                  </div>
                  {error && <p style={{ fontSize: 11, color: 'var(--color-accent)', margin: '6px 0 0' }}>{error}</p>}
                </form>
              )}
              {onListSettings && (
                <Item icon={<Settings size={15} />} label="Listeinnstillinger" onClick={() => { setOpen(false); onListSettings(); }} />
              )}
              {onManageLists && (
                <Item icon={<ListChecks size={15} />} label="Mine lister og delinger" onClick={() => { setOpen(false); onManageLists(); }} />
              )}
              <Item icon={<LogOut size={15} />} label="Logg ut" onClick={() => signOut()} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
