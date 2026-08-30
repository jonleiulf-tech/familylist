import { useEffect, useState } from 'react';
import { LogOut, ListChecks, Settings, Pencil, Check, ImagePlus, Camera, ShieldCheck, Bug, Star } from 'lucide-react';
import { POINT_KINDS, EARN_GUIDE, levelFor, motivation } from '../lib/points.js';
import { shortDate } from '../lib/format.js';
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
  const [showPoints, setShowPoints] = useState(false);
  const [pointEvents, setPointEvents] = useState(null);   // null = ikke hentet
  const [showFeedback, setShowFeedback] = useState(false);

  const openPoints = async () => {
    setOpen(false);
    setShowPoints(true);
    const { data } = await supabase
      .from('point_events')
      .select('id, kind, points, note, created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    setPointEvents(data ?? []);
  };
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackState, setFeedbackState] = useState(null);  // 'busy' | 'sent' | feilmelding

  const sendFeedback = async (e) => {
    e.preventDefault();
    setFeedbackState('busy');
    const { error: err } = await supabase.from('app_feedback').insert({
      user_id: user.id,
      household_id: activeList?.id ?? null,
      message: feedbackText.trim(),
      context: typeof window !== 'undefined' ? window.location.hash || 'app' : 'app',
    });
    if (err) { setFeedbackState(err.message); return; }
    setFeedbackState('sent');
    setFeedbackText('');
  };

  // Sjekk admin-status hver gang menyen åpnes — vises kun for admin.
  // (Sjekkes på nytt hver gang, så en nylig satt ADMIN_EMAILS-secret
  // slår inn uten at siden må lastes helt på nytt.)
  useEffect(() => {
    if (!open) return;
    let active = true;
    supabase.functions.invoke('admin', { body: { action: 'ping' } })
      .then(({ data }) => { if (active) setIsAdmin(Boolean(data?.admin)); })
      .catch(() => { if (active) setIsAdmin(false); });
    return () => { active = false; };
  }, [open]);

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
      // Unikt filnavn per opplasting — da trengs ingen upsert, som ville
      // krevd flere storage-rettigheter enn ren innsetting.
      const path = `${user.id}/avatar-${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from('avatars').upload(path, blob, { upsert: false, contentType: 'image/jpeg' });
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
              <Item
                icon={<Star size={15} />}
                label="Mine Plukkepoeng"
                onClick={openPoints}
              />
              <Item
                icon={<Bug size={15} />}
                label="Rapporter en feil"
                onClick={() => { setOpen(false); setShowFeedback(true); setFeedbackState(null); }}
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

      {showPoints && (() => {
        const total = (pointEvents ?? []).reduce((s, e) => s + e.points, 0);
        const level = levelFor(total);
        return (
          <Dialog
            title="Mine Plukkepoeng"
            subtitle="Poeng for å bidra til fellesskapet"
            onClose={() => setShowPoints(false)}
          >
            <div style={{
              background: 'var(--color-accent-100)', borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-4)', textAlign: 'center',
            }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 34, color: 'var(--color-accent-700)' }}>
                {pointEvents === null ? '…' : total}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>
                {level.name}
                {level.next && (
                  <span className="text-muted" style={{ fontWeight: 400 }}>
                    {' '}· {level.toNext} poeng til «{level.next.name}»
                  </span>
                )}
              </div>
              <p style={{ fontSize: 12, margin: '8px 0 0' }}>{motivation(total)}</p>
            </div>

            <div className="card-kicker" style={{ marginTop: 'var(--space-4)', marginBottom: 4 }}>
              Slik tjener du poeng
            </div>
            {EARN_GUIDE.map((e) => (
              <div key={e.text} className="row" style={{ gap: 8, padding: '5px 0', fontSize: 13 }}>
                <span>{e.icon}</span>
                <span style={{ flex: 1 }}>{e.text}</span>
                <span style={{ fontWeight: 700, color: 'var(--color-accent-700)' }}>+{e.points}</span>
              </div>
            ))}

            {pointEvents && pointEvents.length > 0 && (
              <>
                <div className="card-kicker" style={{ marginTop: 'var(--space-4)', marginBottom: 4 }}>
                  Historikk
                </div>
                {pointEvents.map((e) => (
                  <div key={e.id} className="row" style={{ gap: 8, padding: '5px 0', fontSize: 13 }}>
                    <span>{POINT_KINDS[e.kind]?.icon ?? '⭐'}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      {e.note ?? POINT_KINDS[e.kind]?.label ?? e.kind}
                      <span className="text-muted"> · {shortDate(e.created_at)}</span>
                    </span>
                    <span style={{ fontWeight: 700 }}>+{e.points}</span>
                  </div>
                ))}
              </>
            )}
            {pointEvents && pointEvents.length === 0 && (
              <p className="text-muted" style={{ fontSize: 12, marginTop: 'var(--space-3)' }}>
                Ingen poeng ennå — det første bidraget ditt venter der ute!
              </p>
            )}

            <p className="text-muted" style={{ fontSize: 11, marginTop: 'var(--space-4)', marginBottom: 0 }}>
              Poengene er en påskjønnelse for bidrag. På sikt skal de kunne
              løses inn — for eksempel i gratis bruk eller fordeler hos en
              partner. Innløsning er ikke åpnet ennå; poengene dine blir stående.
            </p>
          </Dialog>
        );
      })()}

      {showFeedback && (
        <Dialog
          title="Rapporter en feil"
          subtitle="Meldingen går rett til utvikleren av Plukkelisten"
          onClose={() => setShowFeedback(false)}
        >
          {feedbackState === 'sent' ? (
            <>
              <p style={{ fontSize: 14, marginTop: 0 }}>
                Takk! Rapporten er sendt. Vi svarer på {user?.email} om vi
                trenger mer informasjon.
              </p>
              <button type="button" className="btn btn-block" onClick={() => setShowFeedback(false)}>
                Lukk
              </button>
            </>
          ) : (
            <form onSubmit={sendFeedback}>
              <label className="field">
                <span className="field-label">Hva skjedde?</span>
                <textarea
                  className="input"
                  rows={5}
                  value={feedbackText}
                  placeholder="f.eks. «Da jeg trykket Fullfør handletur skjedde det ingenting …»"
                  onChange={(e) => setFeedbackText(e.target.value)}
                  autoFocus
                />
              </label>
              <button
                type="submit"
                className="btn btn-primary btn-block"
                disabled={feedbackState === 'busy' || feedbackText.trim().length < 3}
              >
                {feedbackState === 'busy' ? 'Sender …' : 'Send rapporten'}
              </button>
              {feedbackState && feedbackState !== 'busy' && (
                <p style={{ fontSize: 12, color: 'var(--color-accent)', margin: '8px 0 0' }}>{feedbackState}</p>
              )}
              <p className="text-muted" style={{ fontSize: 11, marginTop: 'var(--space-3)', marginBottom: 0 }}>
                Gjelder det feil navn eller pris på én bestemt vare? Da er det
                enda bedre å trykke på varen i handlelisten og bruke «Meld feil
                på denne varen» — de rettes automatisk hver natt.
              </p>
            </form>
          )}
        </Dialog>
      )}

      {showAvatar && (
        <Dialog
          title="Velg profilbilde"
          subtitle="Velg en av de 50 karakterene, eller last opp ditt eget bilde"
          onClose={() => setShowAvatar(false)}
          footer={
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              {/* capture="user" ber mobilen åpne frontkameraet direkte;
                  på desktop faller den tilbake til vanlig filvelger. */}
              <label className="btn btn-primary" style={{ flex: 1, justifyContent: 'center', cursor: 'pointer' }}>
                <Camera size={15} /> Ta en selfie
                <input
                  type="file"
                  accept="image/*"
                  capture="user"
                  style={{ display: 'none' }}
                  onChange={(e) => uploadPhoto(e.target.files?.[0])}
                />
              </label>
              <label className="btn" style={{ flex: 1, justifyContent: 'center', cursor: 'pointer' }}>
                <ImagePlus size={15} /> Last opp bilde
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => uploadPhoto(e.target.files?.[0])}
                />
              </label>
              <button type="button" className="btn" onClick={() => saveAvatar(null)}>
                Initialer
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
