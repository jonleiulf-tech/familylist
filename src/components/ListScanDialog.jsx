import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, ScanLine } from 'lucide-react';
import { Dialog } from './Dialog.jsx';
import { supabase } from '../lib/supabase.js';

/**
 * «Skann en handleliste»: foto av en håndskrevet lapp, et notat eller en
 * utskrift → Claude leser ut varene → radene går til Handel-fanens vanlige
 * «Leste jeg riktig?»-gjennomgang. Samme motor og mønster som kundeavis-
 * skannet, men uten priser og butikk.
 */
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

export function ListScanDialog({ onRows, onClose }) {
  const [step, setStep] = useState('pick');   // pick | camera | busy
  const [error, setError] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [camReady, setCamReady] = useState(false);

  const [progress, setProgress] = useState(0);
  const expectedMsRef = useRef(14000);
  useEffect(() => {
    if (step !== 'busy') return undefined;
    const t0 = Date.now();
    setProgress(0);
    const timer = setInterval(() => {
      const t = Date.now() - t0;
      setProgress(Math.min(95, Math.round(95 * (1 - Math.exp(-t / (expectedMsRef.current * 0.55))))));
    }, 200);
    return () => clearInterval(timer);
  }, [step]);

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

  const analyze = async (blob, mediaType = 'image/jpeg') => {
    expectedMsRef.current = mediaType === 'application/pdf' ? 30000 : 14000;
    setStep('busy');
    setError(null);
    const { data, error: err } = await supabase.functions.invoke('read-offer-photo', {
      body: blob,
      headers: { 'x-media-type': mediaType, 'x-scan-mode': 'handleliste' },
    });
    if (err || data?.error) {
      let message = data?.error ?? err?.message ?? 'Noe gikk galt.';
      try {
        const parsed = await err?.context?.json?.();
        if (parsed?.error) message = parsed.error;
      } catch { /* behold message */ }
      if (err?.name === 'FunctionsFetchError') {
        message = 'Fikk ikke kontakt med skanneren — er read-offer-photo deployet med siste versjon?';
      }
      setError(message);
      setStep('pick');
      return;
    }
    const rows = data?.rows ?? [];
    if (!rows.length) {
      setError('Fant ingen lesbare varer i bildet — prøv et skarpere bilde av hele lappen.');
      setStep('pick');
      return;
    }
    onRows(rows);
    onClose();
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
      if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name ?? '')) {
        if (file.size > 9 * 1024 * 1024) { setError('PDF-en er for stor (over 9 MB).'); return; }
        await analyze(file, 'application/pdf');
        return;
      }
      await analyze(await toJpegBlob(file));
    } catch (e) {
      setError(`Kunne ikke lese bildet: ${e?.message ?? e}`);
    }
  };

  return (
    <Dialog
      title="Skann en handleliste"
      subtitle="Håndskrevet lapp, notat eller utskrift — du godkjenner alt før noe legges til"
      onClose={() => { stopCamera(); onClose(); }}
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
            Funker med håndskrift, notater fra PC-en og utskrifter. Varene
            kobles mot varedatabasen, og du retter og godkjenner før noe
            legges på listen.
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
              <ScanLine size={15} /> {camReady ? 'Knips lappen' : 'Starter kamera …'}
            </button>
            <button type="button" className="btn" onClick={() => { stopCamera(); setStep('pick'); }}>
              Avbryt
            </button>
          </div>
        </>
      )}

      {step === 'busy' && (
        <div>
          <div className="row-between" style={{ marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>
              {progress < 12 ? 'Laster opp …' : progress < 75 ? 'Claude leser lappen …' : 'Nesten ferdig …'}
            </span>
            <span className="text-muted" style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
              {progress} %
            </span>
          </div>
          <div style={{
            height: 8, borderRadius: 999, background: 'var(--color-bg-sunken)',
            border: '1px solid var(--color-divider)', overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', width: `${progress}%`, borderRadius: 999,
              background: 'var(--color-accent)', transition: 'width .25s ease',
            }} />
          </div>
        </div>
      )}
    </Dialog>
  );
}
