import { useStrings, useT } from '../lib/i18n.jsx';
import { useContent } from '../lib/content.jsx';
import { PageHead } from '../components/Bits.jsx';

export default function Contact() {
  const { organization, activeSports, site } = useContent();
  const s = useStrings();
  const t = useT();
  return (
    <>
      <PageHead eyebrow={s.nav.contact} title={s.contact.title} intro={s.contact.intro} />
      <section className="section">
        <div className="wrap split">
          <div className="stack">
            <div className="card">
              <div className="eyebrow">{s.contact.groups}</div>
              <ul className="contact-list">
                {activeSports.map((sp) => (
                  <li key={sp.slug}>
                    <span>{sp.icon} {sp.name} <span className="muted">· {sp.leader}</span></span>
                    <a href={`mailto:${sp.email}`}>{sp.email}</a>
                  </li>
                ))}
              </ul>
            </div>
            <p className="muted">{s.contact.note}</p>
          </div>
          <aside className="aside">
            <div className="card card--dark">
              <div className="eyebrow">{s.contact.general}</div>
              <h3>{organization.leader.name}</h3>
              <p className="muted">{t(organization.leader.role)}</p>
              <a href={`mailto:${site.mainContact}`} className="btn btn--primary">{site.mainContact}</a>
            </div>
            {(site.instagram || site.facebook) && (
              <div className="card">
                <div className="eyebrow">{s.contact.social}</div>
                {site.instagram && <a href={site.instagram} target="_blank" rel="noreferrer">Instagram</a>}
                {site.facebook && <a href={site.facebook} target="_blank" rel="noreferrer">Facebook</a>}
              </div>
            )}
            <div className="card">
              <div className="eyebrow">{s.missing.title}</div>
              <p className="muted">{s.missing.body}</p>
              <a href={`mailto:${site.mainContact}?subject=${encodeURIComponent(s.missing.cta)}`} className="btn btn--ghost">{s.missing.cta}</a>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
