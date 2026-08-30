import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, ScanLine, X } from 'lucide-react';
import { Dialog } from './Dialog.jsx';
import { supabase } from '../lib/supabase.js';
import { resolveCatalogItem } from '../lib/catalog.js';

/**
 * «Skann en kundeavis»: foto av en avis-side (papir eller skjermbilde) →
 * Claude leser ut varer og priser → redigerbar gjennomgang → samme løype
 * som manuell import. Ingenting lagres uten at brukeren har sett og
 * godkjent radene.
 *
 * Kameraet kjører INNE i appen (getUserMedia, bakkameraet) — å hoppe ut
 * til kamera-appen mister bildet på mange Android-mobiler. Galleri-valget
 * er tryggere (ingen app-bytting for skjermbilder) og finnes ved siden av.
 */

/** Fil/videoramme → nedskalert JPEG-blob (lang side maks 1568 px). */
async function toJpegBlob(source, maxSide = 1568) {
  let img = source;
  if (typeof File !== 'undefined' && source instanceof Blob) {
    try {
      img = await createImageBitmap(source, { imageOrientation: 'from-image' });
    } catch {
      const url = URL.createObjectURL(source);
      try {
        img = await new Promise((res, rej) => {
          const el = new Image();
          el.onload = () => res(el);
          el.onerror = () => rej(new Error('nettleseren kunne ikke vise bildeformatet'));
          el.src = url;
        });
      } finally {
        URL.revokeObjectURL(url);
      }
    }
  }
  const w = img.videoWidth ?? img.width;
  const h = img.videoHeight ?? img.height;
  if (!w || !h) throw new Error('bildet var tomt');
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
  if (!blob) throw new Error('kunne ikke lage jpeg av bildet');
  return blob;
}

