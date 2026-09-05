import { Link } from '../lib/router.jsx';
import { useLang, useStrings, useT } from '../lib/i18n.jsx';
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

/* Bilde fra datafila, eller en tydelig plassholder til ekte PSI-bilder
   er på plass. Ingen genererte «medlemmer». */
export function Photo({ sport, hero = false }) {
  const s = useStrings();
  const t = useT();
  if (sport.image) {
    return (
      <div className={`photo${hero ? ' photo--hero' : ''}`}>
        <img src={sport.image} alt={`${sport.name}: ${t(sport.shortDescription)}`} loading={hero ? 'eager' : 'lazy'} />
      </div>
    );
  }
  return (
    <div className={`photo photo--placeholder${hero ? ' photo--hero' : ''}`} role="img" aria-label={s.sports.imagePlaceholder}>
      <span className="photo__icon" aria-hidden="true">{sport.icon}</span>
      <span className="photo__label">{s.sports.imagePlaceholder}</span>
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
            <div className="partner__logo">
              {p.logo ? <img src={p.logo} alt={`${p.name} logo`} loading="lazy" /> : <span aria-hidden="true">{p.shortName}</span>}
            </div>
            <div className="partner__name">{p.name}</div>
            <div className="partner__desc">{t(p.description)}</div>
            {!p.logo && <span className="sr-only">{s.partners.logoPlaceholder}</span>}
          </>
        );
        return p.url ? (
          <a key={p.name} className="partner partner--link" href={p.url} target="_blank" rel="noreferrer">{inner}</a>
        ) : (
          <div key={p.name} className="partner">{inner}</div>
        );
      })}
    </div>
  );
}
