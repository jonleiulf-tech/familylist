import { useMemo, useState } from 'react';
import { Link } from '../lib/router.jsx';
import { useLang, useStrings, useT } from '../lib/i18n.jsx';
import { useContent } from '../lib/content.jsx';
import { agenda, byDay, feedPath, dayOf, webcal } from '../lib/calendar.js';
import { PageHead } from '../components/Bits.jsx';
import Schedule from './Schedule.jsx';

/* /kalender: kommende treninger og arrangementer, med filter og abonnement.
   Ukeplanen (/treningstider) vises som egen fane. */
export default function Calendar() {
  const { activeSports, events, site } = useContent();
  const s = useStrings();
  const t = useT();
  const lang = useLang();
  const [view, setView] = useState('upcoming');
  const [slugs, setSlugs] = useState([]);
  const [type, setType] = useState('all');
  const [weeks, setWeeks] = useState(4);

  const today = dayOf(new Date());
  const to = dayOf(new Date(Date.now() + weeks * 7 * 86400e3));
  // Tre kategorier, slik PSI tenker om det: trening, kamp/cup, og alt annet
  // (festival, julebord, høstfest, årsmøte) som arrangement.
  const kinds = { trainings: ['training'], matches: ['match'], events: ['event', 'social', 'meeting'] }[type] || null;
  const days = useMemo(() => byDay(agenda({ sports: activeSports, events, fromIso: today, toIso: to, slugs, kinds })), [activeSports, events, today, to, slugs, kinds]);
  const toggle = (slug) => setSlugs((cur) => (cur.includes(slug) ? cur.filter((x) => x !== slug) : [...cur, slug]));
  const fmtTime = (d) => d.toLocaleTimeString(lang === 'nb' ? 'nb-NO' : 'en-GB', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit' });
  const fmtDay = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(lang === 'nb' ? 'nb-NO' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <>
      <PageHead eyebrow={`${s.schedule.semester}: ${t(site.currentSemester)}`} title={s.calendar.title} intro={s.calendar.intro} />
      <section className="section" style={{ paddingTop: 'var(--sp-5)' }}>
        <div className="wrap">
          <div className="seg" role="group" aria-label={s.calendar.title}>
            {/* Ikke role=tablist: uten tabpanel, aria-controls og piltaster
                lover den et mønster den ikke holder. En knapperad med
                aria-pressed er ærligere og leses riktig. */}
            {[['upcoming', s.calendar.upcoming], ['week', s.calendar.week], ['subscribe', s.calendar.subscribe]].map(([k, l]) => (
              <button key={k} type="button" aria-pressed={view === k} className={view === k ? 'is-active' : ''} onClick={() => setView(k)}>{l}</button>
            ))}
          </div>
        </div>
      </section>

      {view === 'week' && <Schedule embedded />}

      {view === 'upcoming' && (
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="wrap split">
            <div className="stack">
              <div className="filters">
                <div className="chips" role="group" aria-label={s.calendar.pick}>
                  <button type="button" className={`chip${slugs.length === 0 ? ' is-active' : ''}`} aria-pressed={slugs.length === 0} onClick={() => setSlugs([])}>{s.calendar.all}</button>
                  {activeSports.map((sp) => <button key={sp.slug} type="button" className={`chip${slugs.includes(sp.slug) ? ' is-active' : ''}`} aria-pressed={slugs.includes(sp.slug)} onClick={() => toggle(sp.slug)}>{sp.icon} {t(sp.shortName)}</button>)}
                </div>
                <div className="chips" role="group" aria-label={s.calendar.allTypes}>
                  {[['all', s.calendar.allTypes], ['trainings', s.calendar.trainings], ['matches', s.calendar.matches], ['events', s.calendar.events]].map(([k, l]) => <button key={k} type="button" className={`chip chip--small${type === k ? ' is-active' : ''}`} aria-pressed={type === k} onClick={() => setType(k)}>{l}</button>)}
                </div>
              </div>
              {days.length === 0 && <div className="notice notice--teal">{s.calendar.empty}</div>}
              <div className="agenda agenda--public">
                {days.map(({ day, items }) => (
                  <div className="agenda__day" key={day}>
                    <div className="agenda__date">{fmtDay(day)}</div>
                    <ul>{items.map((it) => (
                      <li key={it.id} className={`agenda__item kind--${it.kind}${it.cancelled ? ' is-cancelled' : ''}`}>
                        <span className="agenda__time">{it.allDay ? s.calendar.allDay : <>{fmtTime(it.start)}<small>–{fmtTime(it.end)}</small></>}</span>
                        <span className="agenda__body">
                          <span className="agenda__title">
                            {it.sport ? <Link to={`/idretter/${it.sport.slug}`}>{it.sport.icon} {it.sport.name}</Link> : <strong>PSI</strong>}
                            {it.kind !== 'training' && <> · {t(it.title)}</>}
                            <span className="pill pill--kind">{s.calendar.kinds[it.kind] || it.kind}</span>
                            {it.fromSpond && <span className="pill pill--spond">Spond</span>}
                            {it.cancelled && <span className="pill pill--danger">{s.calendar.cancelled}</span>}
                          </span>
                          <span className="agenda__meta muted">
                            {t(it.venue)}{it.note && <> · {t(it.note)}</>}
                          </span>
                          {/* Beskrivelsene fra Spond er ofte lange. Fem linjer
                              her, resten leser man i Spond. */}
                          {t(it.description) && <span className="agenda__desc muted">{t(it.description)}</span>}
                          {/* Lenka står sist, der teksten slutter: har du lest
                              de fem linjene, er det nå du vil se resten. */}
                          {it.url && (
                            <a className="agenda__more" href={it.url} target="_blank" rel="noopener noreferrer">({s.calendar.link})</a>
                          )}
                        </span>
                      </li>
                    ))}</ul>
                  </div>
                ))}
              </div>
              {weeks < 12 && <div><button type="button" className="btn btn--ghost" onClick={() => setWeeks((w) => w + 4)}>{s.calendar.moreWeeks}</button></div>}
            </div>
            <aside className="aside">
              <div className="notice notice--teal">{s.spond.truth}</div>
              <SubscribeCard slugs={slugs} compact onShowHow={() => { setView('subscribe'); window.scrollTo({ top: 0 }); }} />
            </aside>
          </div>
        </section>
      )}

      {view === 'subscribe' && (
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="wrap split">
            <SubscribeCard slugs={slugs} onChange={setSlugs} />
            <aside className="aside">
              <div className="card">
                <div className="eyebrow">{s.calendar.howTitle}</div>
                <dl className="kv">
                  {s.calendar.how.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
                </dl>
                <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>{s.calendar.delay}</p>
              </div>
            </aside>
          </div>
        </section>
      )}
    </>
  );
}

export function SubscribeCard({ slugs, onChange, compact = false, onShowHow }) {
  const { activeSports, site } = useContent();
  const s = useStrings();
  const t = useT();
  const lang = useLang();
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== 'undefined' ? window.location.origin : site.domain;
  const path = feedPath(slugs) + (lang === 'en' ? '?lang=en' : '');
  const url = origin + path;
  const label = slugs.length === 0 ? s.calendar.wholePsi : slugs.map((x) => t(activeSports.find((sp) => sp.slug === x)?.shortName) || x).join(' + ');
  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { window.prompt(s.calendar.copy, url); }
  }
  return (
    <div className="card">
      <div className="eyebrow">{s.calendar.subscribeTitle}</div>
      {!compact && <p className="muted">{s.calendar.subscribeBody}</p>}
      {onChange && (
        <div className="chips">
          <button type="button" className={`chip${slugs.length === 0 ? ' is-active' : ''}`} onClick={() => onChange([])}>{s.calendar.wholePsi}</button>
          {activeSports.map((sp) => <button key={sp.slug} type="button" className={`chip${slugs.includes(sp.slug) ? ' is-active' : ''}`} aria-pressed={slugs.includes(sp.slug)} onClick={() => onChange(slugs.includes(sp.slug) ? slugs.filter((x) => x !== sp.slug) : [...slugs, sp.slug])}>{sp.icon} {t(sp.shortName)}</button>)}
        </div>
      )}
      <div className="spond__code">
        <div><div className="spond__label">{label}</div><div className="feed-url">{url.replace(/^https?:\/\//, '')}</div></div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={copy} aria-live="polite">{copied ? s.calendar.copied : s.calendar.copy}</button>
      </div>
      <a className="btn btn--primary" href={webcal(url)}>{s.calendar.subscribeButton} →</a>
      {compact && onShowHow && <button type="button" className="more linkish" onClick={onShowHow}>{s.calendar.howTitle} →</button>}
    </div>
  );
}
