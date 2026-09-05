import { useStrings } from '../lib/i18n.jsx';
import { useContent } from '../lib/content.jsx';
import { PageHead, PartnerGrid, PartnerOffers } from '../components/Bits.jsx';

export default function Partners() {
  const { partners } = useContent();
  const s = useStrings();
  return (
    <>
      <PageHead eyebrow={s.nav.partners} title={s.partners.title} intro={s.partners.intro} />
      <section className="section">
        <div className="wrap"><PartnerGrid partners={partners} /></div>
      </section>
      <section className="section section--alt">
        <div className="wrap">
          <div className="eyebrow">{s.partners.benefits}</div>
          <p className="lead" style={{ maxWidth: '60ch' }}>{s.partners.benefitsIntro}</p>
          <PartnerOffers partners={partners} />
        </div>
      </section>
    </>
  );
}
