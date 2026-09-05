import { useStrings, useT } from '../lib/i18n.jsx';
import { useContent } from '../lib/content.jsx';
import { PageHead, Steps, Photo } from '../components/Bits.jsx';
import { SpondCta } from '../components/Spond.jsx';

/* /bli-med: siden en generell QR-kode på plakater og stand peker til.
   Store knapper, én per gruppe, og fem steg. */
export default function Join() {
  const { activeSports, site } = useContent();
  const s = useStrings();
  const t = useT();
  return (
    <>
      <PageHead eyebrow={s.nav.join} title={s.join.title} intro={s.join.intro} />
      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <h2>{s.join.groups}</h2>
            <a href={site.membershipUrl} className="btn btn--ghost btn--sm" target="_blank" rel="noopener noreferrer">{s.membership.cta}</a>
          </div>
          <div className="grid grid--sports">
            {activeSports.map((sp) => (
              <article className="card" key={sp.slug}>
                <Photo sport={sp} />
                <h3>{sp.name}</h3>
                <p className="muted">{t(sp.shortDescription)}</p>
                <SpondCta sport={sp} size="xl" showHow={false} />
              </article>
            ))}
          </div>
          <p className="muted" style={{ marginTop: 'var(--sp-4)' }}>{s.spond.how} · {s.spond.getApp}</p>
        </div>
      </section>
      <section className="section section--dark">
        <div className="wrap">
          <h2 style={{ marginBottom: 'var(--sp-5)' }}>{s.newHere.title}</h2>
          <Steps steps={s.join.steps} />
          <div className="notice notice--teal" style={{ marginTop: 'var(--sp-5)' }}>{s.membership.body} {s.membership.priority}</div>
        </div>
      </section>
    </>
  );
}
