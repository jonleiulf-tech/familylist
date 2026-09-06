import { useEffect, useState } from 'react';
import { useStrings } from '../lib/i18n.jsx';

/* Spond-CTA for én gruppe.
   - Med spondInviteUrl: knapp «Bli med i Spond» som primær handling, QR
     generert fra lenken (vises på brede skjermer og på /stand), og koden
     som reserve med kopier-knapp.
   - Uten lenke: koden er hovedinnholdet, med kort forklaring.
   Ingen Spond-passord, tokens eller medlemsdata. */
export function SpondCta({ sport, size = 'md', showQr = true, showHow = true }) {
  const s = useStrings();
  const hasUrl = Boolean(sport.spondInviteUrl);
  return (
    <div className="spond">
      {hasUrl && (
        <a
          className={`btn btn--primary btn--block${size === 'xl' ? ' btn--xl' : ''}`}
          href={sport.spondInviteUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {s.spond.join} →
        </a>
      )}
      <SpondCode code={sport.spondCode} label={hasUrl ? s.spond.backupCode : s.spond.code} />
      {showHow && <p className="spond__how">{s.spond.how}</p>}
      {hasUrl && showQr && <Qr url={sport.spondInviteUrl} label={`${s.spond.qrHint}: ${sport.name}`} />}
    </div>
  );
}

export function SpondCode({ code, label }) {
  const s = useStrings();
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Uten HTTPS finnes ikke clipboard-API-et. Da får man koden i en
      // rute man kan merke selv, i stedet for en knapp som ikke gjør noe.
      window.prompt(s.spond.copy, code);
    }
  }
  return (
    <div className="spond__code">
      <div>
        <div className="spond__label">{label}</div>
        <div className="spond__value">{code}</div>
      </div>
      <button type="button" className="btn btn--ghost btn--sm spond__copy" onClick={copy} aria-live="polite">
        {copied ? s.spond.copied : s.spond.copy}
      </button>
    </div>
  );
}

/* QR-kode generert i nettleseren fra URL-en. Biblioteket lastes først når
   en QR faktisk skal vises, så vanlige mobilsider slipper vekten.
   `alltid` for /stand, der QR-en er hele poenget også på mobil. Ellers
   følger den CSS-en: skjult under 900 px, og da lastes ingenting. Har
   man en QR på skjermen og roterer, kommer den når plassen gjør det. */
const QR_BREDDE = '(min-width: 900px)';

export function Qr({ url, label, size = 148, alltid = false }) {
  const [src, setSrc] = useState(null);
  const [plass, setPlass] = useState(() => alltid || typeof window === 'undefined' || !window.matchMedia || window.matchMedia(QR_BREDDE).matches);
  useEffect(() => {
    if (alltid || typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia(QR_BREDDE);
    const h = () => setPlass(mq.matches);
    h();
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, [alltid]);
  useEffect(() => {
    if (!plass) return undefined;
    let alive = true;
    import('qrcode').then((QR) =>
      QR.toDataURL(url, { margin: 1, width: size * 2, color: { dark: '#0d0d0c', light: '#ffffff' } }),
    ).then((data) => alive && setSrc(data)).catch(() => {});
    return () => { alive = false; };
  }, [url, size, plass]);
  if (!src) return null;
  return (
    <div className="spond__qr">
      <img src={src} width={size} height={size} alt={`QR: ${url}`} />
      <span>{label}</span>
    </div>
  );
}
