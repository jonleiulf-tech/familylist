import { lazy, Suspense, useState } from 'react';
import { Copy, Check, UserPlus, Plus, Download, LogIn, X, Crown, Wallet, Settings, ScanLine, ListChecks, Hash, Share2 } from 'lucide-react';
import { Dialog } from '../components/Dialog.jsx';
import { CustomListDialog, NewListDialog } from '../components/CustomListDialog.jsx';
import { CountListDialog } from '../components/CountListDialog.jsx';
import { ImportDialog } from '../components/ImportDialog.jsx';
// Skanneren (kamera + tolkning) lastes først når den åpnes.
const ListScanDialog = lazy(() =>
  import('../components/ListScanDialog.jsx').then((m) => ({ default: m.ListScanDialog })));
import { ReviewDialog } from '../components/ReviewDialog.jsx';
import { resolveCatalogItem, guessUnit, guessCategory } from '../lib/catalog.js';
import { Settlement } from '../components/Settlement.jsx';
import { ListSettingsDialog } from '../components/ListSettingsDialog.jsx';
import { KIND_LABEL } from '../components/ListSwitcher.jsx';
import { UserAvatar } from '../lib/avatars.jsx';
import { parseListText, progressLabel } from '../lib/customLists.js';
import { countItem, countTotals, parseCountLine } from '../lib/countList.js';

import { lower } from '../lib/text.js';
/**
 * Lister + familiedeling.
 * «Inviter» lager en engangslenke som er gyldig i 7 dager.
 */
