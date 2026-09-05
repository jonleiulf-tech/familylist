import { Component } from 'react';

/* Siste skanse. Krasjer en komponent, skal besøkende få en lesbar side
   med veien videre, ikke en blank skjerm. */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('PSI: siden krasjet', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section className="section">
        <div className="wrap prose">
          <div className="eyebrow">PSI</div>
          <h1>Noe gikk galt</h1>
          <p className="lead muted" style={{ marginTop: 'var(--sp-4)' }}>
            Siden klarte ikke å vise innholdet. Prøv å laste den på nytt.
          </p>
          <p className="muted">
            Står det fortsatt slik, er Spond alltid fasiten for treninger og
            arrangementer. Ta gjerne kontakt på{' '}
            <a href="mailto:jon.l.leiulfsrud@usn.no">jon.l.leiulfsrud@usn.no</a>.
          </p>
          <p>
            <a className="btn btn--primary" href="/">Til forsiden</a>
          </p>
        </div>
      </section>
    );
  }
}
