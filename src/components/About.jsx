import { ExternalLink } from 'lucide-react';
import { Dialog } from './Dialog.jsx';

/**
 * Kreditering av Kassalapp. Prisene og produktinformasjonen i søket kommer
 * fra deres API, og da skal det stå — ryddig, med lenke, slik andre som
 * bruker dataene gjør det. Ett sted å endre ordlyden.
 */
export const KASSALAPP_URL = 'https://kassal.app';

export function KassalappCredit({ style, variant = 'line' }) {
  const lenke = (
    <a
      href={KASSALAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: 'inherit', fontWeight: 600, textDecoration: 'underline', textDecorationColor: 'var(--color-divider-strong)', textUnderlineOffset: 2 }}
    >
      Kassalapp <ExternalLink size={10} aria-hidden="true" style={{ verticalAlign: -1 }} />
    </a>
  );
  if (variant === 'inline') return lenke;
  return (
    <p className="text-muted" style={{ fontSize: 11.5, lineHeight: 1.5, margin: 0, ...style }}>
      Priser og produktinformasjon fra {lenke} · kassal.app
    </p>
  );
}

/** Kildene appen bygger på — det man bør kunne finne uten å lete. */
const KILDER = [
  {
    name: 'Kassalapp',
    url: KASSALAPP_URL,
    desc: 'Produktsøket og prisene i «Søk i Kassalapp». Kassalapp samler priser fra norske dagligvarekjeder og gjør dem tilgjengelige via et åpent API. Et valgt produkt blir en anonym prisobservasjon hos oss.',
  },
  {
    name: 'Egne kvitteringer',
    desc: 'Prisene dere faktisk har betalt. Kvitteringer dere laster opp gir husholdningens egne kjøpslinjer (private) og anonyme prisobservasjoner (felles). «Dere betaler vanligvis …» og «Spart denne måneden» regnes av disse.',
  },
  {
    name: 'Butikkenes tilbud',
    desc: 'Ukens tilbud fra kjedenes egne sider der de finnes i lesbar form, kundeavis-skann og manuell import. Alltid med kilde på tilbudet.',
  },
  {
    name: 'Oppskriftskilder',
    desc: 'Den store kokeboka lenker til oppskriftene hos TINE, Gilde, MENY, REMA 1000 og andre — teksten deres kopieres aldri inn, og hver kilde krediteres på middagen.',
  },
];

export function AboutDialog({ onClose }) {
  return (
    <Dialog title="Om Plukkelisten" subtitle="Hvor kommer tallene fra?" onClose={onClose}>
      <p style={{ fontSize: 14, lineHeight: 1.55, margin: '0 0 var(--space-4)' }}>
        Plukkelisten gjetter aldri på en pris uten å si hvor den kommer fra.
        Dette er kildene, og hva hver av dem brukes til.
      </p>
      <div className="stack" style={{ gap: 12 }}>
        {KILDER.map((k) => (
          <div key={k.name}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>
              {k.url ? (
                <a href={k.url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>
                  {k.name} <ExternalLink size={11} aria-hidden="true" style={{ verticalAlign: -1 }} />
                </a>
              ) : k.name}
            </div>
            <p className="text-muted" style={{ fontSize: 12.5, lineHeight: 1.5, margin: '2px 0 0' }}>{k.desc}</p>
          </div>
        ))}
      </div>
      <hr className="divider" style={{ height: 1, background: 'var(--color-divider-soft)', margin: 'var(--space-4) 0' }} />
      <p className="text-muted" style={{ fontSize: 11.5, lineHeight: 1.5, margin: 0 }}>
        Kildene hentes bare der de har åpnet for det. Robots.txt respekteres,
        og ingen kjeders interne systemer leses. Prisobservasjonene som deles
        mellom husholdninger er anonyme og aldri koblet til hvem som kjøpte.
      </p>
    </Dialog>
  );
}