export function Lists({
  household, members, lists, catalog, normRules, defaultStore, importQueue,
  shoppingItems, isOwner, onRemoveMember, onLeaveList, onUpdateList,
  onCreateInvite, onSendInvite, onRedeemInvite, onSignOut, onImport, onQueue, onQueueResolve, toast,
}) {
  const [openList, setOpenList] = useState(null);
  const [creating, setCreating] = useState(null);   // null, ellers forvalgt type
  const [importing, setImporting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanReview, setScanReview] = useState(null);   // rader fra skannet liste
  const [joining, setJoining] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState(null);
  const [joinBusy, setJoinBusy] = useState(false);
  const [settling, setSettling] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteStatus, setInviteStatus] = useState(null);
  const [sending, setSending] = useState(false);
  const [editingList, setEditingList] = useState(false);
  const [invite, setInvite] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [problem, setProblem] = useState(null);

  // Tellelister løftes ut i egen spalte — det er en annen jobb enn å plukke
  // ting til en tur, selv om lagringen er den samme.
  const pickLists = lists.lists.filter((l) => l.type !== 'telling');
  const countLists = lists.lists.filter((l) => l.type === 'telling');

  const makeInvite = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const { link, code, expiresAt, error } = await onCreateInvite();
      if (error) { setProblem(error); toast(error); return; }
      setInvite({ link, code, expiresAt });
      setCopied(false);
    } finally {
      // I finally, slik at knappen aldri blir stående og laste
      // uansett hva som gikk galt over.
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invite.link);
      setCopied(true);
    } catch {
      toast('Kunne ikke kopiere automatisk — marker lenken og kopier manuelt.');
    }
  };

  return (
    <div>
      <div className="section-head">
        <span className="section-title">Denne delte listen</span>
        <div className="row" style={{ gap: 4 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSettling(true)}>
            <Wallet size={14} /> Oppgjør
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-icon"
            onClick={() => setEditingList(true)}
            aria-label="Listeinnstillinger"
          >
            <Settings size={14} />
          </button>
        </div>
      </div>
      <div style={{ padding: '0 var(--space-4) var(--space-4)' }}>
        <div className="card">
          <div className="card-kicker">
            {KIND_LABEL[household?.kind] ?? household?.kind ?? 'Delt liste'}
          </div>
          <div className="card-title">{household?.name}</div>

          <div className="stack" style={{ gap: 0, marginTop: 'var(--space-3)' }}>
            {members.map((m) => (
              <div
                key={m.user_id}
                className="row"
                style={{ padding: '7px 0', borderBottom: '1px solid var(--color-divider-soft)' }}
              >
                <UserAvatar
                  avatar={m.avatar}
                  initials={m.initials ?? lower(m.display_name).slice(0, 2).toUpperCase()}
                  size={30}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14 }}>{m.display_name}</div>
                  {m.role === 'owner' && (
                    <div className="text-muted" style={{ fontSize: 11 }}>
                      <Crown size={10} style={{ verticalAlign: -1 }} /> admin
                    </div>
                  )}
                </div>
                {/* Bare admin kan fjerne andre. RLS håndhever det uansett,
                    men knappen skal ikke friste noen forgjeves. */}
                {isOwner && m.role !== 'owner' && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-icon"
                    onClick={() => setConfirmRemove(m)}
                    aria-label={`Fjern ${m.display_name}`}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="card-meta">
            {members.length} av 10 plasser brukt. Endringer synkes i sanntid.
          </div>
          <button
            type="button"
            className="btn btn-primary btn-block"
            style={{ marginTop: 'var(--space-3)' }}
            onClick={() => { setInviteOpen(true); setInviteStatus(null); setInvite(null); }}
          >
            <UserPlus size={16} /> Inviter til listen
          </button>

          {problem && (
            <p style={{ fontSize: 12, marginTop: 'var(--space-2)', color: 'var(--color-accent)' }}>
              {problem}
            </p>
          )}

          {/* Redningsvei når man har havnet i feil husholdning, typisk fordi
              man logget inn med en annen e-postadresse enn første gang. */}
          {!joining ? (
            <button
              type="button"
              className="btn btn-ghost btn-block btn-sm"
              style={{ marginTop: 'var(--space-2)' }}
              onClick={() => { setJoining(true); setJoinError(null); }}
            >
              <LogIn size={14} /> Bli med i en delt liste
            </button>
          ) : (
            <div style={{ marginTop: 'var(--space-3)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--color-divider-soft)' }}>
              <label className="field">
                <span className="field-label">Invitasjonskode</span>
                <input
                  className="input"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="f.eks. K7QP"
                  autoCapitalize="characters" autoCorrect="off" spellCheck={false}
                  style={{
                    fontFamily: 'ui-monospace, monospace', textTransform: 'uppercase',
                    letterSpacing: '.18em', fontSize: 18, textAlign: 'center',
                  }}
                />
              </label>

              <div className="card" style={{ marginBottom: 'var(--space-3)' }}>
                <div className="card-body" style={{ marginTop: 0, fontSize: 12 }}>
                  Du blir med i listen <strong>i tillegg</strong> til dem du har
                  fra før. Ingenting forsvinner — <strong>{household?.name}</strong>{' '}
                  blir liggende, og du bytter mellom listene øverst i appen.
                </div>
              </div>

              <div className="row" style={{ gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  disabled={joinBusy || !joinCode.trim()}
                  onClick={async () => {
                    setJoinBusy(true);
                    setJoinError(null);
                    try {
                      const err = await onRedeemInvite(joinCode.trim());
                      if (err) { setJoinError(err); return; }
                      setJoining(false);
                      setJoinCode('');
                      toast('Du er med i listen nå.');
                    } finally {
                      setJoinBusy(false);
                    }
                  }}
                >
                  {joinBusy ? 'Flytter …' : 'Bli med'}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => { setJoining(false); setJoinError(null); }}
                >
                  Avbryt
                </button>
              </div>

              {joinError && (
                <p style={{ fontSize: 12, marginTop: 'var(--space-2)', color: 'var(--color-accent)' }}>
                  {joinError}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <hr className="divider" />
      {/* Kvitteringsopplastingen ligger på Handel, der handleturen slutter
          og kvitteringen ligger i lomma. Her står bare import. */}
      <div className="section-head"><span className="section-title">Import</span></div>
      <div className="stack" style={{ padding: '0 var(--space-4) var(--space-4)' }}>
        <button type="button" className="btn btn-block" onClick={() => setImporting(true)}>
          <Download size={16} /> Importer fra Google Keep
        </button>
        <button type="button" className="btn btn-block" onClick={() => setScanning(true)}>
          <ScanLine size={16} /> Skann en handleliste (håndskrevet eller utskrift)
        </button>
      </div>
      <p className="text-muted" style={{ padding: '0 var(--space-4) var(--space-4)', fontSize: 11 }}>
        Kvitteringer laster du opp under Handel — nederst på handlelisten.
      </p>

      {importQueue.length > 0 && (
        <>
          <div className="section-head">
            <span className="section-title">Venteliste</span>
            <span className="text-muted" style={{ fontSize: 11 }}>{importQueue.length}</span>
          </div>
          <p className="text-muted" style={{ padding: '0 var(--space-4) var(--space-2)', fontSize: 12 }}>
            Varer du utsatte under import.
          </p>
          {importQueue.map((q) => (
            <div key={q.id} className="item-row">
              <div className="item-mid">
                <div className="item-name">{q.raw_text}</div>
                {q.suggestion && <div className="item-sub">Forslag: {q.suggestion}</div>}
              </div>
              <div className="stack" style={{ gap: 4 }}>
                <button type="button" className="btn btn-sm" onClick={() => onQueueResolve(q, 'accepted')}>
                  Legg til
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => onQueueResolve(q, 'dropped')}>
                  Dropp
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      <hr className="divider" />
      <div className="list-columns">
        <ListColumn
          title="Egne plukkelister"
          icon={ListChecks}
          rows={pickLists}
          onOpen={setOpenList}
          onNew={() => setCreating('pakking')}
          newLabel="Ny plukkeliste"
          emptyTitle="Ingen plukkelister ennå"
          empty="Pakking til hytta, sportsutstyr, verktøy — alt som skal plukkes, men ikke handles. De kobles ikke mot varedatabasen, så «sovepose» blir aldri en dagligvare."
        />
        <ListColumn
          title="Egne tellelister"
          icon={Hash}
          rows={countLists}
          onOpen={setOpenList}
          onNew={() => setCreating('telling')}
          newLabel="Ny telleliste"
          emptyTitle="Ingen tellelister ennå"
          empty="Tell opp lageret sammen: hovedvare med varianter under (Sko → 39, 40, 41), antall i steg på 1, 5 eller 10, og eksport til Excel eller PDF. Flere kan telle samtidig."
        />
      </div>

      {/* «Logg ut» ligger i profilmenyen; her er bare det som gjelder lista.
          Destruktivt, så dempet — bekreftelsen kommer i dialogen. */}
      {household && (
        <>
          <hr className="divider" style={{ marginTop: 'var(--space-4)' }} />
          <div style={{ padding: 'var(--space-3) var(--space-4) var(--space-4)' }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ color: 'var(--color-accent-ink)', paddingLeft: 0 }}
              onClick={() => setConfirmLeave(true)}
            >
              Forlat denne listen
            </button>
          </div>
        </>
      )}

      {openList && (openList.type === 'telling'
        || (lists.lists.find((l) => l.id === openList.id)?.type === 'telling')) && (
        <CountListDialog
          // Ny liste = ny dialog. Uten key beholdt React instansen når
          // «Kopier» byttet listen under føttene på den, og et halvskrevet
          // navn i skjemaet ble lagret på kopien i stedet.
          key={openList.id}
          list={lists.lists.find((l) => l.id === openList.id) ?? openList}
          onClose={() => setOpenList(null)}
          onUpdate={lists.update}
          onBump={lists.bumpCount}
          onRename={lists.renameCount}
          onCopy={async (l) => {
            const copy = await lists.duplicate(l);
            // duplicate gir null når skrivingen feilet. Før ble dialogen
            // lukket og brukeren fikk beskjed om at kopien fantes.
            if (!copy) { toast('Kunne ikke kopiere listen'); return; }
            setOpenList(copy);
            toast(`Kopierte «${l.name}»`);
          }}
          onDelete={async (l) => {
            const snapshot = await lists.remove(l.id);
            setOpenList(null);
            toast(`«${l.name}» slettet`, () => lists.restore(snapshot));
          }}
          toast={toast}
        />
      )}

      {openList && openList.type !== 'telling'
        && (lists.lists.find((l) => l.id === openList.id)?.type ?? openList.type) !== 'telling' && (
        <CustomListDialog
          key={openList.id}
          // Les listen fra state, ikke fra det som var åpent da dialogen ble
          // åpnet — ellers vises ikke partnerens avhukinger mens den står oppe.
          list={lists.lists.find((l) => l.id === openList.id) ?? openList}
          onClose={() => setOpenList(null)}
          onUpdate={lists.update}
          onCopy={async (l) => {
            const copy = await lists.duplicate(l);
            // duplicate gir null når skrivingen feilet. Før ble dialogen
            // lukket og brukeren fikk beskjed om at kopien fantes.
            if (!copy) { toast('Kunne ikke kopiere listen'); return; }
            setOpenList(copy);
            toast(`Kopierte «${l.name}»`);
          }}
          onDelete={async (l) => {
            const snapshot = await lists.remove(l.id);
            setOpenList(null);
            toast(`«${l.name}» slettet`, () => lists.restore(snapshot));
          }}
        />
      )}

      {creating && (
        <NewListDialog
          initialType={creating}
          onClose={() => setCreating(null)}
          onCreate={async ({ name, type, paste }) => {
            const items = type === 'telling'
              ? String(paste ?? '').split('\n').map((line) => line.trim()).filter(Boolean)
                .map((line) => { const p = parseCountLine(line); return countItem(p.group, p.name, p.qty); })
              : parseListText(paste);
            const created = await lists.create({ name, type, items });
            setCreating(null);
            if (created) { setOpenList(created); toast(`«${name}» opprettet`); }
            else toast('Kunne ikke opprette listen');
          }}
        />
      )}

      {editingList && household && (
        <ListSettingsDialog
          list={household}
          isOwner={isOwner}
          onClose={() => setEditingList(false)}
          onSave={onUpdateList}
        />
      )}

      {settling && (
        <Settlement
          items={shoppingItems}
          members={members}
          onClose={() => setSettling(false)}
        />
      )}

      {/* Forlate listen — samme dialogmønster som «Fjern medlem», ikke
          nettleserens confirm(). Er du siste medlem, slettes alt. */}
      {confirmLeave && household && (() => {
        const alone = members.length <= 1;
        return (
          <Dialog
            title={alone ? `Slette «${household.name}»?` : `Forlate «${household.name}»?`}
            onClose={() => setConfirmLeave(false)}
            footer={
              <div className="row" style={{ gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  onClick={async () => {
                    setConfirmLeave(false);
                    const err = await onLeaveList(household.id);
                    toast(err ?? (alone ? `«${household.name}» er slettet` : `Du forlot «${household.name}»`));
                  }}
                >
                  {alone ? 'Slett listen' : 'Forlat listen'}
                </button>
                <button type="button" className="btn" onClick={() => setConfirmLeave(false)}>
                  Avbryt
                </button>
              </div>
            }
          >
            {alone ? (
              <p style={{ fontSize: 14, lineHeight: 1.5, marginTop: 0 }}>
                Du er eneste medlem. <strong>{household.name}</strong> og alt
                innholdet — handlelisten, middagsplanen og egne lister — slettes
                for godt. Dette kan ikke angres.
              </p>
            ) : (
              <p style={{ fontSize: 14, lineHeight: 1.5, marginTop: 0 }}>
                Du mister tilgangen til <strong>{household.name}</strong> med én
                gang. Listen består for de andre, og du kan bli invitert inn igjen senere.
              </p>
            )}
          </Dialog>
        );
      })()}

      {confirmRemove && (
        <Dialog
          title={`Fjern ${confirmRemove.display_name}?`}
          onClose={() => setConfirmRemove(null)}
          footer={
            <div className="row" style={{ gap: 8 }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={async () => {
                  const err = await onRemoveMember(confirmRemove.user_id);
                  setConfirmRemove(null);
                  toast(err ?? `${confirmRemove.display_name} er fjernet`);
                }}
              >
                Fjern
              </button>
              <button type="button" className="btn" onClick={() => setConfirmRemove(null)}>
                Avbryt
              </button>
            </div>
          }
        >
          <p style={{ fontSize: 14, lineHeight: 1.5, marginTop: 0 }}>
            Hen mister tilgangen til <strong>{household?.name}</strong> med én gang.
            Varer hen har lagt til blir liggende, men navnet forsvinner fra
            oppgjøret og beløpet havner under «mangler kjøper».
          </p>
          <p className="text-muted" style={{ fontSize: 12 }}>
            Du kan invitere hen inn igjen senere.
          </p>
        </Dialog>
      )}

      {/* Skann en handleliste: lapp/notat → gjennomgang → handlelisten */}
      {scanning && (
        <Suspense fallback={null}>
        <ListScanDialog
          onClose={() => setScanning(false)}
          onRows={(rows) => setScanReview(rows.map((r) => {
            const { name, item } = resolveCatalogItem(r.name, catalog, normRules);
            const qty = r.qty ?? 1;
            return {
              name,
              qty,
              unit: r.unit || guessUnit(name, item?.major_category, qty),
              category: item?.major_category || guessCategory(name),
              store: item?.primary_store || defaultStore,
              price: item?.avg_price ?? null,
              price_source: item?.avg_price ? 'receipt' : null,
            };
          }))}
        />
        </Suspense>
      )}

      {scanReview && (
        <ReviewDialog
          title="Leste jeg riktig?"
          subtitle={`${scanReview.length} varer fra den skannede listen — rett og godkjenn`}
          rows={scanReview}
          onCancel={() => setScanReview(null)}
          onSubmit={async (selected) => {
            await onImport(selected);
            setScanReview(null);
          }}
        />
      )}

      {importing && (
        <ImportDialog
          catalog={catalog}
          normRules={normRules}
          defaultStore={defaultStore}
          onClose={() => setImporting(false)}
          onQueue={onQueue}
          onImport={async (rows, queuedCount) => {
            await onImport(rows);
            setImporting(false);
            const parts = [];
            if (rows.length) parts.push(`${rows.length} lagt til`);
            if (queuedCount) parts.push(`${queuedCount} i venteliste`);
            toast(parts.join(' · ') || 'Ingenting importert');
          }}
        />
      )}

      {inviteOpen && (
        <Dialog
          title="Invitasjon til delt liste"
          subtitle={household?.name}
          onClose={() => setInviteOpen(false)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!inviteEmail.trim()) { setInviteStatus({ type: 'error', text: 'Skriv inn en e-postadresse.' }); return; }
              setSending(true);
              setInviteStatus(null);
              try {
                const res = await onSendInvite(inviteEmail.trim(), household?.id);
                if (res.ok) {
                  setInviteStatus({ type: 'ok', text: `Invitasjon sendt til ${inviteEmail.trim()}.` });
                  setInviteEmail('');
                } else if (res.noMailer) {
                  // Ikke en feil: appen sender bare ikke e-post ennå.
                  // Lenken gjør akkurat samme jobb, så den lages nå.
                  setInviteStatus({
                    type: 'info',
                    text: 'Appen sender ikke e-post ennå. Lenken under er klar — del den i meldinger eller chat.',
                  });
                  await makeInvite();
                } else {
                  setInviteStatus({ type: 'error', text: res.error });
                }
              } finally {
                setSending(false);
              }
            }}
          >
            <label className="field">
              <span className="field-label">E-postadresse</span>
              <input
                className="input" type="email"
                placeholder="navn@example.no"
                value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
              />
            </label>
            <button type="submit" className="btn btn-primary btn-block" disabled={sending}>
              {sending ? 'Sender …' : 'Send invitasjon'}
            </button>
          </form>

          {inviteStatus && (
            <p style={{
              fontSize: 13, marginTop: 'var(--space-3)',
              color: inviteStatus.type === 'ok' ? 'var(--color-success)'
                : inviteStatus.type === 'info' ? 'var(--color-text-muted)'
                  : 'var(--color-accent)',
            }}>
              {inviteStatus.text}
            </p>
          )}

          <hr className="divider" style={{ margin: 'var(--space-4) 0 0', height: 1, background: 'var(--color-divider-soft)' }} />
          <div className="section-head" style={{ paddingLeft: 0, paddingRight: 0 }}>
            <span className="section-title">Eller del selv</span>
          </div>

          {!invite ? (
            <button type="button" className="btn btn-block" onClick={makeInvite} disabled={busy}>
              {busy ? 'Lager lenke …' : 'Lag lenke og kode'}
            </button>
          ) : (
            <>
          <label className="field" style={{ marginTop: 'var(--space-4)' }}>
            <span className="field-label">Lenke</span>
            <input className="input" readOnly value={invite.link} onFocus={(e) => e.target.select()} />
          </label>

          <label className="field">
            <span className="field-label">Eller bare koden</span>
            <input
              className="input"
              readOnly
              value={invite.code ?? ''}
              onFocus={(e) => e.target.select()}
              style={{
                fontFamily: 'ui-monospace, monospace',
                // Koden leses ofte opp over telefon eller skrives inn på en
                // annen mobil. Da skal den være stor og luftig.
                letterSpacing: '.22em', fontSize: 26, fontWeight: 700,
                textAlign: 'center', padding: '12px 8px',
              }}
            />
            <span className="text-muted" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
              Virker ikke lenken, kan koden skrives inn under «Har du en
              invitasjonskode?» i oppstarten — eller her under Lister →
              «Bli med i en delt liste», om de alt har en konto.
            </span>
          </label>

          {/* Telefonens egen delingsmeny sender lenken rett i SMS,
              Messenger eller WhatsApp — ett trykk mindre enn å kopiere og
              lime inn selv. Finnes den ikke (skrivebord), kopieres den. */}
          <div className="row" style={{ gap: 8 }}>
            <button
              type="button"
              className="btn btn-primary"
              style={{ flex: 1 }}
              onClick={async () => {
                const text = `Bli med i «${household?.name ?? 'listen'}» på Plukkelisten: ${invite.link}`;
                if (navigator.share) {
                  try {
                    await navigator.share({ title: 'Plukkelisten', text });
                    return;
                  } catch { /* brukeren avbrøt delingen */ }
                }
                copy();
              }}
            >
              <Share2 size={16} /> Del lenke
            </button>
            <button type="button" className="btn" style={{ flex: 'none' }} onClick={copy} aria-label="Kopier lenke">
              {copied ? <><Check size={16} /> Kopiert</> : <><Copy size={16} /> Kopier</>}
            </button>
          </div>

          <p className="text-muted" style={{ fontSize: 11, marginTop: 'var(--space-3)' }}>
            Lenken kan brukes én gang, og utløper{' '}
            {invite.expiresAt ? new Date(invite.expiresAt).toLocaleDateString('nb-NO') : 'om 7 dager'}.
          </p>
            </>
          )}
        </Dialog>
      )}
    </div>
  );
}

/**
 * Én av de to spaltene på Lister-fanen. Plukkelister og tellelister er
 * likestilte: hver har sin overskrift, sin «Ny liste»-knapp og sin egen
 * forklaring når den er tom — så tellingen ikke blir gjemt bort som en
 * variant av noe annet.
 */
function ListColumn({ title, icon: Icon, rows, onOpen, onNew, newLabel, empty, emptyTitle }) {
  return (
    <section className="list-column">
      {/* Spaltehodet er et redaksjonelt seksjonshode: ikon, tittel, antall og
          en strek under. På mobil, der spaltene stables, er det streken som
          gjør det tydelig hvor plukkelistene slutter og tellingen begynner. */}
      <div
        className="section-head"
        style={{ alignItems: 'center', paddingBottom: 6 }}
      >
        <span className="row" style={{ gap: 7, minWidth: 0 }}>
          {Icon && <Icon size={15} color="var(--color-accent)" style={{ flexShrink: 0 }} />}
          <span className="section-title">{title}</span>
          {rows.length > 0 && (
            <span className="tnum text-muted" style={{ fontSize: 12, fontWeight: 600 }}>
              {rows.length}
            </span>
          )}
        </span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onNew}>
          <Plus size={14} /> {newLabel}
        </button>
      </div>
      <div style={{
        borderBottom: '2px solid var(--color-text)',
        margin: '0 var(--space-4) var(--space-3)',
      }} />

      {rows.length === 0 ? (
        <div style={{ padding: '0 var(--space-4) var(--space-4)' }}>
          <div style={{
            border: '1px dashed var(--color-divider-strong)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-4)',
            marginBottom: 'var(--space-3)',
          }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16 }}>
              {emptyTitle}
            </div>
            <p className="text-muted" style={{ fontSize: 13, lineHeight: 1.55, margin: '6px 0 0' }}>
              {empty}
            </p>
          </div>
          <button type="button" className="btn btn-block" onClick={onNew}>
            <Plus size={15} /> {newLabel}
          </button>
        </div>
      ) : (
        <div className="stack" style={{ gap: 8, padding: '0 var(--space-4) var(--space-4)' }}>
          {rows.map((l) => {
            const items = l.items ?? [];
            const total = items.length;
            const picked = items.filter((i) => i.chk).length;
            return (
              <button
                key={l.id}
                type="button"
                className="card card-interactive"
                style={{ textAlign: 'left', cursor: 'pointer', padding: 'var(--space-3)' }}
                onClick={() => onOpen(l)}
              >
                <div className="card-kicker">{l.type ?? 'liste'}</div>
                <div className="card-title" style={{ fontSize: 15 }}>{l.name}</div>
                <div className="card-meta">
                  {l.type === 'telling' ? (
                    <>
                      {/* Tallet er hele poenget med en telleliste — det skal
                          leses før navnet på lista rekker å bli lest. */}
                      <span
                        className="tnum"
                        style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}
                      >
                        {countTotals(items).units}
                      </span> talt
                      {' · '}{total} {total === 1 ? 'linje' : 'linjer'}
                      {l.shared ? ' · Delt' : ''}
                    </>
                  ) : (
                    <>
                      {total} ting
                      {l.shared ? ` · Delt · ${picked}/${total} plukket` : ` · ${progressLabel(items)}`}
                    </>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
