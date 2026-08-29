import { useState } from 'react';
import { Copy, Check, UserPlus, Plus, Download, Receipt } from 'lucide-react';
import { Dialog } from '../components/Dialog.jsx';
import { CustomListDialog, NewListDialog } from '../components/CustomListDialog.jsx';
import { ImportDialog } from '../components/ImportDialog.jsx';
import { ReceiptDialog } from '../components/ReceiptDialog.jsx';
import { parseListText, progressLabel } from '../lib/customLists.js';

/**
 * Lister + familiedeling.
 * «Inviter» lager en engangslenke som er gyldig i 7 dager.
 */
export function Lists({
  household, members, lists, catalog, normRules, defaultStore, importQueue,
  onCreateInvite, onSignOut, onImport, onQueue, onQueueResolve, onReceipt, toast,
}) {
  const [openList, setOpenList] = useState(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [receipting, setReceipting] = useState(false);
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
      <div className="section-head"><span className="section-title">Familiedeling</span></div>
      <div style={{ padding: '0 var(--space-4) var(--space-4)' }}>
        <div className="card">
          <div className="card-kicker">{household?.name}</div>
          <div className="card-title">
            {members.length} {members.length === 1 ? 'medlem' : 'medlemmer'}
          </div>
          <div className="card-body">
            {members.map((m) => m.display_name).join(', ')}
          </div>
          <div className="card-meta">
            Endringer synkes i sanntid — den andre ser avhukingene dine med én gang.
          </div>
          <button
            type="button"
            className="btn btn-primary btn-block"
            style={{ marginTop: 'var(--space-3)' }}
            onClick={makeInvite}
            disabled={busy}
          >
            <UserPlus size={16} /> {busy ? 'Lager lenke …' : 'Inviter til husholdningen'}
          </button>

          {problem && (
            <p style={{ fontSize: 12, marginTop: 'var(--space-2)', color: 'var(--color-accent)' }}>
              {problem}
            </p>
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
        <span className="section-title">Egne lister</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCreating(true)}>
          <Plus size={14} /> Ny liste
        </button>
      </div>

      {lists.lists.length === 0 && (
        <p className="text-muted" style={{ padding: '0 var(--space-4) var(--space-3)', fontSize: 13 }}>
          Ingen egne lister ennå. Pakkelister, sportsutstyr og verktøy hører hjemme her —
          de kobles ikke mot varedatabasen.
        </p>
      )}

      {lists.lists.map((l) => (
        <div key={l.id} className="item-row">
          <button type="button" className="item-mid" onClick={() => setOpenList(l)}>
            <div className="item-name">{l.name}</div>
            <div className="item-sub">
              {progressLabel(l.items ?? [])}
              {l.type ? ` · ${l.type}` : ''}
              {l.shared ? ' · delt' : ''}
            </div>
          </button>
          <button type="button" className="btn btn-sm" onClick={() => setOpenList(l)}>Åpne</button>
        </div>
      ))}

      <hr className="divider" style={{ marginTop: 'var(--space-4)' }} />
      <div style={{ padding: 'var(--space-4)' }}>
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

      {receipting && (
        <ReceiptDialog
          onClose={() => setReceipting(false)}
          onApply={onReceipt}
          toast={toast}
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

      {invite && (
        <Dialog
          title="Invitasjonslenke"
          subtitle="Engangslenke — gyldig i 7 dager"
          onClose={() => setInvite(null)}
        >
          <p style={{ fontSize: 13, lineHeight: 1.5, marginTop: 0 }}>
            Send denne til den du vil dele husholdningen med. Når hen åpner lenken
            og logger inn, havner hen i samme husholdning som deg — og ser
            handlelisten, middagsplanen og listene deres.
          </p>

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
            Trenger du flere, lager du bare en ny.
          </p>
        </Dialog>
      )}
    </div>
  );
}
