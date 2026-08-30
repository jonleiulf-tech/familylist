import { useState } from 'react';
import { Copy, Check, UserPlus, Plus, Download, Receipt, LogIn, X, Crown, Wallet, Settings, ScanLine } from 'lucide-react';
import { Dialog } from '../components/Dialog.jsx';
import { CustomListDialog, NewListDialog } from '../components/CustomListDialog.jsx';
import { ImportDialog } from '../components/ImportDialog.jsx';
import { ListScanDialog } from '../components/ListScanDialog.jsx';
import { ReviewDialog } from '../components/ReviewDialog.jsx';
import { resolveCatalogItem, guessUnit } from '../lib/catalog.js';
import { ReceiptDialog } from '../components/ReceiptDialog.jsx';
import { Settlement } from '../components/Settlement.jsx';
import { ListSettingsDialog } from '../components/ListSettingsDialog.jsx';
import { KIND_LABEL } from '../components/ListSwitcher.jsx';
import { UserAvatar } from '../lib/avatars.jsx';
import { parseListText, progressLabel } from '../lib/customLists.js';

/**
 * Lister + familiedeling.
 * «Inviter» lager en engangslenke som er gyldig i 7 dager.
 */
export function Lists({
  household, members, lists, catalog, normRules, defaultStore, importQueue,
  shoppingItems, isOwner, onRemoveMember, onLeaveList, onUpdateList,
  onCreateInvite, onSendInvite, onRedeemInvite, onSignOut, onImport, onQueue, onQueueResolve, onReceipt, toast,
}) {
  const [openList, setOpenList] = useState(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanReview, setScanReview] = useState(null);   // rader fra skannet liste
  const [receipting, setReceipting] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState(null);
  const [joinBusy, setJoinBusy] = useState(false);
  const [settling, setSettling] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteStatus, setInviteStatus] = useState(null);
  const [sending, setSending] = useState(false);
  const [editingList, setEditingList] = useState(false);
  const [invite, setInvite] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [problem, setProblem] = useState(null);

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
            className="btn btn-ghost btn-sm"
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
                  initials={m.initials ?? m.display_name.slice(0, 2).toUpperCase()}
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
                    className="btn btn-ghost btn-sm"
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
              <LogIn size={14} /> Bli med i en annen husholdning
            </button>
          ) : (
            <div style={{ marginTop: 'var(--space-3)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--color-divider-soft)' }}>
              <label className="field">
                <span className="field-label">Invitasjonskode</span>
                <input
                  className="input"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="f.eks. a1b2c3d4e5f6a7b8"
                  style={{ fontFamily: 'ui-monospace, monospace' }}
                />
              </label>

              <div
                className="card"
                style={{ borderColor: 'var(--color-accent)', marginBottom: 'var(--space-3)' }}
              >
                <div className="card-body" style={{ marginTop: 0, fontSize: 12 }}>
                  Du flyttes ut av <strong>{household?.name}</strong> og inn i den
                  andre husholdningen.
                  {members.length <= 1 && (
                    <> Siden du er eneste medlem her, slettes denne husholdningen
                    og alt som ligger i den — handleliste, middagsplan og egne lister.</>
                  )}
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
                      toast('Du er nå i den andre husholdningen');
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
      <div className="section-head"><span className="section-title">Kvitteringer og import</span></div>
      <div className="stack" style={{ padding: '0 var(--space-4) var(--space-4)' }}>
        <button type="button" className="btn btn-block" onClick={() => setReceipting(true)}>
          <Receipt size={16} /> Last opp kvittering
        </button>
        <button type="button" className="btn btn-block" onClick={() => setImporting(true)}>
          <Download size={16} /> Importer fra Google Keep
        </button>
        <button type="button" className="btn btn-block" onClick={() => setScanning(true)}>
          <ScanLine size={16} /> Skann en handleliste (håndskrevet eller utskrift)
        </button>
      </div>
      <p className="text-muted" style={{ padding: '0 var(--space-4) var(--space-4)', fontSize: 11 }}>
        Kvitteringer lærer systemet hva dere kjøper og hva det koster.
        Ingenting lagres før kvitteringen er godkjent.
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
      <div className="section-head">
        <span className="section-title">Sjekklister</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCreating(true)}>
          <Plus size={14} /> Ny liste
        </button>
      </div>

      {lists.lists.length === 0 && (
        <p className="text-muted" style={{ padding: '0 var(--space-4) var(--space-3)', fontSize: 13 }}>
          Ingen sjekklister ennå. Pakking, sportsutstyr og verktøy hører hjemme her —
          de kobles ikke mot varedatabasen.
        </p>
      )}

      {lists.lists.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
          padding: '0 var(--space-4) var(--space-4)',
        }}>
          {lists.lists.map((l) => {
            const total = (l.items ?? []).length;
            const picked = (l.items ?? []).filter((i) => i.chk).length;
            return (
              <button
                key={l.id}
                type="button"
                className="card"
                style={{ textAlign: 'left', cursor: 'pointer', padding: 'var(--space-3)' }}
                onClick={() => setOpenList(l)}
              >
                <div className="card-kicker">{l.type ?? 'liste'}</div>
                <div className="card-title" style={{ fontSize: 15 }}>{l.name}</div>
                <div className="card-meta">
                  {total} {total === 1 ? 'ting' : 'ting'}
                  {l.shared ? ` · Delt · ${picked}/${total} plukket` : ` · ${progressLabel(l.items ?? [])}`}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <hr className="divider" style={{ marginTop: 'var(--space-4)' }} />
      <div className="stack" style={{ padding: 'var(--space-4)' }}>
        {lists.lists.length > 0 && (
          <button
            type="button"
            className="btn btn-block"
            onClick={async () => {
              const alone = members.length <= 1;
              const msg = alone
                ? `Du er eneste medlem. «${household?.name}» og alt innholdet slettes. Er du sikker?`
                : `Forlate «${household?.name}»? Du mister tilgangen, men listen består for de andre.`;
              // eslint-disable-next-line no-alert
              if (!window.confirm(msg)) return;
              const err = await onLeaveList(household.id);
              toast(err ?? `Du forlot «${household?.name}»`);
            }}
          >
            Forlat denne listen
          </button>
        )}
        <button type="button" className="btn btn-block" onClick={onSignOut}>Logg ut</button>
      </div>

      {openList && (
        <CustomListDialog
          // Les listen fra state, ikke fra det som var åpent da dialogen ble
          // åpnet — ellers vises ikke partnerens avhukinger mens den står oppe.
          list={lists.lists.find((l) => l.id === openList.id) ?? openList}
          onClose={() => setOpenList(null)}
          onUpdate={lists.update}
          onCopy={async (l) => {
            const copy = await lists.duplicate(l);
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
          onClose={() => setCreating(false)}
          onCreate={async ({ name, type, paste }) => {
            const created = await lists.create({ name, type, items: parseListText(paste) });
            setCreating(false);
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

      {receipting && (
        <ReceiptDialog
          onClose={() => setReceipting(false)}
          onApply={onReceipt}
          toast={toast}
        />
      )}

      {/* Skann en handleliste: lapp/notat → gjennomgang → handlelisten */}
      {scanning && (
        <ListScanDialog
          onClose={() => setScanning(false)}
          onRows={(rows) => setScanReview(rows.map((r) => {
            const { name, item } = resolveCatalogItem(r.name, catalog, normRules);
            const qty = r.qty ?? 1;
            return {
              name,
              qty,
              unit: r.unit || guessUnit(name, item?.major_category, qty),
              category: item?.major_category || 'Annet',
              store: item?.primary_store || defaultStore,
              price: item?.avg_price ?? null,
              price_source: item?.avg_price ? 'receipt' : null,
            };
          }))}
        />
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
                  setInviteStatus({ type: 'error', text: 'E-postutsending er ikke satt opp ennå — del lenken under i stedet.' });
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
                className="input" type="email" autoFocus
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
              color: inviteStatus.type === 'ok' ? 'var(--color-success)' : 'var(--color-accent)',
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
          subtitle="Engangslenke — gyldig i 7 dager"
          onClose={() => setInvite(null)}
        >
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
              style={{ fontFamily: 'ui-monospace, monospace', letterSpacing: '.06em' }}
            />
            <span className="text-muted" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
              Virker ikke lenken, kan hun skrive inn koden under «Har du en
              invitasjonskode?» på innloggingsskjermen.
            </span>
          </label>

          <button type="button" className="btn btn-primary btn-block" onClick={copy}>
            {copied ? <><Check size={16} /> Kopiert</> : <><Copy size={16} /> Kopier lenke</>}
          </button>

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
