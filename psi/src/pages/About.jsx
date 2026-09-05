import { Link } from '../lib/router.jsx';
import { useStrings, useT } from '../lib/i18n.jsx';
import { useContent } from '../lib/content.jsx';
import { PageHead, Prose } from '../components/Bits.jsx';

const ABOUT = {
  nb: 'Porsgrunn Studentidrettslag (PSI) organiserer studentidrett ved USN Campus Porsgrunn og er i dag en del av Studentsamfunnet i Grenland (SiG).\n\nPSI er studentdrevet: gruppene ledes av frivillige studenter, og styret består av studenter. Vi legger vekt på aktivitet framfor prestasjonskrav. Terskelen skal være lav, treningene sosiale, og både norske og internasjonale studenter skal kjenne seg velkomne.\n\nI dag har PSI fem aktive aktivitetsgrupper: fotball, volleyball, klatring, padel og SiGRUN. Hver gruppe har sin egen Spond-gruppe der treninger og arrangementer publiseres.',
  en: 'Porsgrunn Studentidrettslag (PSI) organises student sports at USN Campus Porsgrunn and is currently part of Studentsamfunnet i Grenland (SiG), the student society.\n\nPSI is student-run: the groups are led by volunteer students and the board consists of students. We value activity over performance requirements. The threshold should be low, the sessions social, and both Norwegian and international students should feel welcome.\n\nToday PSI has five active groups: football, volleyball, climbing, padel and SiGRUN. Each group has its own Spond group where sessions and events are published.',
};

export default function About() {
  const { organization, activeSports, stats, site } = useContent();
  const s = useStrings();
  const t = useT();
  return (
    <>
      <PageHead eyebrow={s.about.title} title={organization.name} intro={t(organization.tagline)} />
      <section className="section">
        <div className="wrap split">
          <Prose text={t(ABOUT)} />
          <aside className="aside">
            <div className="card">
              <div className="eyebrow">{t(stats.asOf)}</div>
              <dl className="kv">
                <dt>{s.hero.statSports}</dt><dd>{stats.activeSports}</dd>
                <dt>{s.hero.statPeople}</dt><dd>{stats.uniqueParticipants}</dd>
              </dl>
            </div>
            <div className="card">
              <div className="eyebrow">{s.membership.title}</div>
              <p className="muted">{s.membership.body}</p>
              <a href={site.membershipUrl} className="btn btn--ghost" target="_blank" rel="noopener noreferrer">{s.membership.cta}</a>
            </div>
          </aside>
        </div>
      </section>
      <section className="section section--dark">
        <div className="wrap">
          <div className="eyebrow">{s.about.leaders}</div>
          <h2 style={{ marginBottom: 'var(--sp-5)' }}>{s.about.leaders}</h2>
          <div className="grid">
            <div className="card">
              <div className="eyebrow">{t(organization.leader.role)}</div>
              <h3>{organization.leader.name}</h3>
              <a href={`mailto:${organization.leader.email}`}>{organization.leader.email}</a>
            </div>
            {activeSports.map((sp) => (
              <div className="card" key={sp.slug}>
                <div className="eyebrow">{s.sports.leader}, {sp.name}</div>
                <h3>{sp.leader}</h3>
                <a href={`mailto:${sp.email}`}>{sp.email}</a>
                <Link to={`/idretter/${sp.slug}`} className="more">{sp.icon} {t(sp.shortName)} →</Link>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
