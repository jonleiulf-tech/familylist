import { useEffect, useState } from 'react';
import { LogOut, ListChecks, Settings, Pencil, Check, ImagePlus, ShieldCheck } from 'lucide-react';
import { AdminDialog } from './AdminDialog.jsx';
import { supabase } from '../lib/supabase.js';
import { signOut } from '../hooks/useAuth.js';
import { Dialog } from './Dialog.jsx';
import { KIND_LABEL } from './ListSwitcher.jsx';
import { AVATAR_IDS, AvatarFace, UserAvatar } from '../lib/avatars.jsx';

/** Skaler et opplastet bilde ned til en liten kvadratisk JPEG. */
async function downscale(file, px = 192) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const el = new Image();
      el.onload = () => res(el);
      el.onerror = rej;
      el.src = url;
    });
    const side = Math.min(img.width, img.height);
    const canvas = document.createElement('canvas');
    canvas.width = px;
    canvas.height = px;
    canvas.getContext('2d').drawImage(
      img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, px, px,
    );
    return await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * «Min profil» øverst til høyre: rund avatar med initialer som åpner en
 * meny med navn/e-post, endre visningsnavn, snarveier og logg ut —
 * slik de fleste nettsteder gjør det.
 */
export function ProfileMenu({
  user, members, lists = [], activeList = null,
  onSelectList, onLeaveList, onGoLists, onListSettings, onSaved, toast,
}) {
  const [open, setOpen] = useState(false);
  const [editName, setEditName] = useState(null);   // null = viser, streng = redigerer
  const [showLists, setShowLists] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const [showAvatar, setShowAvatar] = useState(false);
  const [avatarState, setAvatarState] = useState(null);  // 'busy' | feilmelding
  const [isAdmin, setIsAdmin] = useState(null);          // null = ikke sjekket ennå
  const [showAdmin, setShowAdmin] = useState(false);

  // Sjekk admin-status første gang menyen åpnes — vises kun for admin.
  useEffect(() => {
    if (!open || isAdmin !== null) return;
    let active = true;
    supabase.functions.invoke('admin', { body: { action: 'ping' } })
      .then(({ data }) => { if (active) setIsAdmin(Boolean(data?.admin)); })
      .catch(() => { if (active) setIsAdmin(false); });
    return () => { active = false; };
  }, [open, isAdmin]);

  const me = members.find((m) => m.user_id === user?.id) || null;
  const displayName = me?.display_name || user?.email?.split('@')[0] || 'Meg';
  const initials = (me?.initials || displayName.slice(0, 2)).toUpperCase();

  /** Lagre avatar-id ('a17'), bilde-URL, eller null (tilbake til initialer). */
  const saveAvatar = async (value) => {
    setAvatarState('busy');
    const { error: err } = await supabase
      .from('members').update({ avatar: value }).eq('user_id', user.id);
    if (err) { setAvatarState(err.message); return; }
    setAvatarState(null);
    setShowAvatar(false);
    await onSaved?.();
  };

  const uploadPhoto = async (file) => {
    if (!file) return;
    setAvatarState('busy');
    try {
      const blob = await downscale(file);
      const path = `${user.id}/avatar-${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from('avatars').upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
      if (upErr) { setAvatarState(upErr.message); return; }
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      await saveAvatar(data.publicUrl);
    } catch {
      setAvatarState('Kunne ikke lese bildet.');
    }
  };

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
          padding: 0, border: 'none', background: 'none', cursor: 'pointer',
          borderRadius: 'var(--radius-full)', boxShadow: 'var(--shadow-sm)',
        }}
      >
        <UserAvatar avatar={me?.avatar} initials={initials} size={36} />
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
              <UserAvatar avatar={me?.avatar} initials={initials} size={40} />
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
              <Item
                icon={<ImagePlus size={15} />}
                label="Bytt profilbilde"
                onClick={() => { setOpen(false); setShowAvatar(true); setAvatarState(null); }}
              />
              {onListSettings && (
                <Item icon={<Settings size={15} />} label="Listeinnstillinger" onClick={() => { setOpen(false); onListSettings(); }} />
              )}
              <Item
                icon={<ListChecks size={15} />}
                label="Mine lister og delinger"
                onClick={() => { setOpen(false); setShowLists(true); }}
              />
              {isAdmin && (
                <Item
                  icon={<ShieldCheck size={15} />}
                  label="Administrasjon"
                  onClick={() => { setOpen(false); setShowAdmin(true); }}
                />
              )}
              <Item icon={<LogOut size={15} />} label="Logg ut" onClick={() => signOut()} />
            </div>
          </div>
        </>
      )}

      {showAdmin && <AdminDialog onClose={() => setShowAdmin(false)} toast={(m) => toast?.(m)} />}

      {showAvatar && (
        <Dialog
          title="Velg profilbilde"
          subtitle="Velg en av de 50 karakterene, eller last opp ditt eget bilde"
          onClose={() => setShowAvatar(false)}
          footer={
            <div className="row" style={{ gap: 8 }}>
              <label className="btn btn-primary" style={{ flex: 1, justifyContent: 'center', cursor: 'pointer' }}>
                <ImagePlus size={15} /> Last opp eget bilde
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => uploadPhoto(e.target.files?.[0])}
                />
              </label>
              <button type="button" className="btn" onClick={() => saveAvatar(null)}>
                Bruk initialer
              </button>
            </div>
          }
        >
          {avatarState === 'busy' && (
            <p className="text-muted" style={{ fontSize: 12, marginTop: 0 }}>Lagrer …</p>
          )}
          {avatarState && avatarState !== 'busy' && (
            <p style={{ fontSize: 12, color: 'var(--color-accent)', marginTop: 0 }}>{avatarState}</p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(52px, 1fr))', gap: 8 }}>
            {AVATAR_IDS.map((id) => (
              <button
                key={id}
                type="button"
                aria-label={`Avatar ${id}`}
                aria-pressed={me?.avatar === id}
                onClick={() => saveAvatar(id)}
                style={{
                  padding: 2, background: 'none', cursor: 'pointer',
                  border: me?.avatar === id ? '2px solid var(--color-accent)' : '2px solid transparent',
                  borderRadius: 'var(--radius-full)',
                }}
              >
                <AvatarFace id={id} size={48} />
              </button>
            ))}
          </div>
        </Dialog>
      )}

      {showLists && (
        <Dialog
          title="Mine lister og delinger"
          subtitle={`Du er med i ${lists.length} ${lists.length === 1 ? 'delt liste' : 'delte lister'}`}
          onClose={() => setShowLists(false)}
          footer={onGoLists ? (
            <button
              type="button"
              className="btn btn-block"
              onClick={() => { setShowLists(false); onGoLists(); }}
            >
              Åpne Lister-fanen (egne lister, kvitteringer, deling)
            </button>
          ) : null}
        >
          {lists.map((l) => {
            const isActive = l.id === activeList?.id;
            return (
              <div key={l.id} className="item-row" style={{ paddingLeft: 0, paddingRight: 0 }}>
                <div className="item-mid" style={{ cursor: 'default' }}>
                  <div className="item-name">
                    {l.name}{' '}
                    {isActive && <span className="tag tag-accent" style={{ fontSize: 9 }}><Check size={9} /> Aktiv</span>}
                  </div>
                  <div className="item-sub">
                    {[KIND_LABEL[l.kind] ?? l.kind, l.myRole === 'owner' ? 'du er admin' : 'medlem',
                      isActive && members.length ? `${members.length} ${members.length === 1 ? 'medlem' : 'medlemmer'}` : null]
                      .filter(Boolean).join(' · ')}
                  </div>
                </div>
                {!isActive && onSelectList && (
                  <button type="button" className="btn btn-sm" onClick={() => onSelectList(l.id)}>
                    Bytt til
                  </button>
                )}
                {l.myRole !== 'owner' && onLeaveList && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={async () => {
                      const err = await onLeaveList(l.id);
                      if (err) toast?.(err);
                      else toast?.(`Du forlot «${l.name}»`);
                    }}
                  >
                    Forlat
                  </button>
                )}
              </div>
            );
          })}
          {lists.length === 0 && (
            <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
              Ingen delte lister ennå.
            </p>
          )}
          <p className="text-muted" style={{ fontSize: 11, marginTop: 'var(--space-3)', marginBottom: 0 }}>
            Invitasjoner og medlemshåndtering ligger under Lister-fanen →
            «Familiedeling». Bare admin kan endre navn og innstillinger på en
            delt liste.
          </p>
        </Dialog>
      )}
    </div>
  );
}
