import { Link } from '../lib/router.jsx';
import { useStrings, useT } from '../lib/i18n.jsx';
import { useContent } from '../lib/content.jsx';
import { PageHead, Prose, Photo, SportSchedule, UpNext, Gallery } from '../components/Bits.jsx';
import { NewsCard } from './News.jsx';
import { SpondCta } from '../components/Spond.jsx';
import NotFound from './NotFound.jsx';

/* Én mal for alle idrettssidene. Alt innhold kommer fra src/data/psi.js. */
export default function SportPage({ slug }) {
  const { findSport, site, newsFor, galleryFor } = useContent();
  const s = useStrings();
  const t = useT();
  const sport = findSport(slug);
  if (!sport) return <NotFound />;
  const news = newsFor(slug).filter((n) => n.sport_slug === slug).slice(0, 6);
  const photos = galleryFor(slug);

  return (
    <>
      <PageHead crumbs={[['/idretter', s.nav.sports]]} eyebrow={t(sport.audience)} title={`${sport.icon} ${sport.name}`} intro={t(sport.shortDescription)}>
        {/* Spond tidlig på mobil: knappen ligger i sidehodet. */}
        <div style={{ marginTop: 'var(--sp-5)', maxWidth: 420 }}>
          <SpondCta sport={sport} showQr={false} showHow={false} />
        </div>
      </PageHead>

      <section className="section">
        <div className="wrap split">
          <div className="stack">
            <Photo sport={sport} hero />
            <Prose text={t(sport.longDescription)} />
            <h2 style={{ fontSize: 'var(--fs-xl)', marginTop: 'var(--sp-5)' }}>{s.sports.schedule}</h2>
            <SportSchedule sport={sport} />
            {/* Det som faktisk skjer: økter fra grunnskjemaet, alt som er
                hentet fra Spond, og felles PSI-arrangementer. */}
            <UpNext slug={slug} inline includeTrainings days={28} max={10} />
            <h2 style={{ fontSize: 'var(--fs-xl)', marginTop: 'var(--sp-5)' }}>{s.sports.practical}</h2>
            <dl className="kv">
              <dt>{s.sports.forWhom}</dt><dd>{t(sport.audience)}</dd>
              <dt>{s.sports.venue}</dt><dd>{t(sport.venue)}</dd>
              {sport.equipmentNote && <><dt>{s.sports.equipment}</dt><dd>{t(sport.equipmentNote)}</dd></>}
              {sport.capacityNote && <><dt>{s.sports.capacity}</dt><dd>{t(sport.capacityNote)} {s.spond.unregister}</dd></>}
            </dl>
          </div>
          <aside className="aside">
            <div className="card">
              <div className="eyebrow">Spond</div>
              <SpondCta sport={sport} />
            </div>
            <div className="card">
              <div className="eyebrow">{s.nav.contact}</div>
              <dl className="kv">
                <dt>{s.sports.leader}</dt><dd>{sport.leader}</dd>
                <dt>{s.sports.email}</dt><dd><a href={`mailto:${sport.email}`}>{sport.email}</a></dd>
              </dl>
            </div>
            <div className="card">
              <div className="eyebrow">{s.membership.title}</div>
              <p className="muted">{s.membership.body}</p>
              <a href={site.membershipUrl} className="btn btn--ghost" target="_blank" rel="noopener noreferrer">{s.membership.cta}</a>
            </div>
            <Link to="/idretter" className="more">← {s.sports.all}</Link>
          </aside>
        </div>
      </section>
      {news.length > 0 && (
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <div className="section-head">
              <div><div className="eyebrow">{s.nav.news}</div><h2 style={{ fontSize: 'var(--fs-xl)' }}>{s.news.forGroup} {sport.name}</h2></div>
            </div>
            <div className="grid grid--sports">{news.map((n) => <NewsCard key={n.id} n={n} />)}</div>
            {/* Først flere fra denne gruppa, så hele arkivet. */}
            <div className="news-more news-more--row">
              <Link to={`/nyheter?gruppe=${slug}`} className="btn btn--dark">{s.news.moreFrom} {t(sport.shortName)}</Link>
              <Link to="/nyheter" className="btn btn--ghost">{s.news.all}</Link>
            </div>
          </div>
        </section>
      )}
      {photos.length > 0 && (
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <div className="eyebrow">{s.gallery.from} {sport.name}</div>
            <Gallery items={photos} />
          </div>
        </section>
      )}
    </>
  );
}
