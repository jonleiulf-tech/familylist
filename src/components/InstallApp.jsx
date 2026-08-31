import { useEffect, useState } from 'react';
import { Download, Share, MoreVertical, X, Check } from 'lucide-react';
import { Dialog } from './Dialog.jsx';

/**
 * «Få Plukkelisten som app» — installasjon av PWA-en.
 *
 * Chrome/Edge (Android og PC) gir oss `beforeinstallprompt`, og da kan vi
 * åpne nettleserens EGEN installasjonsdialog med ett trykk. Safari på
 * iPhone har ingen slik hendelse — der må brukeren gjøre det via
 * Del-menyen, så vi viser oppskriften i stedet. Er appen alt installert
 * (kjører i standalone), sier vi ingenting.
 *
 * Hendelsen fyres av tidlig i oppstarten — main.jsx fanger den på window
 * og varsler via «pl-installable», så vi ikke går glipp av den.
 */

const isIos = () => {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    // iPad på iOS 13+ later som den er en Mac — maxTouchPoints avslører den.
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

const detectPlatform = () => {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  if (isIos()) return 'ios';
  if (/android/i.test(ua)) return /samsungbrowser/i.test(ua) ? 'samsung' : 'android';
  return 'desktop';
};

const standalone = () => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
};

/** Delt tilstand: kan vi installere, og hvordan? */
export function useInstallApp() {
  const [installed, setInstalled] = useState(standalone);
  const [canPrompt, setCanPrompt] = useState(() => Boolean(window.__plInstallEvent));

  useEffect(() => {
    const onReady = () => setCanPrompt(Boolean(window.__plInstallEvent));
    const onInstalled = () => { setInstalled(true); setCanPrompt(false); };
    window.addEventListener('pl-installable', onReady);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('pl-installable', onReady);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  /** Åpne nettleserens egen installasjonsdialog. true = brukeren sa ja. */
  const promptInstall = async () => {
    const e = window.__plInstallEvent;
    if (!e) return false;
    e.prompt();
    const { outcome } = await e.userChoice;
    window.__plInstallEvent = null;
    setCanPrompt(false);
    return outcome === 'accepted';
  };

  return { installed, canPrompt, promptInstall, platform: detectPlatform() };
}

const STEPS = {
  android: {
    title: 'Android (Chrome)',
    icon: MoreVertical,
    steps: [
      'Trykk på de tre prikkene ⋮ øverst til høyre i Chrome',
      'Velg «Legg til på startskjerm» — eller «Installer app»',
      'Bekreft, og ikonet legger seg på startskjermen din',
    ],
  },
  samsung: {
    title: 'Android (Samsung Internet)',
    icon: MoreVertical,
    steps: [
      'Trykk på menyen ☰ nederst til høyre',
      'Velg «Legg til side på» → «Startskjerm»',
      'Bekreft, og ikonet legger seg på startskjermen din',
    ],
  },
  ios: {
    title: 'iPhone og iPad (Safari)',
    icon: Share,
    steps: [
      'Trykk Del-ikonet — firkanten med pil opp',
      'Bla ned og velg «Legg til på Hjem-skjerm»',
      'Trykk «Legg til» øverst til høyre',
    ],
    note: 'Gjør det i Safari. Chrome på iPhone har samme valg under Del-menyen.',
  },
  desktop: {
    title: 'PC og Mac (Chrome eller Edge)',
    icon: Download,
    steps: [
      'Se etter installer-ikonet helt til høyre i adresselinjen — en skjerm med pil ned',
      'Eller: menyen ⋮ → «Installer Plukkelisten …»',
      'Appen får sitt eget vindu og eget ikon',
    ],
  },
};

const PERKS = [
  'Eget ikon på startskjermen',
  'Fullskjerm uten adresselinje',
  'Åpner raskere',
  'Handlelisten kan leses uten dekning',
];

/** Full oppskrift — vises fra banneret og fra profilmenyen. */
export function InstallDialog({ onClose }) {
  const { canPrompt, promptInstall, platform } = useInstallApp();
  const mine = STEPS[platform] ?? STEPS.desktop;
  const others = Object.entries(STEPS).filter(([k]) => k !== platform);
  const [showAll, setShowAll] = useState(false);
  const Icon = mine.icon;

  return (
    <Dialog
      title="Få Plukkelisten som app"
      subtitle="Samme app, men rett på startskjermen — uten nedlasting fra noen butikk"
      onClose={onClose}
      footer={canPrompt ? (
        <button type="button" className="btn btn-primary btn-block" onClick={promptInstall}>
          <Download size={16} /> Installer appen nå
        </button>
      ) : null}
    >
      <div style={{
        background: 'var(--color-herb-100)', border: '1px solid var(--color-herb-200)',
        borderRadius: 'var(--radius)', padding: '12px 14px', marginBottom: 'var(--space-4)',
      }}>
        {PERKS.map((p) => (
          <div key={p} className="row" style={{ gap: 8, padding: '2px 0' }}>
            <Check size={13} color="var(--color-herb-700)" aria-hidden="true" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: 'var(--color-herb-700)' }}>{p}</span>
          </div>
        ))}
      </div>

      <div className="card-kicker" style={{ marginBottom: 6 }}>Slik gjør du på din enhet</div>
      <div style={{
        background: 'var(--color-surface)', border: '1px solid var(--color-divider)',
        borderRadius: 'var(--radius)', padding: '14px 16px',
      }}>
        <div className="row" style={{ gap: 8, marginBottom: 8 }}>
          <Icon size={15} color="var(--color-accent)" aria-hidden="true" />
          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 16 }}>
            {mine.title}
          </span>
        </div>
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.65 }}>
          {mine.steps.map((s) => <li key={s} style={{ marginBottom: 4 }}>{s}</li>)}
        </ol>
        {mine.note && (
          <p className="text-muted" style={{ fontSize: 11, margin: '8px 0 0' }}>{mine.note}</p>
        )}
      </div>

      <button
        type="button"
        className="btn btn-ghost btn-sm"
        style={{ color: 'var(--color-accent)', fontWeight: 600, paddingLeft: 0, marginTop: 'var(--space-3)' }}
        onClick={() => setShowAll((v) => !v)}
      >
        {showAll ? 'Skjul andre enheter' : 'Vis for andre enheter'}
      </button>

      {showAll && others.map(([key, s]) => (
        <div key={key} style={{ marginTop: 'var(--space-3)' }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
            {s.title}
          </div>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.6, color: 'var(--color-text-muted)' }}>
            {s.steps.map((t) => <li key={t}>{t}</li>)}
          </ol>
        </div>
      ))}

      <p className="text-muted" style={{ fontSize: 11, marginTop: 'var(--space-4)', marginBottom: 0 }}>
        Plukkelisten er en nettapp — den installeres rett fra nettleseren, tar
        nesten ingen plass, og oppdaterer seg selv.
      </p>
    </Dialog>
  );
}

