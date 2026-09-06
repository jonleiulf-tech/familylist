import { useEffect, useState } from 'react';
import { useStrings } from '../lib/i18n.jsx';
import { useContent } from '../lib/content.jsx';
import { PageHead, Steps } from '../components/Bits.jsx';
import { abonnerPåInstall, erInstallert, installer, oppskrift, plattform, nettleser, sortertEtter } from '../lib/pwa.js';

/* /app: hvordan man legger PSI på hjemskjermen.

   Alle oppskriftene står på siden, men den som passer maskinen man
   sitter på løftes øverst og merkes. Vi skjuler ikke de andre: folk
   leser gjerne dette på PC-en for så å gjøre det på telefonen. */
export default function AppInstall() {
  const { site } = useContent();
  const s = useStrings();
  const [kanSpørre, setKanSpørre] = useState(false);
  const [status, setStatus] = useState(null);
  const [installert, setInstallert] = useState(() => erInstallert());

  useEffect(() => abonnerPåInstall((e) => setKanSpørre(Boolean(e))), []);
  useEffect(() => {
    const h = () => setInstallert(true);
    window.addEventListener('appinstalled', h);
    return () => window.removeEventListener('appinstalled', h);
  }, []);

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const berøring = typeof navigator !== 'undefined' ? navigator.maxTouchPoints || 0 : 0;
  const min = oppskrift(plattform(ua, berøring), nettleser(ua));
  const rekkefølge = sortertEtter(min);

  async function start() {
    setStatus('spør');
    const svar = await installer();
    setStatus(svar === 'installert' ? 'ferdig' : null);
  }

  return (
    <>
      <PageHead eyebrow={s.app.nav} title={s.app.title} intro={s.app.intro} />

      <section className="section">
        <div className="wrap split">
          <div className="stack">
            <h2 style={{ fontSize: 'var(--fs-xl)' }}>{s.app.what}</h2>
            <p className="lead">{s.app.whatBody}</p>
            <h2 style={{ fontSize: 'var(--fs-xl)', marginTop: 'var(--sp-5)' }}>{s.app.why}</h2>
            <Steps steps={s.app.perks} />
          </div>
          <aside className="aside">
            <div className="card">
              <div className="eyebrow">{s.app.installNow}</div>
              {installert || status === 'ferdig' ? (
                <p className="muted">{status === 'ferdig' ? s.app.installed : s.app.alreadyOpen}</p>
              ) : kanSpørre ? (
                <>
                  {/* Bare Chrome, Edge og Samsung Internet gir oss denne
                      knappen. De andre får oppskriften i stedet. */}
                  <p className="muted">{status === 'spør' ? s.app.installing : s.app.intro}</p>
                  <button type="button" className="btn btn--primary btn--block" onClick={start} disabled={status === 'spør'}>
                    {s.app.installNow} →
                  </button>
                </>
              ) : (
                <p className="muted">{s.app.manual}</p>
              )}
              <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>{site.domain.replace(/^https?:\/\//, '')}</p>
            </div>
          </aside>
        </div>
      </section>

      <section className="section section--dark" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <h2 style={{ marginBottom: 'var(--sp-5)' }}>{s.app.howTitle}</h2>
          <div className="grid">
            {rekkefølge.map((k) => {
              const [tittel, trinn] = s.app.steps[k];
              const mitt = k === min;
              return (
                <article className={`card${mitt ? '' : ' card--dark'}`} key={k}>
                  {mitt && <div className="eyebrow">{s.app.yours}</div>}
                  <h3>{tittel}</h3>
                  <ol className="oppskrift">
                    {trinn.map((t, i) => <li key={i}>{t}</li>)}
                  </ol>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}
