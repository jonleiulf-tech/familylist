import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { LogOut, ListChecks, Settings, Pencil, Check, ImagePlus, Camera, ShieldCheck, Bug, Star, Download, CreditCard, Info } from 'lucide-react';
import { AboutDialog } from './About.jsx';
import { InstallDialog, useInstallApp } from './InstallApp.jsx';
import { POINT_KINDS, EARN_GUIDE, levelFor, motivation, REDEEM_COST, subscriptionLabel } from '../lib/points.js';
import { shortDate } from '../lib/format.js';
// Adminpanelet er bare for administratoren — lastes først når det åpnes.
const AdminDialog = lazy(() =>
  import('./AdminDialog.jsx').then((m) => ({ default: m.AdminDialog })));
// Abonnementet åpnes sjelden — lastes først når noen ser på det.
const SubscriptionDialog = lazy(() =>
  import('./SubscriptionDialog.jsx').then((m) => ({ default: m.SubscriptionDialog })));
import { FeedbackDialog } from './FeedbackDialog.jsx';
import { supabase } from '../lib/supabase.js';
import { signOut } from '../hooks/useAuth.js';

/* Én rad i profilmenyen. På modulnivå så menyen ikke remonterer radene
   (og mister fokus) for hver render. */
function Item({ icon, label, onClick }) {
  return (
    <button
      type="button"
      className="btn btn-ghost btn-block"
      style={{ justifyContent: 'flex-start', textAlign: 'left', borderRadius: 'var(--radius)' }}
      onClick={onClick}
    >
      {icon} {label}
    </button>
  );
}
import { Dialog } from './Dialog.jsx';
import { KIND_LABEL } from './ListSwitcher.jsx';
import { AVATAR_IDS, AvatarFace, UserAvatar } from '../lib/avatars.jsx';

