import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useContent } from '../../lib/content.jsx';
import { FORMATER, finnFormat, trykkBilde, dpi } from '../../lib/materiell.js';
import { focusOf } from '../../lib/content.jsx';
import { timeRange } from '../../lib/format.js';
import { PageTitle, Panel, Empty } from '../ui.jsx';
import { tegnArk } from '../../lib/ark-canvas.js';
import { lagRollupPdf } from '../../lib/rollup-pdf.js';

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
  const lastNed = useRef(null);

  const sport = activeSports.find((sp) => sp.slug === slug) || null;
  const format = finnFormat(formatId);
  const bilder = useMemo(
    () => data.media.filter((m) => m.sport_slug === slug || (!m.sport_slug && !slug)),
    [data.media, slug],
  );
  const bilde = bilder.find((m) => m.id === bildeId) || bilder.find((m) => m.is_cover) || bilder[0] || null;

  // Gruppa bestemmer teksten til den overstyres. Bytter man gruppe, skal
  // ikke forrige gruppes overskrift bli stående.
  useEffect(() => { setTittel(''); setUndertittel(''); setBildeId(null); setVisTider(true); }, [slug]);

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
        actions={<button type="button" className="btn btn--primary btn--sm" onClick={() => lastNed.current?.()}>
          {format.piksler ? 'Last ned PNG' : 'Last ned PDF'}
        </button>}
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
            {!format.piksler && <p className="hint muted">PDF-en lages her, ikke av nettleserens utskrift. Da blir arket riktig størrelse, og alle flater og all tekst blir CMYK.</p>}
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

          {!format.piksler && <Panel title="Til trykkeriet">
            <ul className="hint muted" style={{ paddingLeft: '1.1rem' }}>
              <li>Fila er ett ark på <b>{format.bredde} × {format.høyde} mm</b>, i målestokk 1:1.</li>
              <li>Flater og tekst er <b>CMYK</b>. Den oransje er låst til 0/70/90/0, så den ikke flytter seg i konverteringen.</li>
              <li>Fotografiet ligger som RGB. Trykkeriet konverterer det med sin egen profil (ISO Coated v2) – det gir bedre resultat enn en konvertering uten profil her.</li>
              <li>Skriftene er lagt inn i fila. Ber trykkeriet om baner i stedet, si fra.</li>
              <li>Nederste {format.trygg.bunn} mm dekkes av kassetten. Ingenting viktig havner der.</li>
            </ul>
          </Panel>}
        </div>

        <div className="ark__ramme">
          {format.piksler ? (
            <Lerret
              format={format}
              sport={sport}
              bilde={bilde}
              overskrift={overskrift}
              underskrift={underskrift}
              visTider={visTider && sport?.schedule?.length > 0}
              site={site}
              organization={organization}
              spondUrl={spondUrl}
              register={(fn) => { lastNed.current = fn; }}
            />
          ) : (
            <Rollup
              format={format}
              sport={sport}
              bilde={bilde}
              overskrift={overskrift}
              underskrift={underskrift}
              visTider={visTider && sport?.schedule?.length > 0}
              site={site}
              organization={organization}
              spondUrl={spondUrl}
              register={(fn) => { lastNed.current = fn; }}
            />
          )}
        </div>
      </div>
    </>
  );
}

/* Skjermformatene tegnes på et lerret i eksakte piksler. Samme lerret er
   både forhåndsvisning og fila som lastes ned, så det er umulig for dem å
   komme i utakt. */
