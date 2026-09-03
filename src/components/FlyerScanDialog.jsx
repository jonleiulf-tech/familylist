import { useEffect, useRef, useState } from 'react';
import { Camera, Files, ScanLine, X } from 'lucide-react';
import { Dialog } from './Dialog.jsx';
import { supabase } from '../lib/supabase.js';
import { resolveCatalogItem } from '../lib/catalog.js';
import {
  buildQueue, queueSummary, reviewRows, importable, expectedMs, MAX_FILES,
} from '../lib/flyerQueue.js';
import { filterFlyerRows } from '../lib/flyerRows.js';

import { trimmed } from '../lib/text.js';
/**
 * «Skann en kundeavis»: foto av en avis-side (papir eller skjermbilde) →
 * Bildetolkningen leser ut varer og priser → redigerbar gjennomgang → samme løype
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

const STATUS = {
  venter: { label: 'Venter', tone: 'tag-outline' },
  leser: { label: 'Leser …', tone: 'tag-honey' },
  klar: { label: 'Klar', tone: 'tag-herb' },
  feil: { label: 'Gikk ikke', tone: 'tag-accent' },
};

export function FlyerScanDialog({ stores, catalog, normRules, defaultStore, onImport, onClose, toast }) {
  const [step, setStep] = useState('pick');      // pick | camera | queue | review
  const [queue, setQueue] = useState([]);        // se flyerQueue.js
  const [rows, setRows] = useState([]);          // gjennomgangen, på tvers av filer
  const [rejected, setRejected] = useState([]);  // filer som ikke ble med
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

  // Lukkes dialogen midt i en kø, skal løkken gi seg — ellers skriver den
  // til en komponent som ikke finnes lenger.
  const cancelRef = useRef(false);
  useEffect(() => {
    // MÅ nullstilles her. React kjører setup → cleanup → setup på nytt i
    // utviklingsmodus, og uten dette sto flagget permanent på «avbrutt» —
    // køen startet aldri, uten en eneste feilmelding.
    cancelRef.current = false;
    return () => { cancelRef.current = true; stopCamera(); };
  }, []);

  const openCamera = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Nettleseren har ikke kameratilgang — bruk «Velg filer» i stedet.');
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

  /** Én fil gjennom tolkningen. Kaster ved feil — løkken tar seg av resten. */
  const analyzeFile = async (item) => {
    const blob = item.isPdf ? item.file : await toJpegBlob(item.file);
    const mediaType = item.isPdf ? 'application/pdf' : 'image/jpeg';
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
        message = 'Fikk ikke kontakt med skanneren — prøv en mindre fil.';
      }
      throw new Error(message);
    }
    const found = data?.rows ?? [];
    if (!found.length) throw new Error('Fant ingen tydelige varer og priser.');
    // En avisside er full av store bokstaver som ikke er varer.
    // «TAKKNEMLIG TORSDAG» over en pris på 39 blir ellers en vare til 39.
    const { rows: clean, dropped } = filterFlyerRows(found);
    return { rows: clean.map((r) => ({ ...r, checked: true })), dropped };
  };

  // --- Køen kjøres én fil om gangen -----------------------------------------
  // Med vilje ikke i parallell: hvert kall er ett tungt bildetolkningskall,
  // og sju samtidige ville både kostet mer og risikert å bli avvist.
  const runningRef = useRef(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const activeStartRef = useRef(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (step !== 'queue' || runningRef.current || !queue.length) return;
    runningRef.current = true;
    const items = queue;                 // filene endres ikke underveis
    (async () => {
      for (let i = 0; i < items.length; i += 1) {
        if (cancelRef.current) return;
        setActiveIdx(i);
        activeStartRef.current = Date.now();
        setQueue((q) => q.map((it, idx) => (idx === i ? { ...it, status: 'leser' } : it)));
        try {
          const got = await analyzeFile(items[i]);
          if (cancelRef.current) return;
          setQueue((q) => q.map((it, idx) => (
            idx === i ? { ...it, status: 'klar', rows: got.rows, dropped: got.dropped } : it)));
        } catch (e) {
          if (cancelRef.current) return;
          setQueue((q) => q.map((it, idx) => (
            idx === i ? { ...it, status: 'feil', error: e?.message ?? String(e) } : it)));
        }
      }
      setActiveIdx(-1);
      runningRef.current = false;
    })();
    // Køen settes én gang per omgang; lengden er nok til å starte løkken.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, queue.length]);

  // Fremdrift: tolkningen svarer i ett stykke, så prosenten drives av tiden
  // mot forventet varighet (asymptotisk mot 95 %) og fullfører når svaret lander.
  useEffect(() => {
    if (activeIdx < 0) return undefined;
    const timer = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(timer);
  }, [activeIdx]);

  const summary = queueSummary(queue);
  const activeItem = activeIdx >= 0 ? queue[activeIdx] : null;
  const activeShare = activeItem
    ? Math.min(0.95, 1 - Math.exp(-(Date.now() - activeStartRef.current) / (expectedMs(activeItem) * 0.55)))
    : 0;
  const progress = queue.length
    ? Math.round(100 * Math.min(1, (summary.done + activeShare) / queue.length))
    : 0;

  const startQueue = (files) => {
    const built = buildQueue(files, { stores, fallbackStore: store });
    if (!built.items.length) {
      setError(built.rejected[0]
        ? `Fikk ikke brukt filen: ${built.rejected[0].reason}.`
        : 'Ingen filer valgt.');
      return;
    }
    setError(null);
    setRejected(built.rejected);
    setQueue(built.items);
    setStep('queue');
  };

  const snap = async () => {
    const v = videoRef.current;
    if (!v?.videoWidth) return;
    const blob = await toJpegBlob(v);
    stopCamera();
    startQueue([new File([blob], 'kamera.jpg', { type: 'image/jpeg' })]);
  };

  const setItemStore = (id, code) =>
    setQueue((q) => q.map((it) => (it.id === id ? { ...it, store: code } : it)));

  const goReview = () => {
    setRows(reviewRows(queue));
    setStep('review');
  };

  const patchRow = (i, patch) => setRows((cur) => cur.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  /** Butikk endret i gjennomgangen gjelder alle radene fra samme avis. */
  const setGroupStore = (fileId, code) =>
    setRows((cur) => cur.map((r) => (r.fileId === fileId ? { ...r, store: code } : r)));

  const selected = importable(rows);
  const storeName = (code) => stores.find((s) => s.code === code)?.name ?? code;

  const doImport = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = selected.map((r) => {
        const { name: matched, item } = resolveCatalogItem(trimmed(r.name), catalog, normRules);
        return {
          product_name: trimmed(r.name),
          match_name: item ? matched : trimmed(r.name),
          category: item?.major_category ?? null,
          price: Number(String(r.price).replace(',', '.')),
          original_price: r.original_price ?? null,
          store_code: r.store,
          store_name: storeName(r.store),
          source: 'Kundeavis-skann',
          source_type: 'flyer_scan',
          valid_to: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10),
          is_sample: false,
        };
      });
      await onImport(payload);
      const butikker = new Set(payload.map((p) => p.store_code)).size;
      toast(`Importerte ${payload.length} tilbud fra ${butikker} ${butikker === 1 ? 'butikk' : 'butikker'} `
        + '— delt med alle Plukkelisten-brukere! 📰');
      onClose();
    } catch (e) {
      // Gjennomgangen står som den er, så arbeidet ikke er tapt.
      setError(`Kunne ikke lagre tilbudene: ${e?.message ?? e}. Radene står her — prøv igjen.`);
    } finally {
      setBusy(false);
    }
  };

  // Radene grupperes per avis i gjennomgangen, slik at butikkvalget står
  // over de varene det faktisk gjelder.
  const groups = [];
  for (const r of rows) {
    const last = groups[groups.length - 1];
    if (last && last.fileId === r.fileId) last.rows.push(r);
    else groups.push({ fileId: r.fileId, fileName: r.fileName, store: r.store, rows: [r] });
  }

  return (
    <Dialog
      title="Skann kundeaviser"
      subtitle={step === 'queue'
        ? `Leser ${queue.length} ${queue.length === 1 ? 'avis' : 'aviser'}`
        : 'Velg flere aviser om gangen — varene leses ut og du godkjenner før lagring'}
      onClose={() => { stopCamera(); onClose(); }}
      footer={step === 'review' ? (
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={busy || !selected.length}
          onClick={doImport}
        >
          {busy ? 'Lagrer …' : `Importer ${selected.length} tilbud`}
        </button>
      ) : step === 'queue' && summary.finished ? (
        summary.rows ? (
          <button type="button" className="btn btn-primary btn-block" onClick={goReview}>
            Gå gjennom {summary.rows} varer fra {summary.files} {summary.files === 1 ? 'avis' : 'aviser'}
          </button>
        ) : (
          // Feilet alt, var dette en blindvei med en grå knapp og ingen vei ut.
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={() => { setQueue([]); setRejected([]); runningRef.current = false; setStep('pick'); }}
          >
            Ingen varer ble funnet — prøv på nytt
          </button>
        )
      ) : undefined}
    >
      {error && <p style={{ fontSize: 13, color: 'var(--color-accent)', marginTop: 0 }}>{error}</p>}

      {step === 'pick' && (
        <div className="stack" style={{ gap: 8 }}>
          <label className="btn btn-primary btn-block" style={{ cursor: 'pointer', justifyContent: 'center' }}>
            <Files size={15} /> Velg aviser — flere om gangen
            <input
              type="file"
              accept="image/*,application/pdf"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => { startQueue(e.target.files); e.target.value = ''; }}
            />
          </label>
          <button type="button" className="btn btn-block" onClick={openCamera}>
            <Camera size={15} /> Åpne kameraet
          </button>
          <label className="field" style={{ marginTop: 'var(--space-2)' }}>
            <span className="field-label">Butikk for aviser vi ikke kjenner igjen</span>
            <select className="input" value={store} onChange={(e) => setStore(e.target.value)}>
              {stores.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
            </select>
          </label>
          <p className="text-muted" style={{ fontSize: 11, margin: '4px 0 0' }}>
            Hold inne Ctrl (eller Cmd) for å velge flere filer på én gang — opptil
            {' '}{MAX_FILES}. Heter fila «kiwi-uke36.pdf», settes butikken automatisk.
            Aviser som PDF leses helt, med alle sidene; foto og skjermbilder tar
            én side om gangen. Du får se og rette alt før noe lagres.
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

      {step === 'queue' && (
        <div className="stack" style={{ gap: 10 }}>
          <div>
            <div className="row-between" style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                {summary.finished
                  ? `Ferdig — ${summary.rows} varer fra ${summary.files} av ${summary.total}`
                  : `Leser avis ${Math.min(summary.done + 1, summary.total)} av ${summary.total}`}
              </span>
              <span className="text-muted tnum" style={{ fontSize: 12 }}>{progress} %</span>
            </div>
            <div style={{
              height: 10, borderRadius: 'var(--radius-full)', background: 'var(--color-bg-sunken)',
              border: '1px solid var(--color-divider)', overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', width: `${progress}%`, borderRadius: 'var(--radius-full)',
                background: 'linear-gradient(90deg, var(--color-honey), var(--color-accent))',
                transition: 'width .25s ease',
              }} />
            </div>
            {!summary.finished && (
              <p className="text-muted" style={{ fontSize: 11, marginTop: 8, marginBottom: 0 }}>
                En hel PDF-avis tar gjerne rundt ett minutt. Du kan sette butikk
                på de andre mens denne leses — la vinduet stå åpent.
              </p>
            )}
          </div>

          {queue.map((it) => (
            <div key={it.id} className="card" style={{ padding: 'var(--space-3)' }}>
              <div className="row-between" style={{ gap: 8, alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, wordBreak: 'break-word' }}>{it.name}</div>
                  <div className="text-muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                    {it.status === 'klar' ? `${it.rows.length} varer funnet`
                      : it.status === 'feil' ? it.error
                        : it.isPdf ? 'PDF — alle sidene' : 'Bilde — én side'}
                  </div>
                  {it.status === 'klar' && it.dropped?.length > 0 && (
                    // Aldri stille: luker vi bort noe, skal det stå hva og
                    // hvorfor, slik at en feilaktig luking kan oppdages.
                    <details style={{ marginTop: 4 }}>
                      <summary className="text-muted" style={{ fontSize: 11, cursor: 'pointer' }}>
                        {it.dropped.length} {it.dropped.length === 1 ? 'rad' : 'rader'} luket bort
                      </summary>
                      <div className="text-muted" style={{ fontSize: 10.5, lineHeight: 1.5, marginTop: 3 }}>
                        {it.dropped.map((d) => `${d.name} (${d.reason})`).join(' · ')}
                      </div>
                    </details>
                  )}
                </div>
                <span className={`tag ${STATUS[it.status].tone}`} style={{ flexShrink: 0 }}>
                  {STATUS[it.status].label}
                </span>
              </div>
              {it.status !== 'feil' && (
                <select
                  className="input"
                  style={{ marginTop: 8 }}
                  value={it.store ?? ''}
                  onChange={(e) => setItemStore(it.id, e.target.value)}
                  aria-label={`Butikk for ${it.name}`}
                >
                  {stores.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
                </select>
              )}
            </div>
          ))}

          {rejected.length > 0 && (
            <p className="text-muted" style={{ fontSize: 11.5, margin: 0 }}>
              Ikke med: {rejected.map((r) => `${r.name} (${r.reason})`).join(', ')}.
            </p>
          )}
        </div>
      )}

      {step === 'review' && (
        <>
          <div className="card-kicker" style={{ marginBottom: 4 }}>
            {rows.length} varer fra {groups.length} {groups.length === 1 ? 'avis' : 'aviser'} —
            rett det som ble feil, fjern haken på resten
          </div>

          {groups.map((g) => (
            <div key={g.fileId} style={{ marginBottom: 'var(--space-4)' }}>
              <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 6 }}>
                <select
                  className="input"
                  style={{ flex: 1, minWidth: 0 }}
                  value={g.store ?? ''}
                  onChange={(e) => setGroupStore(g.fileId, e.target.value)}
                  aria-label={`Butikk for varene fra ${g.fileName}`}
                >
                  {stores.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
                </select>
                <span className="text-muted tnum" style={{ fontSize: 11.5, flexShrink: 0 }}>
                  {g.rows.length} varer
                </span>
              </div>
              <div className="text-muted" style={{ fontSize: 11, marginBottom: 6, wordBreak: 'break-word' }}>
                fra {g.fileName}
              </div>
              <div className="stack" style={{ gap: 6 }}>
                {g.rows.map((r) => {
                  const i = rows.indexOf(r);
                  return (
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
                        className="input tnum"
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
                  );
                })}
              </div>
            </div>
          ))}

          <p className="text-muted" style={{ fontSize: 11, marginTop: 'var(--space-3)', marginBottom: 0 }}>
            KI-lesing kan bomme — sjekk prisene mot avisen før du importerer.
            Tilbudene deles med ALLE Plukkelisten-brukere og gjelder ut uken —
            og du får Plukkepoeng for bidraget (én gang per butikk per uke). 📰
          </p>
        </>
      )}
    </Dialog>
  );
}
