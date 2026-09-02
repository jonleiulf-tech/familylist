import { Component } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

const RELOAD_KEY = 'pl-chunk-reload';

/** Feil som betyr «filen appen ber om finnes ikke lenger». */
function isStaleChunk(error) {
  const text = `${error?.name ?? ''} ${error?.message ?? ''}`;
  return /dynamically imported module|Loading chunk|Importing a module script failed|Failed to fetch/i.test(text);
}

function alreadyReloaded() {
  try { return sessionStorage.getItem(RELOAD_KEY) === '1'; } catch { return true; }
}

function markReloaded() {
  try { sessionStorage.setItem(RELOAD_KEY, '1'); } catch { /* privat modus */ }
}

/**
 * Fanger uventede feil i en fane, slik at appen viser en forklaring i
 * stedet for en helt blank skjerm. Feilteksten står synlig: den er det
 * eneste holdepunktet vi har når feilen skjer på en telefon uten
 * utviklerverktøy, og kan fotograferes og sendes videre.
 *
 * `resetKey` nullstiller feilen når den endrer seg — bytter man fane,
 * skal appen prøve på nytt i stedet for å bli stående med feilkortet.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Loggen er det utviklerverktøyet leser; kortet er det brukeren leser.
    console.error('Uventet feil i appen:', error, info?.componentStack);

    // En utrulling bytter filnavnene på de lat-lastede dialogene. Har man
    // appen åpen fra før, finnes ikke filen appen ber om lenger, og React
    // kaster — det ga en blank skjerm. Da laster vi appen på nytt ÉN gang,
    // så henter nettleseren den nye utrullingen.
    if (isStaleChunk(error) && !alreadyReloaded()) {
      markReloaded();
      window.location.reload();
    }
  }

  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const message = String(error?.message || error || 'Ukjent feil');
    return (
      <div style={{ padding: 'var(--space-4)' }}>
        <div style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-divider)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-4)',
        }}>
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <AlertTriangle size={18} color="var(--color-accent)" />
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 17 }}>
              Her gikk noe galt
            </div>
          </div>
          <p className="text-muted" style={{ fontSize: 13, lineHeight: 1.55, margin: '8px 0 0' }}>
            Skjermen klarte ikke å tegne seg. Ingenting av det dere har lagret
            er tapt — handlelisten og middagsplanen ligger trygt i databasen.
            Prøv en annen fane, eller last appen på nytt.
          </p>
          <pre style={{
            marginTop: 'var(--space-3)',
            marginBottom: 0,
            padding: '8px 10px',
            background: 'var(--color-bg-sunken)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 11,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: 'var(--color-text-muted)',
          }}>
            {message}
          </pre>
          <div className="row" style={{ gap: 8, marginTop: 'var(--space-3)' }}>
            <button
              type="button"
              className="btn btn-primary"
              style={{ flex: 1 }}
              onClick={() => this.setState({ error: null })}
            >
              <RotateCcw size={15} /> Prøv igjen
            </button>
            <button
              type="button"
              className="btn"
              style={{ flex: 1 }}
              onClick={() => window.location.reload()}
            >
              Last appen på nytt
            </button>
          </div>
        </div>
      </div>
    );
  }
}
