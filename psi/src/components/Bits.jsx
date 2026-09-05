import { useState } from 'react';
import { Link } from '../lib/router.jsx';
import { useLang, useStrings, useT } from '../lib/i18n.jsx';
import { useContent } from '../lib/content.jsx';
import { paragraphs, timeRange, fmtDate } from '../lib/format.js';
import { SpondCta } from './Spond.jsx';
import { agenda, dayOf } from '../lib/calendar.js';

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
        {/* Idrettsmerket ligger oppå fotoet, som på et banner. Et lite
            mørkt slør under gjør det leselig uansett hva bildet viser. */}
        {sport.glyph && (
          <>
            <span className="photo__veil" aria-hidden="true" />
            <img className="photo__glyph photo__glyph--over" src={sport.glyph} alt="" aria-hidden="true" loading="lazy" />
          </>
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
  const til = `/idretter/${sport.slug}`;
  return (
    <article className="card">
      {/* Bildet peker samme sted som overskriften. Det holdes utenfor
          tabrekkefølgen, så tastaturet ikke må innom det samme tre ganger. */}
      <Link to={til} className="card__media" tabIndex={-1} aria-hidden="true"><Photo sport={sport} /></Link>
      <h3><Link to={til}>{sport.name}</Link></h3>
      <p className="muted">{t(sport.shortDescription)}</p>
      <ScheduleLine sport={sport} />
      <div className="card__actions">
        <Link to={til} className="btn btn--ghost">{s.sports.readMore}</Link>
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

/* De neste dagene for én gruppe eller hele PSI. Viser bare arrangementer
   (treningene står i ukeplanen), og ingenting hvis det ikke er noe. */
export function UpNext({ slug = null, inline = false, days = 21, includeTrainings = false, max = 5 }) {
  const { activeSports, events } = useContent();
  const s = useStrings();
  const t = useT();
  const lang = useLang();
  const from = dayOf(new Date());
  const to = dayOf(new Date(Date.now() + days * 86400e3));
  // Med slug tas gruppas egne poster med, og i tillegg alt som gjelder
  // hele PSI — et felles arrangement angår også volleyballspillerne.
  const items = agenda({ sports: activeSports, events, fromIso: from, toIso: to, slugs: slug ? [slug] : null, includeTrainings }).slice(0, max);
  if (items.length === 0) return null;
  const fmt = (d) => d.toLocaleString(lang === 'nb' ? 'nb-NO' : 'en-GB', { timeZone: 'Europe/Oslo', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const list = (
    <ul className="upnext">
      {items.map((it) => (
        <li key={it.id} className={`upnext__item kind--${it.kind}${it.cancelled ? ' is-cancelled' : ''}`}>
          <span className="upnext__when">{it.allDay ? fmtDate(dayOf(it.start), lang) : fmt(it.start)}</span>
          <span className="upnext__what">
            {!slug && it.sport && <Link to={`/idretter/${it.sport.slug}`}>{it.sport.icon} {it.sport.name}</Link>}{!slug && it.sport && ' · '}
            {/* På en gruppeside sier vi fra når posten gjelder hele PSI. */}
            {slug && !it.sport && <><span className="pill pill--orange">{s.news.wholePsi}</span>{' '}</>}
            <strong>{it.kind === 'training' && !t(it.title) ? s.calendar.kinds.training : t(it.title)}</strong>
            <span className="pill pill--kind">{s.calendar.kinds[it.kind] || it.kind}</span>
            {/* Hentet fra Spond, ikke fra grunnskjemaet. */}
            {it.fromSpond && <span className="pill pill--spond">Spond</span>}
            {it.cancelled && <span className="pill pill--danger">{s.calendar.cancelled}</span>}
            <small className="muted">{t(it.venue)}{it.url && <> · <a href={it.url} target="_blank" rel="noopener noreferrer">{s.calendar.link}</a></>}</small>
          </span>
        </li>
      ))}
    </ul>
  );
  if (inline) return <><h2 style={{ fontSize: 'var(--fs-xl)', marginTop: 'var(--sp-5)' }}>{s.upcoming.title}</h2>{list}<Link to="/kalender" className="more">{s.upcoming.seeAll} →</Link></>;
  return (
    <section className="section" style={{ paddingTop: 0 }}>
      <div className="wrap">
        <div className="section-head">
          <div><div className="eyebrow">{s.nav.calendar}</div><h2 style={{ fontSize: 'var(--fs-xl)' }}>{s.upcoming.title}</h2></div>
          <Link to="/kalender" className="btn btn--ghost btn--sm">{s.upcoming.seeAll}</Link>
        </div>
        {list}
      </div>
    </section>
  );
}

/* Bildegalleri fra opplastede bilder. Klikk åpner originalen i full størrelse. */
export function Gallery({ items }) {
  const t = useT();
  const s = useStrings();
  const [open, setOpen] = useState(null);
  if (!items?.length) return null;
  return (
    <>
      <div className="gallery">
        {items.map((m) => (
          <button type="button" key={m.id} className="gallery__item" onClick={() => setOpen(m)} aria-label={t(m.caption) || s.gallery.title}>
            <img src={m.web_url} alt={t(m.caption) || ''} loading="lazy" decoding="async" />
          </button>
        ))}
      </div>
      {open && (
        <dialog className="lightbox" open onClose={() => setOpen(null)} onClick={() => setOpen(null)}>
          <img src={open.web_url} alt={t(open.caption) || ''} />
          {(t(open.caption) || open.credit) && <p>{t(open.caption)}{open.credit && <span className="muted"> · {s.gallery.photo}: {open.credit}</span>}</p>}
        </dialog>
      )}
    </>
  );
}
