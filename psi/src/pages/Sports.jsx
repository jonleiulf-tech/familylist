import { useStrings } from '../lib/i18n.jsx';
import { useContent } from '../lib/content.jsx';
import { PageHead, SportCard } from '../components/Bits.jsx';

export default function Sports() {
  const { activeSports } = useContent();
  const s = useStrings();
  return (
    <>
      <PageHead eyebrow={s.nav.sports} title={s.sports.title} intro={s.sports.intro} />
      <section className="section">
        <div className="wrap">
          <div className="grid grid--sports">
            {activeSports.map((sp) => <SportCard key={sp.slug} sport={sp} />)}
          </div>
        </div>
      </section>
    </>
  );
}