import { trimmed } from '../lib/text.js';
/** Skaler et opplastet bilde ned til en liten kvadratisk JPEG. */
async function downscale(file, px = 192) {
  // createImageBitmap leser kamerabilder best (og retter opp EXIF-rotasjon
  // så selfier ikke blir liggende sidelengs); <img> er reserveløsningen.
  let img = null;
  try {
    img = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch { /* eldre nettleser eller uvanlig format — prøv <img> under */ }

  const url = img ? null : URL.createObjectURL(file);
  try {
    if (!img) {
      img = await new Promise((res, rej) => {
        const el = new Image();
        el.onload = () => res(el);
        el.onerror = () => rej(new Error(`nettleseren kunne ikke vise formatet (${file.type || 'ukjent'})`));
        el.src = url;
      });
    }
    const side = Math.min(img.width, img.height);
    if (!side) throw new Error('bildet var tomt');
    const canvas = document.createElement('canvas');
    canvas.width = px;
    canvas.height = px;
    canvas.getContext('2d').drawImage(
      img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, px, px,
    );
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
    if (!blob) throw new Error('kunne ikke lage jpeg av bildet');
    return blob;
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}

/**
 * Selfie-kamera INNE i appen. Å hoppe ut til kamera-appen (input med
 * capture="user") feiler på mange Android-mobiler: nettleserfanen kastes
 * ut av minnet mens kameraet er åpent, siden lastes på nytt, og bildet
 * forsvinner på veien. Med getUserMedia skjer alt i samme side.
 */
function SelfieDialog({ onCapture, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then((stream) => {
        if (!active) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch((e) => setError(e?.name === 'NotAllowedError'
        ? 'Du må gi nettleseren lov til å bruke kameraet (spørsmålet dukker opp øverst på siden).'
        : `Fikk ikke åpnet kameraet: ${e?.message ?? e}`));
    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const snap = () => {
    const v = videoRef.current;
    if (!v?.videoWidth) return;
    const side = Math.min(v.videoWidth, v.videoHeight);
    const canvas = document.createElement('canvas');
    canvas.width = 192;
    canvas.height = 192;
    const ctx = canvas.getContext('2d');
    // Speilvend som i forhåndsvisningen — bildet blir slik du så deg selv.
    ctx.translate(192, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, 192, 192);
    canvas.toBlob((blob) => { if (blob) onCapture(blob); }, 'image/jpeg', 0.85);
  };

  return (
    <Dialog
      title="Ta en selfie"
      subtitle="Bildet tas her i appen — trykk på den røde knappen"
      onClose={onClose}
      footer={
        <div className="row" style={{ gap: 8 }}>
          <button
            type="button"
            className="btn btn-primary"
            style={{ flex: 1, justifyContent: 'center' }}
            onClick={snap}
            disabled={!ready || Boolean(error)}
          >
            <Camera size={15} /> {ready ? 'Knips!' : 'Starter kamera …'}
          </button>
          <button type="button" className="btn" onClick={onClose}>Avbryt</button>
        </div>
      }
    >
      {error
        ? <p style={{ fontSize: 13, color: 'var(--color-accent)', margin: 0 }}>{error}</p>
        : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            onLoadedMetadata={() => setReady(true)}
            style={{
              width: '100%', borderRadius: 'var(--radius)', display: 'block',
              transform: 'scaleX(-1)',            // speilvendt forhåndsvisning
              background: 'var(--color-bg-sunken)', minHeight: 200,
            }}
          />
        )}
    </Dialog>
  );
}

/**
 * «Min profil» øverst til høyre: rund avatar med initialer som åpner en
 * meny med navn/e-post, endre visningsnavn, snarveier og logg ut —
 * slik de fleste nettsteder gjør det.
 */
export function ProfileMenu({
  user, members, lists = [], activeList = null,
  onSelectList, onLeaveList, onGoLists, onListSettings, onRenameList, onSaved, toast,
}) {
  const [open, setOpen] = useState(false);
  const [editName, setEditName] = useState(null);   // null = viser, streng = redigerer
  const [showLists, setShowLists] = useState(false);
  const [renaming, setRenaming] = useState(null);   // { id, name } under omdøping
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const [showAvatar, setShowAvatar] = useState(false);
  const [avatarState, setAvatarState] = useState(null);  // 'busy' | feilmelding
  const [isAdmin, setIsAdmin] = useState(null);          // null = ikke sjekket ennå
  const [showAdmin, setShowAdmin] = useState(false);
  const [showPoints, setShowPoints] = useState(false);
  const [pointEvents, setPointEvents] = useState(null);   // null = ikke hentet
  const [pointTotal, setPointTotal] = useState(0);        // sum over ALLE hendelser
  const [showInstall, setShowInstall] = useState(false);
  const { installed: appInstalled } = useInstallApp();
  const [showFeedback, setShowFeedback] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showSelfie, setShowSelfie] = useState(false);
  const selfieInputRef = useRef(null);   // reserve: gammeldags kamera-input

  const [subscription, setSubscription] = useState(null);
  const [showSubscription, setShowSubscription] = useState(false);

  const openPoints = async () => {
    setOpen(false);
    setShowPoints(true);
    const [{ data }, all, sub] = await Promise.all([
      supabase
        .from('point_events')
        .select('id, kind, points, note, created_at')
        .order('created_at', { ascending: false })
        .limit(50),
      // Saldoen summeres over ALLE hendelser, ikke bare de 50 nyeste — ellers
      // spriker totalen mot Hjem-badgen og gater innløsning feil.
      supabase.from('point_events').select('points'),
      activeList
        ? supabase.from('subscriptions').select('*').eq('household_id', activeList.id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    setPointEvents(data ?? []);
    setPointTotal((all.data ?? []).reduce((s, r) => s + (Number(r.points) || 0), 0));
    setSubscription(sub?.data ?? null);
  };

  /** 150 poeng → 1 måned gratis for husholdningen. Alt skjer i databasen. */
  const redeemMonth = async () => {
    setBusy(true);
    try {
      const { data, error: err } = await supabase.rpc('redeem_points_for_month', {
        p_household: activeList.id,
      });
      const res = Array.isArray(data) ? data[0] : data;
      if (err || !res?.ok) { toast?.(res?.message ?? err?.message ?? 'Noe gikk galt.'); return; }
      toast?.(res.message);
      await openPoints();   // fersk saldo, historikk og ny dato
    } finally {
      setBusy(false);
    }
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

  /** Last opp en ferdig JPEG-blob og lagre den som profilbilde. */
  const uploadBlob = async (blob) => {
    setAvatarState('busy');
    try {
      // Unikt filnavn per opplasting — da trengs ingen upsert, som ville
      // krevd flere storage-rettigheter enn ren innsetting.
      const path = `${user.id}/avatar-${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from('avatars').upload(path, blob, { upsert: false, contentType: 'image/jpeg' });
      if (upErr) { setAvatarState(upErr.message); return; }
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      await saveAvatar(data.publicUrl);
    } catch (e) {
      setAvatarState(`Kunne ikke laste opp bildet: ${e?.message ?? e}`);
    }
  };

  const uploadPhoto = async (file) => {
    if (!file) return;
    setAvatarState('busy');
    try {
      await uploadBlob(await downscale(file));
    } catch (e) {
      // Vis den faktiske årsaken — «kunne ikke lese bildet» alene gjør
      // feilsøking på mobil umulig.
      setAvatarState(`Kunne ikke bruke bildet: ${e?.message ?? e}`);
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
        // initials regnes ut av databasen (generated always). Skrev vi den,
        // avviste Postgres hele oppdateringen — og navnebytte var umulig.
        .update({ display_name: name })
        .eq('user_id', user.id);
      if (err) { setError(err.message); return; }
      setEditName(null);
      await onSaved?.();
    } finally {
      setBusy(false);
    }
  };

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
              width: 'min(300px, calc(100vw - 32px))', background: 'var(--color-surface)',
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
                icon={<CreditCard size={15} />}
                label="Abonnement"
                onClick={() => { setOpen(false); setShowSubscription(true); }}
              />
              <Item
                icon={<Star size={15} />}
                label="Mine Plukkepoeng"
                onClick={openPoints}
              />
              {!appInstalled && (
                <Item
                  icon={<Download size={15} />}
                  label="Få appen på startskjermen"
                  onClick={() => { setOpen(false); setShowInstall(true); }}
                />
              )}
              <Item
                icon={<Bug size={15} />}
                label="Meld feil eller ønske"
                onClick={() => { setOpen(false); setShowFeedback(true); }}
              />
              <Item
                icon={<Info size={15} />}
                label="Om Plukkelisten og kildene"
                onClick={() => { setOpen(false); setShowAbout(true); }}
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

      {showSubscription && (
        <Suspense fallback={null}>
          <SubscriptionDialog
            list={activeList}
            isOwner={me?.role === 'owner'}
            onClose={() => setShowSubscription(false)}
            toast={toast}
          />
        </Suspense>
      )}

      {showAdmin && (
        <Suspense fallback={null}>
          <AdminDialog onClose={() => setShowAdmin(false)} toast={(m) => toast?.(m)} />
        </Suspense>
      )}

      {showPoints && (() => {
        const total = pointTotal;
        const level = levelFor(total);
        return (
          <Dialog
            title="Mine Plukkepoeng"
            subtitle="Poeng for å bidra til fellesskapet"
            onClose={() => setShowPoints(false)}
          >
            <div style={{
              background: 'linear-gradient(160deg, var(--color-honey-100), var(--color-honey-200))',
              border: '1px solid var(--color-honey-200)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-5) var(--space-4)', textAlign: 'center',
              boxShadow: 'var(--shadow-sm)',
            }}>
              <div className="tnum" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 40, lineHeight: 1, color: 'var(--color-honey-600)' }}>
                {pointEvents === null ? '…' : total}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 6, color: 'var(--color-honey-600)' }}>
                {level.name}
                {level.next && (
                  <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>
                    {' '}· {level.toNext} poeng til «{level.next.name}»
                  </span>
                )}
              </div>
              <p style={{ fontSize: 12, margin: '8px 0 0', color: 'var(--color-text)' }}>{motivation(total)}</p>
            </div>

            {/* ---- Abonnement + innløsning: 150 poeng = 1 måned gratis ---- */}
            {subscription && (
              <div style={{
                border: `1px solid ${total >= REDEEM_COST ? 'var(--color-honey-200)' : 'var(--color-divider)'}`,
                borderRadius: 'var(--radius)',
                padding: '12px 14px', marginTop: 'var(--space-3)',
                background: total >= REDEEM_COST ? 'var(--color-honey-100)' : 'var(--color-surface)',
              }}>
                <div className="row-between" style={{ gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>
                      {activeList?.name ?? 'Listen'}
                    </div>
                    <div className="text-muted" style={{ fontSize: 12 }}>
                      {subscriptionLabel(subscription)}
                    </div>
                  </div>
                  {total >= REDEEM_COST && (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={redeemMonth}
                      disabled={busy}
                      style={{ flexShrink: 0 }}
                    >
                      🎁 {busy ? 'Løser inn …' : `Løs inn ${REDEEM_COST} → 1 mnd`}
                    </button>
                  )}
                </div>
                {total < REDEEM_COST && (
                  <p className="text-muted" style={{ fontSize: 11, margin: '8px 0 0' }}>
                    {REDEEM_COST - total} poeng til du kan løse inn én måned
                    gratis for hele husholdningen (150 poeng = 1 måned).
                  </p>
                )}
              </div>
            )}

            <div className="card-kicker" style={{ marginTop: 'var(--space-4)', marginBottom: 4 }}>
              Slik tjener du poeng
            </div>
            {EARN_GUIDE.map((e) => (
              <div key={e.text} className="row" style={{ gap: 8, padding: '5px 0', fontSize: 13 }}>
                <span>{e.icon}</span>
                <span style={{ flex: 1 }}>{e.text}</span>
                <span className="tnum" style={{ fontWeight: 700, color: 'var(--color-honey-600)' }}>+{e.points}</span>
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
                    <span className="tnum" style={{ fontWeight: 700, color: e.points < 0 ? 'var(--color-text-muted)' : 'var(--color-honey-600)' }}>
                      {e.points > 0 ? `+${e.points}` : e.points}
                    </span>
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
              Poengene er personlige og utløper aldri. 150 poeng kan løses inn
              i én måned gratis Plukkelisten for hele husholdningen — bidragene
              dine betaler rett og slett regningen.
            </p>
          </Dialog>
        );
      })()}

      {showInstall && <InstallDialog onClose={() => setShowInstall(false)} />}

      {showFeedback && (
        <FeedbackDialog
          user={user}
          householdId={activeList?.id ?? null}
          onClose={() => setShowFeedback(false)}
        />
      )}

      {showAbout && <AboutDialog onClose={() => setShowAbout(false)} />}

      {showSelfie && (
        <SelfieDialog
          onClose={() => setShowSelfie(false)}
          onCapture={async (blob) => {
            setShowSelfie(false);
            await uploadBlob(blob);
          }}
        />
      )}

      {showAvatar && (
        <Dialog
          title="Velg profilbilde"
          subtitle="Velg en av de 50 karakterene, eller last opp ditt eget bilde"
          onClose={() => setShowAvatar(false)}
          footer={
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              {/* Kameraet åpnes INNE i appen (SelfieDialog) — å hoppe ut til
                  kamera-appen mister bildet på mange Android-mobiler. Den
                  gamle capture-inputen er reserve for eldre nettlesere. */}
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => {
                  if (navigator.mediaDevices?.getUserMedia) setShowSelfie(true);
                  else selfieInputRef.current?.click();
                }}
              >
                <Camera size={15} /> Ta en selfie
              </button>
              <input
                ref={selfieInputRef}
                type="file"
                accept="image/*"
                capture="user"
                style={{ display: 'none' }}
                onChange={(e) => uploadPhoto(e.target.files?.[0])}
              />
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
          onClose={() => { setShowLists(false); setRenaming(null); }}
          footer={onGoLists ? (
            <button
              type="button"
              className="btn btn-block"
              onClick={() => { setShowLists(false); onGoLists(); }}
            >
              Åpne Lister-fanen (egne lister og deling)
            </button>
          ) : null}
        >
          {lists.map((l) => {
            const isActive = l.id === activeList?.id;
            return (
              <div key={l.id} className="item-row" style={{ paddingLeft: 0, paddingRight: 0 }}>
                {renaming?.id === l.id ? (
                  <form
                    style={{ flex: 1 }}
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const name = trimmed(renaming.name);
                      if (!name) return;
                      const err = await onRenameList?.(l.id, name);
                      if (err) toast?.(err);
                      else toast?.(`Listen heter nå «${name}»`);
                      setRenaming(null);
                    }}
                  >
                    <div className="row" style={{ gap: 6 }}>
                      <input
                        className="input"
                        value={renaming.name}
                        onChange={(e) => setRenaming({ id: l.id, name: e.target.value })}
                        aria-label={`Nytt navn på ${l.name}`}
                        autoFocus
                      />
                      <button type="submit" className="btn btn-primary btn-sm">Lagre</button>
                      <button type="button" className="btn btn-sm" onClick={() => setRenaming(null)}>Avbryt</button>
                    </div>
                  </form>
                ) : (
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
                )}
                {renaming?.id !== l.id && l.myRole === 'owner' && onRenameList && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-icon"
                    onClick={() => setRenaming({ id: l.id, name: l.name })}
                    aria-label={`Endre navn på ${l.name}`}
                    title="Endre navn"
                  >
                    <Pencil size={14} />
                  </button>
                )}
                {renaming?.id !== l.id && !isActive && onSelectList && (
                  <button type="button" className="btn btn-sm" onClick={() => onSelectList(l.id)}>
                    Bytt til
                  </button>
                )}
                {renaming?.id !== l.id && l.myRole !== 'owner' && onLeaveList && (
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
            Blyanten endrer navnet på en liste du er admin for. Invitasjoner og
            medlemshåndtering ligger under Lister-fanen → «Denne delte listen».
          </p>
        </Dialog>
      )}
    </div>
  );
}
