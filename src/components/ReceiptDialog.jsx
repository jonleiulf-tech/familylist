import { useState } from 'react';
import { Upload, CheckCircle2, XCircle } from 'lucide-react';
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
 * Kvitteringsopplasting.
 *
 * Rekkefølgen er poenget: filen leses, valideres, og først når brukeren har
 * sett HVA som ble funnet og bekreftet det, skrives noe til databasen.
 * En avvist kvittering endrer ingenting.
 */
export function ReceiptDialog({ onClose, onApply, toast }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [source, setSource] = useState('txt');
  const [busy, setBusy] = useState(false);
  const [readError, setReadError] = useState(null);

  const analyse = (raw, src) => {
    setSource(src);
    setResult(validateReceipt(raw));
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setReadError(null);
    try {
      if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
        const raw = await file.text();
        setText(raw);
        analyse(raw, 'txt');
        return;
      }

      const dataUrl = await readAsBase64(file);
      const { data, error } = await supabase.functions.invoke('receipt-ocr', {
        body: { file: dataUrl, mime: file.type },
      });

      if (error || data?.error) {
        setReadError(
          data?.error
          ?? 'Kunne ikke lese filen. Lim inn kvitteringsteksten manuelt i stedet.',
        );
        return;
      }
      setText(data.text);
      analyse(data.text, data.source === 'pdf' ? 'pdf' : 'ocr');
    } catch {
      setReadError('Kunne ikke lese filen. Lim inn kvitteringsteksten manuelt i stedet.');
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    setBusy(true);
    try {
      await onApply(result, CONFIDENCE[source] ?? 0.6);
      toast(`Kvittering fra ${result.store.name} lagt inn — ${result.lines.length} varelinjer`);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="Last opp kvittering"
      subtitle={result ? undefined : 'PDF, bilde eller tekstfil'}
      onClose={onClose}
      footer={result?.valid ? (
        <button type="button" className="btn btn-primary btn-block" onClick={apply} disabled={busy}>
          {busy ? 'Lagrer …' : `Oppdater priser og frekvens (${result.lines.length})`}
        </button>
      ) : null}
    >
      <label className="btn btn-block" style={{ cursor: 'pointer', marginBottom: 'var(--space-3)' }}>
        <Upload size={16} /> {busy ? 'Leser …' : 'Velg fil'}
        <input
          type="file"
          accept=".txt,.pdf,image/*"
          onChange={onFile}
          style={{ display: 'none' }}
          disabled={busy}
        />
      </label>

      {readError && (
        <p style={{ fontSize: 12, color: 'var(--color-accent)' }}>{readError}</p>
      )}

      <label className="field">
        <span className="field-label">Eller lim inn kvitteringsteksten</span>
        <textarea
          className="input"
          rows={6}
          value={text}
          onChange={(e) => { setText(e.target.value); setResult(null); }}
          placeholder={'COOP EXTRA\nDato: 27.08.2026\nLettmelk 1l   24,90\nBrød          34,90\nSUM           59,80'}
        />
      </label>

      {!result && (
        <button
          type="button"
          className="btn btn-block"
          onClick={() => analyse(text, 'txt')}
          disabled={!text.trim()}
        >
          Sjekk kvitteringen
        </button>
      )}

      {result && (
        <div
          className="card"
          style={{
            marginTop: 'var(--space-3)',
            borderColor: result.valid ? 'var(--color-divider)' : 'var(--color-accent)',
          }}
        >
          <div className="row" style={{ gap: 8, marginBottom: 8 }}>
            {result.valid
              ? <CheckCircle2 size={18} color="var(--color-success)" />
              : <XCircle size={18} color="var(--color-accent)" />}
            <strong style={{ fontFamily: 'var(--font-heading)', fontWeight: 800 }}>
              {result.valid ? 'Kvitteringen ser riktig ut' : 'Kvitteringen ble avvist'}
            </strong>
          </div>

          {result.valid ? (
            <>
              <table className="table">
                <tbody>
                  <tr><td>Butikk</td><td>{result.store.name}</td></tr>
                  <tr><td>Dato</td><td>{result.date}</td></tr>
                  <tr><td>Varelinjer</td><td>{result.lines.length}</td></tr>
                  <tr><td>Linjesum</td><td>{kr(result.lineSum)}</td></tr>
                  {result.total !== null && <tr><td>Oppgitt sum</td><td>{kr(result.total)}</td></tr>}
                  <tr>
                    <td>Kilde</td>
                    <td>{source === 'ocr' ? 'OCR (lavere sikkerhet)' : source.toUpperCase()}</td>
                  </tr>
                </tbody>
              </table>
              <div className="card-meta">
                {result.lines.slice(0, 6).map((l) => l.name).join(', ')}
                {result.lines.length > 6 ? ` … +${result.lines.length - 6}` : ''}
              </div>
            </>
          ) : (
            <>
              <ul style={{ fontSize: 13, margin: '0 0 8px', paddingLeft: 18 }}>
                {result.problems.map((p) => <li key={p} style={{ marginBottom: 4 }}>{p}</li>)}
              </ul>
              <div className="card-meta">
                Ingenting er endret. Rett opp teksten over og sjekk på nytt.
              </div>
            </>
          )}
        </div>
      )}
    </Dialog>
  );
}
