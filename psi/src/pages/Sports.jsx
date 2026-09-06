import { Link } from '../lib/router.jsx';
import { useLang, useStrings, useT } from '../lib/i18n.jsx';
import { useContent } from '../lib/content.jsx';
import { PageHead, SportCard } from '../components/Bits.jsx';
import { fyll, tallord } from '../lib/format.js';

export default function Sports() {
  const { activeSports, pausedSports } = useContent();
  const s = useStrings();
  const t = useT();
  const lang = useLang();
  // Overskriften teller gruppene selv. «Fem idretter» sto som fast tekst,
  // og ville blitt stående når den sjette kom til.
  const tittel = activeSports.length === 1 ? s.sports.titleOne : fyll(s.sports.title, { n: tallord(activeSports.length, lang) });
  return (
    <>
      <PageHead eyebrow={s.nav.sports} title={tittel} intro={s.sports.intro} />
      <section className="section">
        <div className="wrap">
          <div className="grid grid--sports">
            {activeSports.map((sp) => <SportCard key={sp.slug} sport={sp} />)}
          </div>
        </div>
      </section>
      {pausedSports.length > 0 && (
        /* Gruppene som er lagt på is står nederst, tydelig atskilt. De er
           ikke noe man melder seg på, men historikken er verdt å finne –
           og noen skal kunne ta dem opp igjen. */
        <section className="section section--dark" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <div className="section-head">
              <div>
                <h2 style={{ fontSize: 'var(--fs-xl)' }}>{s.paused.title}</h2>
                <p className="muted">{s.paused.intro}</p>
              </div>
            </div>
            <div className="grid grid--sports">
              {pausedSports.map((sp) => (
                <article className="card card--dark" key={sp.slug}>
                  <div className="card__meta"><span className="pill">{s.paused.badge}</span></div>
                  <h3><Link to={`/idretter/${sp.slug}`}>{sp.icon} {sp.name}</Link></h3>
                  <p className="muted">{t(sp.shortDescription)}</p>
                  <Link to={`/idretter/${sp.slug}`} className="more">{s.paused.restart} →</Link>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
