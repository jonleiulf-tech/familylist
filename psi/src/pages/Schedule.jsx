import { Link } from '../lib/router.jsx';
import { useLang, useStrings, useT } from '../lib/i18n.jsx';
import { useContent } from '../lib/content.jsx';
import { fmtDate, timeRange } from '../lib/format.js';
import { PageHead } from '../components/Bits.jsx';
import { SpondCode } from '../components/Spond.jsx';

/* /treningstider: hele uka fra én datastruktur (weeklySchedule i psi.js). */
export default function Schedule() {
  const { weeklySchedule, activeSports, site } = useContent();
  const s = useStrings();
  const t = useT();
  const lang = useLang();
  const rows = weeklySchedule();
  const days = [...new Set(rows.map((r) => r.day))];
  const flexible = activeSports.filter((sp) => sp.schedule.length === 0);

  return (
    <>
      <PageHead eyebrow={`${s.schedule.semester}: ${t(site.currentSemester)}`} title={s.schedule.title} intro={s.schedule.intro} />
      <section className="section">
        <div className="wrap split">
          <div className="week">
            {days.map((d) => (
              <div className="day" key={d}>
                <div className="day__head">{s.days[d]}</div>
                {rows.filter((r) => r.day === d).map((r, i) => (
                  <div className="slot" key={i}>
                    <div className="slot__time">{timeRange(r)}</div>
                    <div>
                      <Link to={`/idretter/${r.sport.slug}`} className="slot__sport">{r.sport.icon} {r.sport.name}</Link>
                      <div className="slot__meta">
                        {t(r.venue || r.sport.venue)}
                        {r.note && <> · {t(r.note)}</>}
                        {r.from_date && <> · {s.schedule.from} {fmtDate(r.from_date, lang)}</>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
            {flexible.length > 0 && (
              <div className="day">
                <div className="day__head" style={{ background: 'var(--teal)' }}>{s.schedule.flexible}</div>
                <div style={{ padding: 'var(--sp-3) var(--sp-4)' }} className="muted">{s.schedule.flexibleBody}</div>
                {flexible.map((sp) => (
                  <div className="slot" key={sp.slug}>
                    <div className="slot__time">Spond</div>
                    <div>
                      <Link to={`/idretter/${sp.slug}`} className="slot__sport">{sp.icon} {sp.name}</Link>
                      <div className="slot__meta">{t(sp.scheduleNote)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <aside className="aside">
            <div className="notice notice--teal">{s.spond.truth}</div>
            <div className="card">
              <div className="eyebrow">Spond</div>
              <p className="muted">{s.spond.unregister}</p>
              <div className="stack">
                {activeSports.map((sp) => <SpondCode key={sp.slug} code={sp.spondCode} label={sp.name} />)}
              </div>
              <Link to="/bli-med" className="btn btn--primary">{s.spond.join}</Link>
            </div>
            <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>{s.schedule.updated}: {fmtDate(site.lastUpdated, lang)}</p>
          </aside>
        </div>
      </section>
    </>
  );
}
