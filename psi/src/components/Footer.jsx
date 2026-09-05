import { Link } from '../lib/router.jsx';
import { useLang, useStrings, useT } from '../lib/i18n.jsx';
import { useContent } from '../lib/content.jsx';
import { fmtDate } from '../lib/format.js';
import { SocialLinks, socialLinks } from './Social.jsx';

export default function Footer() {
  const { site, organization, activeSports } = useContent();
  const s = useStrings();
  const t = useT();
  const lang = useLang();
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer__grid">
          <div>
            {site.logo && <img src={site.logo} alt="" width="72" height="72" style={{ marginBottom: 'var(--sp-3)' }} loading="lazy" />}
            <h4>{organization.shortName}</h4>
            <p>{t(organization.tagline)}</p>
            <p>{s.footer.partOf} <a href={organization.parent.url} target="_blank" rel="noopener noreferrer">{organization.parent.name}</a>.</p>
          </div>
          <div>
            <h4>{s.nav.sports}</h4>
            <ul>
              {activeSports.map((sp) => (
                <li key={sp.slug}><Link to={`/idretter/${sp.slug}`}>{sp.icon} {t(sp.shortName)}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <h4>{s.nav.menu}</h4>
            <ul>
              <li><Link to="/treningstider">{s.nav.schedule}</Link></li>
              <li><Link to="/bli-med">{s.nav.join}</Link></li>
              <li><Link to="/om">{s.nav.about}</Link></li>
              <li><Link to="/partnere">{s.nav.partners}</Link></li>
              <li><Link to="/kontakt">{s.nav.contact}</Link></li>
              <li><Link to="/stand">QR</Link></li>
            </ul>
          </div>
          <div>
            <h4>{s.nav.contact}</h4>
            <ul>
              <li><a href={`mailto:${site.mainContact}`}>{site.mainContact}</a></li>
              <li><a href={site.membershipUrl} target="_blank" rel="noopener noreferrer">{s.membership.cta}</a></li>
            </ul>
            {socialLinks(site).length > 0 && (
              <>
                <h4 style={{ marginTop: 'var(--sp-4)' }}>{s.contact.social}</h4>
                <SocialLinks compact />
              </>
            )}
          </div>
        </div>
        <div className="footer__bottom">
          <span>© {new Date().getFullYear()} {organization.name}</span>
          <span>{s.footer.edit}: {fmtDate(site.lastUpdated, lang)} · {t(site.currentSemester)}</span>
        </div>
      </div>
    </footer>
  );
}
