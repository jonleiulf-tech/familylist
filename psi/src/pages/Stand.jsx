import { useStrings } from '../lib/i18n.jsx';
import { useContent } from '../lib/content.jsx';
import { PageHead } from '../components/Bits.jsx';
import { Qr, SpondCode } from '../components/Spond.jsx';

/* /stand: QR-koder til utskrift og stand. Én generell til /bli-med og
   én per Spond-gruppe. Skriv ut siden direkte (Ctrl/Cmd+P). */
export default function Stand() {
  const { activeSports, site, organization } = useContent();
  const s = useStrings();
  const joinUrl = `${site.domain}/bli-med`;
  return (
    <>
      <PageHead eyebrow="QR" title={`${organization.shortName} · ${s.nav.join}`} intro={joinUrl}>
        <button type="button" className="btn btn--ghost btn--sm no-print" style={{ marginTop: 'var(--sp-4)' }} onClick={() => window.print()}>Print</button>
      </PageHead>
      <section className="section">
        {site.logoOnLight && <div className="wrap" style={{ marginBottom: 'var(--sp-5)' }}><img src={site.logoOnLight} alt={organization.name} width="140" height="140" /></div>}
        <div className="wrap stand">
          <article className="card">
            <h3>{s.nav.join}</h3>
            <p className="muted">{joinUrl.replace('https://', '')}</p>
            <Qr url={joinUrl} label={s.spond.qrHint} size={200} />
          </article>
          {activeSports.map((sp) => (
            <article className="card" key={sp.slug}>
              <h3>{sp.icon} {sp.name}</h3>
              {sp.spondInviteUrl ? (
                <>
                  <p className="muted">{sp.spondInviteUrl.replace('https://', '')}</p>
                  <Qr url={sp.spondInviteUrl} label={s.spond.qrHint} size={200} />
                </>
              ) : null}
              <div style={{ width: '100%' }}><SpondCode code={sp.spondCode} label={s.spond.code} /></div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
