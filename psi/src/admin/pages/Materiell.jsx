import { useEffect, useMemo, useRef, useState } from 'react';
import { useContent } from '../../lib/content.jsx';
import { FORMATER, finnFormat, passeInn, skala, trykkBilde, dpi } from '../../lib/materiell.js';
import { focusOf } from '../../lib/content.jsx';
import { timeRange } from '../../lib/format.js';
import { PageTitle, Panel, Empty } from '../ui.jsx';
import { Qr } from '../../components/Spond.jsx';

const DAGER = ['', 'Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'];
const nb = (x) => (x && typeof x === 'object' ? x.nb || x.en || '' : x || '');

/* Rollup, Instagram og Facebook fra det som alt ligger i systemet:
   gruppa, bildet, treningstidene og Spond-lenka. Malen fra hustrykkeriet
   er 850 × 2050 mm, og siden tegnes i millimeter slik at det du ser er
   det som kommer ut av skriveren. Utskrift til PDF er hele veien –
   ingen ny tjeneste, ingen ny konto. */
export default function Materiell({ data, access, content }) {
  const { activeSports, site, organization } = content;
  const kanSe = access.canEdit || access.isAdmin;
  const grupper = useMemo(() => activeSports.filter((sp) => access.canManage(sp.slug) || access.isAdmin), [activeSports, access]);
  const [slug, setSlug] = useState(() => grupper[0]?.slug || '');
  const [formatId, setFormatId] = useState('rollup85');
  const [bildeId, setBildeId] = useState(null);
  const [tittel, setTittel] = useState('');
  const [undertittel, setUndertittel] = useState('');
  const [visTider, setVisTider] = useState(true);

  const sport = activeSports.find((sp) => sp.slug === slug) || null;
  const format = finnFormat(formatId);
  const bilder = useMemo(
    () => data.media.filter((m) => m.sport_slug === slug || (!m.sport_slug && !slug)),
    [data.media, slug],
  );
  const bilde = bilder.find((m) => m.id === bildeId) || bilder.find((m) => m.is_cover) || bilder[0] || null;

  // Gruppa bestemmer teksten til den overstyres. Bytter man gruppe, skal
  // ikke forrige gruppes overskrift bli stående.
  useEffect(() => { setTittel(''); setUndertittel(''); setBildeId(null); }, [slug]);

  const overskrift = tittel || (sport ? sport.name : organization.shortName);
  const underskrift = undertittel || (sport ? nb(sport.shortDescription) : nb(organization.tagline));
  const spondUrl = sport?.spondInviteUrl || `${site.domain}/bli-med`;
  const oppløsning = dpi(bilde, format);

  if (!kanSe) return <Empty title="Ingen tilgang" body="Bare styret og gruppeledere kan lage materiell." />;

  return (
    <>
      <PageTitle
        eyebrow="Materiell"
        title="Rollup og bilder til sosiale medier"
        intro="Velg gruppe, bilde og format. Skriv ut til PDF når det ser riktig ut – malen er den hustrykkeriet bruker."
        actions={<button type="button" className="btn btn--primary btn--sm" onClick={() => window.print()}>Skriv ut / lag PDF</button>}
      />
      <div className="adm__cols adm__cols--wide">
        <div className="stack no-print">
          <Panel title="Innhold">
            <div className="form">
              <div className="field">
                <label htmlFor="mat-gruppe" className="field__label">Gruppe</label>
                <select id="mat-gruppe" value={slug} onChange={(e) => setSlug(e.target.value)}>
                  <option value="">Hele PSI</option>
                  {grupper.map((sp) => <option key={sp.slug} value={sp.slug}>{sp.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="mat-tittel" className="field__label">Overskrift</label>
                <input id="mat-tittel" value={tittel} onChange={(e) => setTittel(e.target.value)} placeholder={overskrift} />
              </div>
              <div className="field">
                <label htmlFor="mat-under" className="field__label">Undertekst</label>
                <input id="mat-under" value={undertittel} onChange={(e) => setUndertittel(e.target.value)} placeholder={underskrift} />
              </div>
              {sport?.schedule?.length > 0 && (
                <label className="check"><input type="checkbox" checked={visTider} onChange={(e) => setVisTider(e.target.checked)} />Vis treningstidene</label>
              )}
            </div>
          </Panel>

          <Panel title="Format">
            <div className="chips">
              {FORMATER.map((f) => (
                <button key={f.id} type="button" className={`chip chip--small${formatId === f.id ? ' is-active' : ''}`} onClick={() => setFormatId(f.id)}>{f.navn}</button>
              ))}
            </div>
            <p className="hint muted">{format.hint}</p>
          </Panel>

          <Panel title="Bilde" intro="Bildene som er lastet opp på gruppa. Utsnittet følger fokuspunktet du har satt under «Bilder».">
            {bilder.length === 0 ? (
              <p className="muted">Ingen bilder på denne gruppa ennå. Last opp under «Bilder».</p>
            ) : (
              <div className="picker">
                {bilder.map((m) => (
                  <button type="button" key={m.id} className={`picker__item${bilde?.id === m.id ? ' is-active' : ''}`} onClick={() => setBildeId(m.id)} title={nb(m.caption)}>
                    <img src={m.web_url} alt={nb(m.caption)} loading="lazy" />
                  </button>
                ))}
              </div>
            )}
            {oppløsning !== null && (
              <p className={`hint ${oppløsning < 70 ? 'hint--warn' : 'muted'}`}>
                {oppløsning} dpi i full bredde.{' '}
                {oppløsning < 70
                  ? 'Under 70 dpi blir det uskarpt på en rollup. Bruk et større bilde.'
                  : 'Storformat trykkes i 70–150 dpi, så dette holder.'}
              </p>
            )}
          </Panel>

          <Panel title="Til trykkeriet">
            <ul className="hint muted" style={{ paddingLeft: '1.1rem' }}>
              <li>Skriv ut med «Lagre som PDF», papirstørrelse <b>{format.bredde} × {format.høyde} mm</b>, marger 0 og bakgrunnsgrafikk på.</li>
              <li>Nederste {format.trygg.bunn} mm dekkes av kassetten. Ingenting viktig havner der.</li>
              <li>PDF-en er RGB. Trenger hustrykkeriet CMYK (ISO Coated v2), be dem konvertere – de gjør det rutinemessig.</li>
            </ul>
          </Panel>
        </div>

        <div className="ark__ramme">
          <Ark
            format={format}
            sport={sport}
            bilde={bilde}
            overskrift={overskrift}
            underskrift={underskrift}
            visTider={visTider && sport?.schedule?.length > 0}
            site={site}
            organization={organization}
            spondUrl={spondUrl}
          />
        </div>
      </div>
    </>
  );
}

/* Selve arket. Alt i mm, så forhåndsvisningen og PDF-en er samme sak. */
function Ark({ format, sport, bilde, overskrift, underskrift, visTider, site, organization, spondUrl }) {
  const boks = useRef(null);
  const [faktor, setFaktor] = useState(0.2);

  // 1 CSS-piksel er 0,2646 mm. Vi regner om plassen vi har til mm og
  // skalerer arket ned så det får plass – målene i arket blir stående i
  // mm, så utskriften er upåvirket av hvor stor forhåndsvisningen er.
  useEffect(() => {
    const el = boks.current;
    if (!el) return undefined;
    const mål = () => {
      const bredde = el.clientWidth * 0.2646;
      const høyde = Math.max(360, window.innerHeight - 260) * 0.2646;
      setFaktor(passeInn(format, bredde, høyde) || 0.2);
    };
    mål();
    const ro = new ResizeObserver(mål);
    ro.observe(el);
    window.addEventListener('resize', mål);
    return () => { ro.disconnect(); window.removeEventListener('resize', mål); };
  }, [format]);

  const s = skala(format);
  const px = (mm) => `${mm}mm`;
  const stående = Boolean(format.stående);
  const bildeUrl = trykkBilde(bilde);

  return (
    <div className="ark__ytre" ref={boks}>
      <div
        className="ark__scene"
        style={{ width: `${format.bredde * faktor}mm`, height: `${format.høyde * faktor}mm` }}
      >
      <style>{`@page { size: ${format.bredde}mm ${format.høyde}mm; margin: 0; }`}</style>
      <div
        className={`ark${stående ? ' ark--staaende' : ''}`}
        style={{
          width: px(format.bredde),
          height: px(format.høyde),
          '--s': s,
          '--trygg-side': px(format.trygg.side),
          '--trygg-topp': px(format.trygg.topp),
          '--trygg-bunn': px(format.trygg.bunn),
          '--vis': faktor,
        }}
      >
        <div className="ark__bilde">
          {bildeUrl
            ? <img src={bildeUrl} alt="" style={{ objectPosition: focusOf(bilde) }} />
            : <div className="ark__tomt" />}
          <span className="ark__slor" />
        </div>

        {site.logo && <img className="ark__logo" src={site.logo} alt="" />}

        <div className="ark__tekst">
          <div className="ark__eyebrow">{organization.shortName} · USN Campus Porsgrunn</div>
          <h1>{overskrift}</h1>
          <p className="ark__lead">{underskrift}</p>

          {visTider && (
            <ul className="ark__tider">
              {[...sport.schedule].sort((a, b) => a.day - b.day || a.from.localeCompare(b.from)).map((slot, i) => (
                <li key={i}>
                  <b>{DAGER[slot.day]}</b>
                  <span>{timeRange(slot)}</span>
                  <small>{nb(slot.venue || sport.venue)}</small>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="ark__bunn">
          <div className="ark__qr"><Qr url={spondUrl} size={260} /></div>
          <div className="ark__bunntekst">
            <b>Bli med i Spond</b>
            {sport?.spondCode && <span>Kode {sport.spondCode}</span>}
            <span className="ark__url">{site.domain.replace(/^https?:\/\//, '')}</span>
          </div>
        </div>

        <div className="ark__hjelpelinjer no-print" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
