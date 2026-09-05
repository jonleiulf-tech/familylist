import { Link } from '../lib/router.jsx';
import { useLang, useStrings, useT } from '../lib/i18n.jsx';
import { useContent } from '../lib/content.jsx';
import { fmtDate } from '../lib/format.js';
import { PageHead, Prose } from '../components/Bits.jsx';
import NotFound from './NotFound.jsx';

/* /nyheter og /nyheter/:slug. Innholdet kommer fra databasen (admin). */
export default function News({ slug }) {
  const { news, findNews, findSport } = useContent();
  const s = useStrings();
  const t = useT();
  const lang = useLang();

  if (slug) {
    const n = findNews(slug);
    if (!n) return <NotFound />;
    const sport = n.sport_slug ? findSport(n.sport_slug) : null;
    return (
      <>
        <PageHead crumbs={[['/nyheter', s.nav.news]]} eyebrow={`${fmtDate(n.published_at.slice(0, 10), lang)}${sport ? ` · ${sport.name}` : ''}`} title={t(n.title)} intro={t(n.lead)} />
        <section className="section">
          <div className="wrap split">
            <article className="stack">
              <NewsImage n={n} />
              <Prose text={t(n.body)} />
              {n.link_url && <a href={n.link_url} className="btn btn--primary" target="_blank" rel="noopener noreferrer">{s.news.readMore} →</a>}
            </article>
            <aside className="aside">
              {sport && (
                <div className="card">
                  <div className="eyebrow">{sport.icon} {sport.name}</div>
                  <p className="muted">{t(sport.shortDescription)}</p>
                  <Link to={`/idretter/${sport.slug}`} className="btn btn--ghost">{s.sports.readMore}</Link>
                </div>
              )}
              <Link to="/nyheter" className="more">← {s.news.back}</Link>
            </aside>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <PageHead eyebrow={s.nav.news} title={s.news.title} intro={s.news.intro} />
      <section className="section">
        <div className="wrap">
          {news.length === 0 ? <p className="muted lead">{s.news.empty}</p> : (
            <div className="grid grid--sports">
              {news.map((n) => <NewsCard key={n.id} n={n} />)}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

export function NewsCard({ n }) {
  const { findSport } = useContent();
  const s = useStrings();
  const t = useT();
  const lang = useLang();
  const sport = n.sport_slug ? findSport(n.sport_slug) : null;
  return (
    <article className="card news-card">
      <NewsImage n={n} card />
      <div className="card__meta">
        <span>{fmtDate(n.published_at.slice(0, 10), lang)}</span>
        <span className="pill pill--teal">{sport ? `${sport.icon} ${t(sport.shortName)}` : s.news.wholePsi}</span>
      </div>
      <h3><Link to={`/nyheter/${n.slug}`} className="news-card__link">{t(n.title)}</Link></h3>
      {t(n.lead) && <p className="muted">{t(n.lead)}</p>}
      <Link to={`/nyheter/${n.slug}`} className="more">{s.news.readMore} →</Link>
    </article>
  );
}

function NewsImage({ n, card = false }) {
  const { media } = useContent();
  const t = useT();
  const m = n.image_id ? media.find((x) => x.id === n.image_id) : null;
  if (!m?.web_url) return null;
  return (
    <figure className={`photo${card ? '' : ' photo--hero'}`} style={{ margin: 0 }}>
      <img src={m.web_url} alt={t(m.caption) || t(n.title)} loading={card ? 'lazy' : 'eager'} decoding="async" />
    </figure>
  );
}