/**
 * Slankt, avvisbart kort på Hjem. Skjules når appen alt er installert,
 * eller når brukeren har avvist det.
 */
export function InstallBanner() {
  const { installed, canPrompt, promptInstall, platform } = useInstallApp();
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem('pl.install.dismissed') === '1'; } catch { return false; }
  });
  const [showHow, setShowHow] = useState(false);

  if (installed || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem('pl.install.dismissed', '1'); } catch { /* ignorer */ }
  };

  return (
    <>
      <div style={{ padding: 'var(--space-4) var(--space-4) 0' }}>
        <div style={{
          background: 'var(--color-surface)', border: '1px solid var(--color-divider)',
          borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)',
          padding: '14px 16px',
        }}>
          <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
            <span
              aria-hidden="true"
              style={{
                width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                background: 'var(--color-accent-100)', display: 'grid', placeItems: 'center',
              }}
            >
              <Download size={19} color="var(--color-accent)" />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 17, letterSpacing: '-0.005em' }}>
                Legg Plukkelisten på startskjermen
              </div>
              <p className="text-muted" style={{ fontSize: 13, margin: '3px 0 0', lineHeight: 1.45 }}>
                {platform === 'ios'
                  ? 'Del-ikonet → «Legg til på Hjem-skjerm». Da åpner den som en vanlig app.'
                  : 'Ett trykk, og du får eget ikon og fullskjerm — som en vanlig app.'}
              </p>
            </div>
            <button
              type="button"
              className="btn btn-icon btn-sm"
              onClick={dismiss}
              aria-label="Skjul dette"
              style={{ flexShrink: 0 }}
            >
              <X size={14} />
            </button>
          </div>
          <div className="row" style={{ gap: 8, marginTop: 12 }}>
            {canPrompt ? (
              <button type="button" className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={promptInstall}>
                <Download size={14} /> Installer appen
              </button>
            ) : (
              <button type="button" className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => setShowHow(true)}>
                Vis meg hvordan
              </button>
            )}
            {canPrompt && (
              <button type="button" className="btn btn-sm" onClick={() => setShowHow(true)}>
                Les mer
              </button>
            )}
          </div>
        </div>
      </div>
      {showHow && <InstallDialog onClose={() => setShowHow(false)} />}
    </>
  );
}
