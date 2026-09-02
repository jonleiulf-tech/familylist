import { useState } from 'react';
import { Upload, CheckCircle2, XCircle, Circle } from 'lucide-react';
import { Dialog } from './Dialog.jsx';
import { supabase } from '../lib/supabase.js';
import { validateReceipt, CONFIDENCE } from '../lib/receipt.js';
import { kr } from '../lib/format.js';

const readAsBase64 = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = reject;
  r.readAsDataURL(file);
});

/**
 * Kvitteringsopplasting — én eller MANGE på én gang.
 *
 * Bunkeflyt: velg alle filene, hver leses og valideres for seg, og du får
 * en liste med godkjent/avvist per kvittering. Én knapp skriver alle de
 * godkjente. En avvist kvittering stopper aldri resten, og ingenting
 * lagres før du bekrefter.
 */
export function ReceiptDialog({ onClose, onApply, toast }) {
  const [batch, setBatch] = useState([]);          // [{name, status, result, source, error}]
  const [progress, setProgress] = useState(null);  // «Leser 3 av 30 …»
  const [text, setText] = useState('');
  const [pasteResult, setPasteResult] = useState(null);
  const [busy, setBusy] = useState(false);

  /** Leser én fil til tekst. TXT direkte, PDF/bilde via receipt-ocr. */
  const readFile = async (file) => {
    if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
      return { text: await file.text(), source: 'txt' };
    }
    const dataUrl = await readAsBase64(file);
    const { data, error } = await supabase.functions.invoke('receipt-ocr', {
      body: { file: dataUrl, mime: file.type },
    });
    if (error) {
      // invoke() gir bare «FunctionsHttpError» på annet enn 2xx, og legger
      // svaret i error.context. Uten å lese det ble ALLE serverfeil vist
      // som «Kunne ikke lese filen» — også «OCR er ikke satt opp», som er
      // den ene feilen brukeren faktisk kan gjøre noe med.
      let message = null;
      try { message = (await error.context?.json())?.error ?? null; } catch { /* ikke JSON */ }
      const status = error.context?.status;
      throw new Error(message ?? `Kunne ikke lese filen${status ? ` (feil ${status})` : ''}.`);
    }
    if (data?.error) throw new Error(data.error);
    return { text: data.text, source: data.source === 'pdf' ? 'pdf' : 'ocr' };
  };

  const onFiles = async (e) => {
    const files = [...(e.target.files ?? [])];
    if (!files.length) return;
    setBusy(true);
    const entries = [];
    try {
      // Sekvensielt med vilje: 30 parallelle OCR-kall ville sprengt kvoten
      // og gitt uleselige feil. Én av gangen med teller er forutsigbart.
      for (let i = 0; i < files.length; i += 1) {
        setProgress(`Leser ${i + 1} av ${files.length} — ${files[i].name}`);
        try {
          const { text: raw, source } = await readFile(files[i]);
          const result = validateReceipt(raw);
          entries.push({
            name: files[i].name,
            status: result.valid ? 'ok' : 'rejected',
            included: result.valid,
            result,
            source,
          });
        } catch (err) {
          entries.push({ name: files[i].name, status: 'error', included: false, error: err.message });
        }
      }
      setBatch((cur) => [...cur, ...entries]);
    } finally {
      setProgress(null);
      setBusy(false);
      e.target.value = '';   // samme filer kan velges på nytt
    }
  };

  const toggleInclude = (idx) =>
    setBatch((cur) => cur.map((b, i) => (i === idx ? { ...b, included: !b.included } : b)));

  const approved = batch.filter((b) => b.status === 'ok' && b.included);
  const rejected = batch.filter((b) => b.status !== 'ok');

  const applyBatch = async () => {
    setBusy(true);
    try {
      let lines = 0;
      for (const entry of approved) {
        // eslint-disable-next-line no-await-in-loop
        await onApply(entry.result, CONFIDENCE[entry.source] ?? 0.6);
        lines += entry.result.lines.length;
      }
      toast(`${approved.length} ${approved.length === 1 ? 'kvittering' : 'kvitteringer'} lagt inn — ${lines} varelinjer`);
      onClose();
    } catch (e) {
      toast(e?.message ?? 'Klarte ikke å lagre kvitteringen.');
    } finally {
      setBusy(false);
    }
  };

  // --- Manuell innliming (én kvittering) ------------------------------------
  const analysePaste = () => setPasteResult(validateReceipt(text));
  const applyPaste = async () => {
    setBusy(true);
    try {
      await onApply(pasteResult, 1.0);
      toast(`Kvittering fra ${pasteResult.store.name} lagt inn — ${pasteResult.lines.length} varelinjer`);
      onClose();
    } catch (e) {
      toast(e?.message ?? 'Klarte ikke å lagre kvitteringen.');
    } finally {
      setBusy(false);
    }
  };

  const CheckRow = ({ status, label }) => (
    <div className="row" style={{ gap: 8 }}>
      {status === true && <CheckCircle2 size={14} color="var(--color-success)" aria-label="Bestått" />}
      {status === false && <XCircle size={14} color="var(--color-accent)" aria-label="Feilet" />}
      {status === null && <Circle size={14} color="var(--color-divider-soft)" aria-label="Ikke vurdert" />}
      <span style={{ fontSize: 12, color: status === false ? 'var(--color-accent)' : 'var(--color-text)' }}>
        {label}{status === null ? ' — ingen sum oppgitt' : ''}
      </span>
    </div>
  );

  return (
    <Dialog
      title="Last opp kvitteringer"
      subtitle="Velg gjerne mange på én gang — hver valideres for seg"
      onClose={onClose}
      footer={approved.length > 0 ? (
        <button type="button" className="btn btn-primary btn-block" onClick={applyBatch} disabled={busy}>
          {busy ? 'Lagrer …' : `Lagre kvitteringene (${approved.length} ${approved.length === 1 ? 'kvittering' : 'kvitteringer'})`}
        </button>
      ) : pasteResult?.valid ? (
        <button type="button" className="btn btn-primary btn-block" onClick={applyPaste} disabled={busy}>
          {busy ? 'Lagrer …' : `Lagre kvitteringen (${pasteResult.lines.length} varelinjer)`}
        </button>
      ) : null}
    >
      <label
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          border: '2px dashed var(--color-divider-strong)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-5) var(--space-4)',
          cursor: 'pointer', marginBottom: 'var(--space-3)', textAlign: 'center',
        }}
      >
        <Upload size={20} aria-hidden="true" />
        <span style={{ fontSize: 14, fontWeight: 600 }}>
          {progress ?? 'Velg kvitteringer — så mange du vil'}
        </span>
        <span className="text-muted" style={{ fontSize: 11 }}>PDF, PNG, JPG eller TXT</span>
        <input
          type="file"
          accept=".txt,.pdf,image/*"
          multiple
          onChange={onFiles}
          style={{ display: 'none' }}
          disabled={busy}
        />
      </label>

      {/* ---------- Bunkeresultat ---------- */}
      {batch.length > 0 && (
        <>
          <div className="section-head" style={{ paddingLeft: 0, paddingRight: 0 }}>
            <span className="section-title">Gjennomgang</span>
            <span className="text-muted" style={{ fontSize: 11 }}>
              {approved.length} godkjent · {rejected.length} avvist
            </span>
          </div>
          <div className="stack" style={{ gap: 6 }}>
            {batch.map((entry, idx) => (
              <div
                key={`${entry.name}-${idx}`}
                style={{
                  border: `1px solid ${entry.status === 'ok' ? 'var(--color-divider)' : 'var(--color-accent)'}`,
                  borderRadius: 'var(--radius)',
                  background: 'var(--color-surface)',
                  padding: '10px 12px',
                  opacity: entry.status === 'ok' && !entry.included ? 0.55 : 1,
                }}
              >
                <div className="row" style={{ gap: 8 }}>
                  {entry.status === 'ok' ? (
                    <input
                      type="checkbox"
                      className="checkbox"
                      checked={entry.included}
                      onChange={() => toggleInclude(idx)}
                      aria-label={`Ta med ${entry.name}`}
                    />
                  ) : (
                    <XCircle size={16} color="var(--color-accent)" style={{ flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.name}
                    </div>
                    <div className="item-sub">
                      {entry.status === 'ok' && (
                        <>
                          {entry.result.store.name} · {entry.result.date} ·{' '}
                          {entry.result.lines.length} varelinjer · {kr(entry.result.lineSum)}
                          {entry.source === 'ocr' && ' · OCR (lavere sikkerhet)'}
                        </>
                      )}
                      {entry.status === 'rejected' && (
                        <span style={{ color: 'var(--color-accent)' }}>{entry.result.problems[0]}</span>
                      )}
                      {entry.status === 'error' && (
                        <span style={{ color: 'var(--color-accent)' }}>{entry.error}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-muted" style={{ fontSize: 11, marginTop: 'var(--space-2)' }}>
            Avviste kvitteringer endrer ingenting. Fjern haken på en godkjent
            for å holde den utenfor.
          </p>
        </>
      )}

      {/* ---------- Manuell innliming ---------- */}
      {batch.length === 0 && (
        <>
          <label className="field">
            <span className="field-label">Eller lim inn én kvittering som tekst</span>
            <textarea
              className="input"
              rows={6}
              value={text}
              onChange={(e) => { setText(e.target.value); setPasteResult(null); }}
              placeholder={'COOP EXTRA\nDato: 27.08.2026\nLettmelk 1l   24,90\nBrød          34,90\nSUM           59,80'}
            />
          </label>

          {!pasteResult && (
            <button type="button" className="btn btn-block" onClick={analysePaste} disabled={!text.trim()}>
              Sjekk kvitteringen
            </button>
          )}

          {pasteResult && (
            <div className="card" style={{
              marginTop: 'var(--space-3)',
              borderColor: pasteResult.valid ? 'var(--color-herb-200)' : 'var(--color-accent)',
              background: pasteResult.valid ? 'var(--color-herb-100)' : 'var(--color-surface)',
            }}>
              <div className="row" style={{ gap: 8, marginBottom: 10 }}>
                {pasteResult.valid
                  ? <CheckCircle2 size={18} color="var(--color-success)" />
                  : <XCircle size={18} color="var(--color-accent)" />}
                <strong style={{ fontFamily: 'var(--font-heading)', fontWeight: 800 }}>
                  {pasteResult.valid ? 'Kvitteringen ser riktig ut' : 'Kvitteringen ble avvist'}
                </strong>
              </div>
              <div className="stack" style={{ gap: 5 }}>
                <CheckRow status={pasteResult.checks.store} label="Kjent butikk gjenkjent" />
                <CheckRow status={pasteResult.checks.date} label="Gyldig dato (ikke fram i tid, høyst 12 mnd)" />
                <CheckRow status={pasteResult.checks.lines} label="Minst to varelinjer" />
                <CheckRow status={pasteResult.checks.total} label="Totalsum innenfor ±15 %" />
              </div>
              {pasteResult.valid && (
                <div className="card-meta" style={{ marginTop: 8 }}>
                  {pasteResult.store.name} · {pasteResult.date} · {pasteResult.lines.length} varelinjer · {kr(pasteResult.lineSum)}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </Dialog>
  );
}
