import { useEffect, useState } from 'react';
import { Link, useRouter } from '../lib/router.jsx';
import { useStrings } from '../lib/i18n.jsx';
import { useSession } from '../lib/useSession.js';
import { useContent } from '../lib/content.jsx';

export default function Nav() {
  const { site, organization, news } = useContent();
  const [open, setOpen] = useState(false);
  const { path, lang } = useRouter();
  const s = useStrings();
  const session = useSession();
  useEffect(() => setOpen(false), [path]);
  const other = lang === 'nb' ? 'en' : 'nb';

  const links = [
    ['/idretter', s.nav.sports],
    ['/kalender', s.nav.calendar],
    ...(news.length > 0 ? [['/nyheter', s.nav.news]] : []),
    ['/om', s.nav.about],
    ['/kontakt', s.nav.contact],
  ];

  return (
    <header className="nav">
      <a href="#innhold" className="skip">{s.skip}</a>
      <div className="wrap nav__row">
        <Link to="/" className="brand" aria-label={`${organization.shortName}, ${s.nav.home}`}>
          {site.logo ? (
            <img className="brand__logo" src={site.logo} alt="" width="44" height="44" />
          ) : (
            <span className="brand__mark" aria-hidden="true">{organization.shortName}</span>
          )}
          <span className="brand__name">
            {organization.name}
            <span className="brand__sub">{organization.campus}</span>
          </span>
        </Link>
        <div className="nav__right">
          <Link to={path} lang={other} className="nav__lang" hrefLang={other} aria-label={s.footer.language + ': ' + s.switchTo}>
            {s.switchTo}
          </Link>
          <button className="nav__toggle" aria-expanded={open} aria-controls="hovedmeny" onClick={() => setOpen((o) => !o)}>
            {open ? s.nav.close : s.nav.menu}
          </button>
        </div>
        <nav aria-label={s.nav.menu}>
          <ul id="hovedmeny" className={`nav__links${open ? ' is-open' : ''}`}>
            {links.map(([to, label]) => (
              <li key={to}><Link to={to}>{label}</Link></li>
            ))}
            {session && <li><Link to="/admin">{s.nav.admin}</Link></li>}
            <li><Link to="/bli-med" className="btn btn--primary btn--sm">{s.nav.join}</Link></li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