function Lerret({ format, sport, bilde, overskrift, underskrift, visTider, site, organization, spondUrl, register }) {
  const ref = useRef(null);
  const [qrUrl, setQrUrl] = useState(null);
  const [feil, setFeil] = useState(null);
  const px = { bredde: Math.round(format.bredde / 0.2646), høyde: Math.round(format.høyde / 0.2646) };

  useEffect(() => {
    let levende = true;
    import('qrcode')
      .then((QR) => QR.toDataURL(spondUrl, { margin: 0, width: 600, color: { dark: '#0d0d0c', light: '#ffffff' } }))
      .then((u) => { if (levende) setQrUrl(u); })
      .catch(() => setQrUrl(null));
    return () => { levende = false; };
  }, [spondUrl]);

  const tegn = useCallback(async () => {
    const lerret = ref.current;
    if (!lerret) return;
    lerret.width = px.bredde;
    lerret.høyde = px.høyde;
    lerret.height = px.høyde;
    const ctx = lerret.getContext('2d');
    try { await document.fonts.ready; } catch { /* skriftene er lastet eller ikke */ }
    const [foto, logo, qr] = await Promise.all([
      lastBilde(trykkBilde(bilde)),
      lastBilde(site.logo),
      lastBilde(qrUrl),
    ]);
    const tider = visTider
      ? [...sport.schedule].sort((a, b) => a.day - b.day || a.from.localeCompare(b.from))
          .map((slot) => ({ dag: DAGER[slot.day], tid: timeRange(slot) }))
      : [];
    tegnArk(ctx, {
      bredde: px.bredde, høyde: px.høyde,
      foto, logo, qr,
      fokusX: bilde?.focus_x ?? 50, fokusY: bilde?.focus_y ?? 50,
      eyebrow: `${organization.shortName} · USN Campus Porsgrunn`,
      tittel: overskrift, lead: underskrift, tider,
      url: site.domain.replace(/^https?:\/\//, ''),
    });
    setFeil(foto || !bilde ? null : 'Fikk ikke lastet bildet. Er det lastet opp i admin?');
  }, [px.bredde, px.høyde, bilde, site.logo, site.domain, qrUrl, overskrift, underskrift, visTider, sport, organization.shortName]);

  useEffect(() => { tegn(); }, [tegn]);

  useEffect(() => {
    register(() => {
      const lerret = ref.current;
      if (!lerret) return;
      lerret.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `psi-${sport?.slug || 'psi'}-${format.id}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }, 'image/png');
    });
  }, [register, sport, format.id]);

  return (
    <div className="lerret">
      <canvas ref={ref} width={px.bredde} height={px.høyde} aria-label={`${format.navn}, ${format.piksler}`} />
      <p className="hint muted">{format.piksler} · lastes ned som PNG i full størrelse.</p>
      {feil && <p className="hint hint--warn">{feil}</p>}
    </div>
  );
}

/* Bildene ligger på Supabase, som sender CORS-hoder. crossOrigin gjør at
   lerretet ikke blir «tainted», og da kan PNG-en faktisk lagres. */
function lastBilde(url) {
  if (!url) return Promise.resolve(null);
  return new Promise((ok) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => ok(img);
    img.onerror = () => ok(null);
    img.src = url;
  });
}

/* Rollup: PDF-en lages her og vises som PDF. Da kan forhåndsvisningen og
   trykkfila ikke komme i utakt – det er samme fil. */
function Rollup({ format, sport, bilde, overskrift, underskrift, visTider, site, organization, spondUrl, register }) {
  const [url, setUrl] = useState(null);
  const [feil, setFeil] = useState(null);
  const [jobber, setJobber] = useState(true);
  const blobRef = useRef(null);

  useEffect(() => {
    let levende = true;
    setJobber(true);
    setFeil(null);
    (async () => {
      const [condensed, bold, medium] = await Promise.all([
        hentBytes('/fonts/BarlowCondensed-ExtraBold.ttf'),
        hentBytes('/fonts/Barlow-Bold.ttf'),
        hentBytes('/fonts/Barlow-Medium.ttf'),
      ]);
      if (!condensed || !medium) throw new Error('Fikk ikke lastet skriftene.');
      const fotoUrl = trykkBilde(bilde);
      const [foto, logo, merke, qr] = await Promise.all([
        hentBytes(fotoUrl),
        hentBytes(site.logo),
        hentBytes(sport?.glyph),
        lagQr(spondUrl),
      ]);
      const tider = visTider
        ? [...sport.schedule].sort((a, b) => a.day - b.day || a.from.localeCompare(b.from))
            .map((slot) => ({ dag: DAGER[slot.day], tid: timeRange(slot), sted: nb(slot.venue || sport.venue) }))
        : [];
      const bytes = await lagRollupPdf({
        bredde: format.bredde, høyde: format.høyde, trygg: format.trygg,
        fonter: { condensed, bold: bold || medium, medium },
        foto,
        fokusX: bilde?.focus_x ?? 50, fokusY: bilde?.focus_y ?? 50,
        logo, merke, qr,
        eyebrow: `${organization.shortName} · USN Campus Porsgrunn`,
        tittel: overskrift, lead: underskrift, tider,
        kode: sport?.spondCode || '',
        spondTekst: spondUrl.replace(/^https?:\/\//, ''),
        url: site.domain.replace(/^https?:\/\//, ''),
      });
      if (!levende) return;
      const blob = new Blob([bytes], { type: 'application/pdf' });
      if (blobRef.current) URL.revokeObjectURL(blobRef.current);
      blobRef.current = URL.createObjectURL(blob);
      setUrl(blobRef.current);
      register(() => {
        const a = document.createElement('a');
        a.href = blobRef.current;
        a.download = `psi-${sport?.slug || 'psi'}-${format.id}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      });
    })()
      .catch((e) => { if (levende) setFeil(e.message || 'Klarte ikke lage PDF-en.'); })
      .finally(() => { if (levende) setJobber(false); });
    return () => { levende = false; };
  }, [format, sport, bilde, overskrift, underskrift, visTider, site.logo, site.domain, organization.shortName, spondUrl, register]);

  return (
    <div className="pdfvis">
      {jobber && <p className="muted">Lager PDF …</p>}
      {feil && <p className="hint hint--warn">{feil}</p>}
      {url && <iframe title="Rollup" src={`${url}#toolbar=0&navpanes=0&view=Fit`} />}
    </div>
  );
}

async function hentBytes(url) {
  if (!url) return null;
  try {
    const r = await fetch(url, { mode: 'cors' });
    if (!r.ok) return null;
    return new Uint8Array(await r.arrayBuffer());
  } catch {
    return null;
  }
}

async function lagQr(url) {
  try {
    const QR = await import('qrcode');
    const data = await QR.toDataURL(url, { margin: 0, width: 900, color: { dark: '#000000', light: '#ffffff' } });
    return Uint8Array.from(atob(data.split(',')[1]), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}