export function FlyerScanDialog({ stores, catalog, normRules, defaultStore, onImport, onClose, toast }) {
  const [step, setStep] = useState('pick');      // pick | camera | busy | review
  const [rows, setRows] = useState([]);          // [{checked, name, price, original_price}]
  const [store, setStore] = useState(
    stores.find((s) => s.name === defaultStore)?.code ?? stores[0]?.code ?? 'COOP_EXTRA',
  );
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [camReady, setCamReady] = useState(false);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };
  useEffect(() => stopCamera, []);

  const openCamera = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Nettleseren har ikke kameratilgang — bruk «Velg bilde» i stedet.');
      return;
    }
    setStep('camera');
    setCamReady(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }, audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (e) {
      setStep('pick');
      setError(e?.name === 'NotAllowedError'
        ? 'Du må gi nettleseren lov til å bruke kameraet.'
        : `Fikk ikke åpnet kameraet: ${e?.message ?? e}`);
    }
  };

  const [busyLabel, setBusyLabel] = useState('');

  const analyze = async (blob, mediaType = 'image/jpeg') => {
    setStep('busy');
    setBusyLabel(mediaType === 'application/pdf'
      ? 'Leser hele avisen … en PDF med mange sider kan ta opptil et minutt.'
      : 'Leser avisen … dette tar gjerne 10–20 sekunder.');
    setError(null);
    // Fila sendes RÅTT (ikke base64-i-JSON) — halve størrelsen, og store
    // PDF-er kommer trygt gjennom porten.
    const { data, error: err } = await supabase.functions.invoke('read-offer-photo', {
      body: blob,
      headers: { 'x-media-type': mediaType },
    });
    if (err || data?.error) {
      let message = data?.error ?? err?.message ?? 'Noe gikk galt.';
      try {
        const parsed = await err?.context?.json?.();
        if (parsed?.error) message = parsed.error;
      } catch { /* behold message */ }
      if (err?.name === 'FunctionsFetchError') {
        message = 'Fikk ikke kontakt med skanneren — er read-offer-photo '
          + 'deployet med siste versjon? Prøv også en mindre fil.';
      }
      setError(message);
      setStep('pick');
      return;
    }
    const found = (data?.rows ?? []).map((r) => ({ ...r, checked: true }));
    if (!found.length) {
      setError('Fant ingen tydelige varer og priser i bildet — prøv et skarpere bilde av én side.');
      setStep('pick');
      return;
    }
    setRows(found);
    setStep('review');
  };

  const snap = async () => {
    const v = videoRef.current;
    if (!v?.videoWidth) return;
    const blob = await toJpegBlob(v);
    stopCamera();
    await analyze(blob);
  };

  const pickFile = async (file) => {
    if (!file) return;
    try {
      // PDF (nedlastet kundeavis): sendes som den er — Claude leser alle
      // sidene i ett jafs. Bilder skaleres ned først.
      if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name ?? '')) {
        if (file.size > 9 * 1024 * 1024) {
          setError('PDF-en er for stor (over 9 MB) — prøv en mindre utgave, eller ta skjermbilder av sidene.');
          return;
        }
        await analyze(file, 'application/pdf');
        return;
      }
      await analyze(await toJpegBlob(file));
    } catch (e) {
      setError(`Kunne ikke lese bildet: ${e?.message ?? e}`);
    }
  };

  const patchRow = (i, patch) => setRows((cur) => cur.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const selected = rows.filter((r) => r.checked && r.name.trim() && Number(String(r.price).replace(',', '.')) > 0);

  const doImport = async () => {
    setBusy(true);
    try {
      const storeName = stores.find((s) => s.code === store)?.name ?? store;
      const payload = selected.map((r) => {
        const { name: matched, item } = resolveCatalogItem(r.name.trim(), catalog, normRules);
        return {
          product_name: r.name.trim(),
          match_name: item ? matched : r.name.trim(),
          category: item?.major_category ?? null,
          price: Number(String(r.price).replace(',', '.')),
          original_price: r.original_price ?? null,
          store_code: store,
          store_name: storeName,
          source: 'Kundeavis-skann',
          source_type: 'flyer_scan',
          valid_to: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10),
          is_sample: false,
        };
      });
      await onImport(payload);
      toast(`Importerte ${payload.length} tilbud fra kundeavisen`);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="Skann en kundeavis"
      subtitle="Ta bilde av en avis-side — varene leses ut og du godkjenner før lagring"
      onClose={() => { stopCamera(); onClose(); }}
      footer={step === 'review' ? (
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={busy || !selected.length}
          onClick={doImport}
        >
          {busy ? 'Lagrer …' : `Importer ${selected.length} ${selected.length === 1 ? 'tilbud' : 'tilbud'}`}
        </button>
      ) : undefined}
    >
      {error && <p style={{ fontSize: 13, color: 'var(--color-accent)', marginTop: 0 }}>{error}</p>}

      {step === 'pick' && (
        <div className="stack" style={{ gap: 8 }}>
          <button type="button" className="btn btn-primary btn-block" onClick={openCamera}>
            <Camera size={15} /> Åpne kameraet
          </button>
          <label className="btn btn-block" style={{ cursor: 'pointer', justifyContent: 'center' }}>
            <ImagePlus size={15} /> Velg bilde, skjermbilde eller PDF
            <input
              type="file"
              accept="image/*,application/pdf"
              style={{ display: 'none' }}
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
          </label>
          <p className="text-muted" style={{ fontSize: 11, margin: '4px 0 0' }}>
            Best resultat: last ned kundeavisen som PDF fra butikkens app eller
            nettside — da leses ALLE sidene i ett jafs. Foto og skjermbilder
            funker også (én side om gangen). Du får se og rette alt før noe lagres.
          </p>
        </div>
      )}

      {step === 'camera' && (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            onLoadedMetadata={() => setCamReady(true)}
            style={{
              width: '100%', borderRadius: 'var(--radius)', display: 'block',
              background: 'var(--color-bg-sunken)', minHeight: 240,
            }}
          />
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={snap} disabled={!camReady}>
              <ScanLine size={15} /> {camReady ? 'Knips siden' : 'Starter kamera …'}
            </button>
            <button type="button" className="btn" onClick={() => { stopCamera(); setStep('pick'); }}>
              Avbryt
            </button>
          </div>
        </>
      )}

      {step === 'busy' && (
        <p className="text-muted" style={{ fontSize: 13 }}>{busyLabel}</p>
      )}

      {step === 'review' && (
        <>
          <label className="field" style={{ marginBottom: 'var(--space-3)' }}>
            <span className="field-label">Butikk</span>
            <select className="input" value={store} onChange={(e) => setStore(e.target.value)}>
              {stores.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
            </select>
          </label>
          <div className="card-kicker" style={{ marginBottom: 4 }}>
            Fant {rows.length} varer — rett det som ble feil, fjern haken på resten
          </div>
          <div className="stack" style={{ gap: 6 }}>
            {rows.map((r, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <div key={i} className="row" style={{ gap: 6, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={r.checked}
                  onChange={(e) => patchRow(i, { checked: e.target.checked })}
                  aria-label={r.name}
                />
                <input
                  className="input"
                  style={{ flex: 1, minWidth: 0 }}
                  value={r.name}
                  onChange={(e) => patchRow(i, { name: e.target.value })}
                  aria-label="Varenavn"
                />
                <input
                  className="input"
                  style={{ width: 72, flex: 'none', textAlign: 'right' }}
                  inputMode="decimal"
                  value={r.price}
                  onChange={(e) => patchRow(i, { price: e.target.value })}
                  aria-label="Pris"
                />
                <button
                  type="button"
                  className="btn btn-icon btn-sm"
                  style={{ flex: 'none' }}
                  aria-label={`Fjern ${r.name}`}
                  onClick={() => setRows((cur) => cur.filter((_, idx) => idx !== i))}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
          <p className="text-muted" style={{ fontSize: 11, marginTop: 'var(--space-3)', marginBottom: 0 }}>
            KI-lesing kan bomme — sjekk prisene mot avisen før du importerer.
            Tilbudene gjelder ut uken og kobles automatisk mot varedatabasen.
          </p>
        </>
      )}
    </Dialog>
  );
}
