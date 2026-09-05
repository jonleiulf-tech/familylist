import { useState } from 'react';
import { Link } from '../lib/router.jsx';
import { useLang, useStrings, useT } from '../lib/i18n.jsx';
import { useContent } from '../lib/content.jsx';
import { paragraphs, timeRange, fmtDate } from '../lib/format.js';
import { SpondCta } from './Spond.jsx';

export function PageHead({ eyebrow, title, intro, crumbs, children }) {
  return (
    <section className="page-head">
      <div className="wrap">
        {crumbs && (
          <div className="crumbs">
            {crumbs.map(([to, label], i) => (
              <span key={to}>{i > 0 && ' / '}<Link to={to}>{label}</Link></span>
            ))}
          </div>
        )}
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {intro && <p className="lead">{intro}</p>}
        {children}
      </div>
    </section>
  );
}

export function Prose({ text }) {
  return <div className="prose">{paragraphs(text).map((p, i) => <p key={i}>{p}</p>)}</div>;
}

/* Bilde fra datafila, eller en tydelig plassholder til ekte PSI-bilder er
   på plass. `image` kan være en basissti fra `npm run images`
   ('/images/psi/fotball/card' → card-480/960/1440.webp + card-960.jpg) eller
   én konkret fil. Laster bildet ikke, faller vi tilbake til plassholderen
   i stedet for et brukket bilde. Ingen genererte «medlemmer». */
export const IMAGE_WIDTHS = [480, 960, 1440];

export function Photo({ sport, hero = false }) {
  const t = useT();
  const { site } = useContent();
  const emblem = site.emblem;
  const [failed, setFailed] = useState(false);
  const cls = `photo${hero ? ' photo--hero' : ''}`;
  const alt = t(sport.imageAlt) || `${sport.name}: ${t(sport.shortDescription)}`;

  if (sport.image && !failed) {
    const isFile = /\.[a-z0-9]{2,5}$/i.test(sport.image);
    const sizes = hero ? '(min-width: 900px) 740px, 100vw' : '(min-width: 900px) 360px, (min-width: 640px) 50vw, 100vw';
    return (
      <div className={cls}>
        {isFile ? (
          <img src={sport.image} alt={alt} loading={hero ? 'eager' : 'lazy'} decoding="async" onError={() => setFailed(true)} />
        ) : (
          <picture>
            <source type="image/webp" srcSet={IMAGE_WIDTHS.map((w) => `${sport.image}-${w}.webp ${w}w`).join(', ')} sizes={sizes} />
            <img
              src={`${sport.image}-960.jpg`}
              srcSet={IMAGE_WIDTHS.map((w) => `${sport.image}-${w}.jpg ${w}w`).join(', ')}
              sizes={sizes}
              alt={alt}
              width="1440" height={hero ? '617' : '810'}
              loading={hero ? 'eager' : 'lazy'} decoding="async"
              onError={() => setFailed(true)}
            />
          </picture>
        )}
      </div>
    );
  }
  // Ikke noe foto ennå: tegn PSI-panelet med idrettsmerket fra seglet.
  // Det er PSIs eget materiell, ikke stock og ikke oppdiktede personer.
  return (
    <div className={`${cls} photo--brand`} role="img" aria-label={alt}>
      {emblem && <img className="photo__seal" src={emblem} alt="" aria-hidden="true" loading="lazy" />}
      {sport.glyph && <img className="photo__glyph" src={sport.glyph} alt="" aria-hidden="true" loading="lazy" />}
    </div>
  );
}

/* Idrettskort: brukes på forsiden og /idretter. */
export function SportCard({ sport }) {
  const s = useStrings();
  const t = useT();
  return (
    <article className="card">
      <Photo sport={sport} />
      <h3>{sport.name}</h3>
      <p className="muted">{t(sport.shortDescription)}</p>
      <ScheduleLine sport={sport} />
      <div className="card__actions">
        <Link to={`/idretter/${sport.slug}`} className="btn btn--ghost">{s.sports.readMore}</Link>
        <SpondCta sport={sport} showQr={false} showHow={false} />
      </div>
    </article>
  );
}

/* Én linje med grunntider, eller «se Spond» når gruppa ikke har fast plan. */
export function ScheduleLine({ sport }) {
  const s = useStrings();
  if (sport.schedule.length === 0) {
    return <div className="card__meta"><span className="pill pill--teal">{s.sports.noSchedule} {s.sports.seeSpond}.</span></div>;
  }
  return (
    <div className="card__meta">
      {sport.schedule.map((slot, i) => (
        <span key={i}>{s.daysShort[slot.day]} {timeRange(slot)}</span>
      ))}
    </div>
  );
}

/* Full liste over økter for én gruppe (idrettssiden). */
export function SportSchedule({ sport }) {
  const s = useStrings();
  const t = useT();
  const lang = useLang();
  return (
    <div className="stack">
      {sport.schedule.length > 0 ? (
        <ul className="times">
          {sport.schedule.map((slot, i) => (
            <li key={i}>
              <b>{s.days[slot.day]}</b>
              <span>
                {timeRange(slot)}
                {slot.note && <> · {t(slot.note)}</>}
                <small>
                  {t(slot.venue || sport.venue)}
                  {slot.from_date && <> · {s.schedule.from} {fmtDate(slot.from_date, lang)}</>}
                </small>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{s.sports.noSchedule} {t(sport.scheduleNote)}</p>
      )}
      {sport.schedule.length > 0 && sport.scheduleNote && <p className="muted">{t(sport.scheduleNote)}</p>}
      <div className="notice notice--teal">{s.spond.truth}</div>
    </div>
  );
}

export function Steps({ steps, row = false }) {
  return (
    <ol className={`steps${row ? ' steps--row' : ''}`}>
      {steps.map(([title, body], i) => (
        <li key={i}><div><b>{title}</b><span>{body}</span></div></li>
      ))}
    </ol>
  );
}

export function PartnerGrid({ partners }) {
  const s = useStrings();
  const t = useT();
  return (
    <div className="partners">
      {partners.map((p) => {
        const inner = (
          <>
            <div className={`partner__logo${p.logo ? ' partner__logo--image' : ''}${p.logoBackground === 'dark' ? ' partner__logo--dark' : ''}`}>
              <PartnerLogo partner={p} />
            </div>
            <div className="partner__name">{p.name}</div>
            {p.status && s.partners[p.status] && <span className="pill pill--teal">{s.partners[p.status]}</span>}
            <div className="partner__desc">{t(p.description)}</div>
            {!p.logo && <span className="sr-only">{s.partners.logoPlaceholder}</span>}
          </>
        );
        return p.url ? (
          <a key={p.name} className="partner partner--link" href={p.url} target="_blank" rel="noopener noreferrer">{inner}</a>
        ) : (
          <div key={p.name} className="partner">{inner}</div>
        );
      })}
    </div>
  );
}

/* Offisiell logo når den finnes lokalt, ellers navnet som tekst. Feiler
   lasting, vises teksten i stedet for et brukket bilde. */
function PartnerLogo({ partner }) {
  const [failed, setFailed] = useState(false);
  if (partner.logo && !failed) {
    return <img src={partner.logo} alt={`${partner.name} logo`} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
  }
  return <span aria-hidden="true">{partner.shortName}</span>;
}
