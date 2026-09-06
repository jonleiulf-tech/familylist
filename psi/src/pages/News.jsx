import { useEffect, useState } from 'react';
import { Link, useRouter } from '../lib/router.jsx';
import { useLang, useStrings, useT } from '../lib/i18n.jsx';
import { useContent, focusOf } from '../lib/content.jsx';
import { fmtDate, excerpt, dagFra } from '../lib/format.js';
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
        <PageHead crumbs={[['/nyheter', s.nav.news]]} eyebrow={`${fmtDate(dagFra(n.published_at), lang)}${sport ? ` · ${sport.name}` : ''}`} title={t(n.title)} intro={t(n.lead)} />
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

  return <NewsList news={news} />;
}

/* Hele arkivet, en side om gangen. Lista kan bli lang etter noen
   semestre, så den starter med de nyeste og utvides på forespørsel. */
const PER_SIDE = 12;

function NewsList({ news }) {
  const { activeSports } = useContent();
  const s = useStrings();
  const t = useT();
  const { path, search, navigate } = useRouter();
  const fraLenke = (q) => new URLSearchParams(q).get('gruppe') || 'alle';
  const [gruppe, setGruppe] = useState(() => fraLenke(search));
  const [antall, setAntall] = useState(PER_SIDE);

  // «Flere nyheter fra Fotball» peker hit med ?gruppe=fotball. Er man
  // allerede på siden, byttes filteret uten at komponenten monteres på nytt.
  useEffect(() => { setGruppe(fraLenke(search)); setAntall(PER_SIDE); }, [path, search]);

  const brukte = new Set(news.map((n) => n.sport_slug));
  const filtre = [
    ['alle', s.news.everything],
    ...(brukte.has(null) || brukte.has(undefined) ? [['psi', s.news.wholePsi]] : []),
    ...activeSports.filter((sp) => brukte.has(sp.slug)).map((sp) => [sp.slug, `${sp.icon} ${t(sp.shortName)}`]),
  ];
  const valgt = news.filter((n) => (gruppe === 'alle' ? true : gruppe === 'psi' ? !n.sport_slug : n.sport_slug === gruppe));
  const synlige = valgt.slice(0, antall);
  const velg = (k) => {
    setGruppe(k);
    setAntall(PER_SIDE);
    // Gjennom ruteren, ikke utenom: skriver vi rett til history, blir
    // ruterens egen search foreldet, og neste klikk i menyen tror den
    // allerede står der den skal.
    navigate(k === 'alle' ? '/nyheter' : `/nyheter?gruppe=${k}`, { replace: true });
  };

  return (
    <>
      <PageHead eyebrow={s.nav.news} title={s.news.title} intro={s.news.intro} />
      <section className="section">
        <div className="wrap">
          {news.length === 0 ? <p className="muted lead">{s.news.empty}</p> : (
            <>
              {filtre.length > 2 && (
                <div className="chips" role="group" aria-label={s.news.filter}>
                  {filtre.map(([k, l]) => (
                    <button key={k} type="button" className={`chip${gruppe === k ? ' is-active' : ''}`} aria-pressed={gruppe === k} onClick={() => velg(k)}>{l}</button>
                  ))}
                </div>
              )}
              {/* Uten denne hopper nivåene fra h1 rett til h3, og
                  skjermlesere mister ett trinn i strukturen. */}
              <h2 className="sr-only">{gruppe === 'alle' ? s.news.all : filtre.find(([k]) => k === gruppe)?.[1] || s.news.all}</h2>
              <div className="grid grid--sports">
                {synlige.map((n) => <NewsCard key={n.id} n={n} />)}
              </div>
              <div className="news-more">
                <p className="muted">{s.news.showing} {synlige.length} {s.news.of} {valgt.length}</p>
                {valgt.length > antall && (
                  <button type="button" className="btn btn--dark" onClick={() => setAntall((n) => n + PER_SIDE)}>
                    {s.news.more}
                  </button>
                )}
              </div>
            </>
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
      <Link to={`/nyheter/${n.slug}`} className="card__media" tabIndex={-1} aria-hidden="true"><NewsImage n={n} card /></Link>
      <div className="card__meta">
        <span>{fmtDate(dagFra(n.published_at), lang)}</span>
        <span className="pill pill--teal">{sport ? `${sport.icon} ${t(sport.shortName)}` : s.news.wholePsi}</span>
      </div>
      <h3><Link to={`/nyheter/${n.slug}`}>{t(n.title)}</Link></h3>
      {/* Egen ingress når saken har en; ellers en smakebit av teksten. */}
      {(t(n.lead) || excerpt(t(n.body))) && <p className="muted">{t(n.lead) || excerpt(t(n.body))}</p>}
      <Link to={`/nyheter/${n.slug}`} className="more">{s.news.readMore} →</Link>
    </article>
  );
}

function NewsImage({ n, card = false }) {
  const { media } = useContent();
  const t = useT();
  const [feilet, setFeilet] = useState(false);
  const m = n.image_id ? media.find((x) => x.id === n.image_id) : null;
  // Laster ikke bildet, viser vi ingenting. En svart boks med brutt
  // bilde-ikon er dårligere enn ingen boks.
  if (!m?.web_url || feilet) return null;
  return (
    <figure className={`photo${card ? '' : ' photo--hero'}`} style={{ margin: 0 }}>
      <img className="photo__img" src={m.web_url} alt={t(m.caption) || t(n.title)} style={{ objectPosition: focusOf(m) }} loading={card ? 'lazy' : 'eager'} decoding="async" onError={() => setFeilet(true)} />
    </figure>
  );
}
