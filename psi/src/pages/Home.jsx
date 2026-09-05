import { Link } from '../lib/router.jsx';
import { useStrings, useT } from '../lib/i18n.jsx';
import { useContent } from '../lib/content.jsx';
import { SportCard, Steps, PartnerGrid, Prose } from '../components/Bits.jsx';

export default function Home() {
  const { organization, activeSports, partners, stats, site } = useContent();
  const s = useStrings();
  const t = useT();
  return (
    <>
      <section className="hero">
        <div className="wrap hero__grid">
          <div>
          <div className="eyebrow">{s.hero.eyebrow}</div>
          <div className="hero__mark" aria-hidden="true">{organization.shortName}</div>
          <h1>{t(organization.tagline)}</h1>
          <p className="hero__values">{t(organization.values)}</p>
          <div className="hero__actions">
            <Link to="/idretter" className="btn btn--primary btn--xl">{s.hero.findSport}</Link>
            <Link to="/bli-med" className="btn btn--ghost btn--xl">{s.hero.joinSpond}</Link>
          </div>
          <div className="hero__facts">
            <div className="fact"><strong>{stats.activeSports}</strong><span>{s.hero.statSports}</span></div>
            <div className="fact"><strong>{stats.uniqueParticipants}</strong><span>{s.hero.statPeople} · {s.hero.statAsOf} {t(stats.asOf)}</span></div>
          </div>
          </div>
          {site.emblem && <img className="hero__emblem" src={site.emblem} alt={`${organization.name}: ${activeSports.map((sp) => t(sp.shortName)).join(', ')}`} width="420" height="420" />}
        </div>
      </section>

      {/* A. Fem idrettskort */}
      <section className="section" id="idretter">
        <div className="wrap">
          <div className="section-head">
            <div>
              <div className="eyebrow">{s.nav.sports}</div>
              <h2>{s.sports.title}</h2>
            </div>
            <Link to="/treningstider" className="btn btn--ghost btn--sm">{s.nav.schedule}</Link>
          </div>
          <div className="grid grid--sports">
            {activeSports.map((sp) => <SportCard key={sp.slug} sport={sp} />)}
          </div>
        </div>
      </section>

      {/* B. Spond er samlingspunktet */}
      <section className="section section--dark">
        <div className="wrap split">
          <div>
            <div className="eyebrow">Spond</div>
            <h2>{s.spond.title}</h2>
            <p className="lead muted" style={{ marginTop: 'var(--sp-4)' }}>{s.spond.body}</p>
            <p className="muted">{s.spond.unregister}</p>
          </div>
          <aside className="aside">
            <div className="card card--dark">
              <p><strong>{s.spond.truth}</strong></p>
              <p className="muted">{s.spond.getApp}</p>
              <Link to="/bli-med" className="btn btn--primary">{s.spond.join}</Link>
            </div>
          </aside>
        </div>
      </section>

      {/* C. Ny i PSI? */}
      <section className="section">
        <div className="wrap">
          <div className="eyebrow">{s.nav.join}</div>
          <h2 style={{ marginBottom: 'var(--sp-5)' }}>{s.newHere.title}</h2>
          <Steps steps={s.newHere.steps} row />
          <div style={{ marginTop: 'var(--sp-5)', display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
            <Link to="/bli-med" className="btn btn--dark">{s.nav.join}</Link>
            <a href={site.membershipUrl} className="btn btn--ghost" target="_blank" rel="noopener noreferrer">{s.membership.cta}</a>
          </div>
        </div>
      </section>

      {/* D. Savner du en idrett? */}
      <section className="section--tight cta-band">
        <div className="wrap">
          <div>
            <h2>{s.missing.title}</h2>
            <p style={{ marginTop: 'var(--sp-2)', maxWidth: '60ch' }}>{s.missing.body}</p>
            <p style={{ marginTop: 'var(--sp-2)', maxWidth: '60ch', fontSize: 'var(--fs-sm)' }}>{s.missing.handledBy}</p>
          </div>
          <a href={`mailto:${site.newGroupContact.email}?subject=${encodeURIComponent(s.missing.cta)}`} className="btn btn--dark">{s.missing.cta}</a>
        </div>
      </section>

      {/* E. Om PSI, kort */}
      <section className="section">
        <div className="wrap split">
          <div>
            <div className="eyebrow">{s.about.short}</div>
            <h2>{organization.name}</h2>
            <div style={{ marginTop: 'var(--sp-4)' }}>
              <Prose text={t(organization.currentRelationToSiG) + ' ' + t(aboutShort)} />
            </div>
            <Link to="/om" className="btn btn--ghost" style={{ marginTop: 'var(--sp-4)' }}>{s.about.readMore}</Link>
          </div>
          <aside className="aside">
            <div className="card">
              <div className="eyebrow">{s.membership.title}</div>
              <p>{s.membership.body}</p>
              <p className="muted">{s.membership.priority}</p>
              <a href={site.membershipUrl} className="btn btn--primary" target="_blank" rel="noopener noreferrer">{s.membership.cta}</a>
            </div>
          </aside>
        </div>
      </section>

      {/* F. Samarbeid */}
      <section className="section section--tight" style={{ background: 'var(--cream-2)' }}>
        <div className="wrap">
          <div className="section-head">
            <div>
              <div className="eyebrow">{s.partners.title}</div>
              <h2 style={{ fontSize: 'var(--fs-xl)' }}>{s.partners.intro}</h2>
            </div>
            <Link to="/partnere" className="btn btn--ghost btn--sm">{s.nav.partners}</Link>
          </div>
          <PartnerGrid partners={partners} />
        </div>
      </section>
    </>
  );
}

const aboutShort = {
  nb: 'Vi organiserer studentidrett ved USN Campus Porsgrunn: studentdrevet, lavterskel og sosialt, for norske og internasjonale studenter. Fem aktive grupper drives av frivillige gruppeledere.',
  en: 'We organise student sports at USN Campus Porsgrunn: student-run, low-threshold and social, for Norwegian and international students. Five active groups are run by volunteer group leaders.',
};
