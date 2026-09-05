import { Link } from '../lib/router.jsx';
import { useStrings } from '../lib/i18n.jsx';

export default function NotFound() {
  const s = useStrings();
  return (
    <section className="section">
      <div className="wrap">
        <div className="eyebrow">404</div>
        <h1>{s.notFound.title}</h1>
        <p className="lead muted" style={{ marginTop: 'var(--sp-4)' }}>{s.notFound.body}</p>
        <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap', marginTop: 'var(--sp-5)' }}>
          <Link to="/" className="btn btn--primary">{s.notFound.home}</Link>
          <Link to="/idretter" className="btn btn--ghost">{s.hero.findSport}</Link>
        </div>
      </div>
    </section>
  );
}
