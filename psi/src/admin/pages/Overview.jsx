import { Link } from '../../lib/router.jsx';
import { agenda, byDay, feedPath } from '../../lib/calendar.js';
import { PageTitle, Panel, Stat, StatusPill, relTime, nb } from '../ui.jsx';
import { EVENT_KIND_LABEL } from '../schema.js';
import { fmtDay } from '../ui.jsx';

/* Startsiden i admin: hva skjer, hva mangler, hvor trykker jeg. */
export default function Overview({ data, access, go, me }) {
  const sports = access.visibleSports(data.sports);
  const mine = (slug) => access.canManage(slug);
  const today = new Date().toISOString().slice(0, 10);
  const in14 = new Date(Date.now() + 14 * 86400e3).toISOString().slice(0, 10);
  const upcoming = byDay(agenda({ sports: data.sports.filter((s) => s.active), events: data.events, fromIso: today, toIso: in14, slugs: access.isAdmin ? null : [...access.leaderOf, ...access.memberOf] }));
  const drafts = data.news.filter((n) => n.status === 'draft' && mine(n.sport_slug));
  const published = data.news.filter((n) => n.status === 'published');
  const futureEvents = data.events.filter((e) => e.status !== 'draft' && new Date(e.starts_at) >= new Date() && (access.isAdmin || mine(e.sport_slug) || !e.sport_slug));
  const images = data.media.filter((m) => access.isAdmin || mine(m.sport_slug));

  const todo = [];
  for (const sp of sports.filter((s) => mine(s.slug))) {
    if (!sp.active) continue;
    if ((sp.schedule || []).length === 0) todo.push([`${sp.name} har ingen treningstider`, `/grupper/${sp.slug}/tider`]);
    if (!sp.spondInviteUrl) todo.push([`${sp.name} mangler Spond-lenke (bare kode vises)`, `/grupper/${sp.slug}/info`]);
    if (!data.media.some((m) => m.sport_slug === sp.slug && m.is_cover)) todo.push([`${sp.name} har ikke eget gruppebilde`, `/grupper/${sp.slug}/bilder`]);
  }
  for (const n of drafts) if (Date.now() - new Date(n.updated_at || n.published_at) > 7 * 86400e3) todo.push([`Utkastet «${nb(n.title)}» har ligget over en uke`, `/nyheter/${n.id}`]);
  if (access.isAdmin && data.members.filter((m) => m.role === 'psi_admin').length < 2) todo.push(['Bare én PSI-admin. Legg til en til, så ingen blir låst ute.', '/tilgang']);

  const recent = [...data.sports.map((s) => ({ t: s.updated_at, who: s.updated_by, what: s.name, to: `/grupper/${s.slug}` })),
    ...data.news.map((n) => ({ t: n.updated_at, who: n.updated_by, what: `Nyhet: ${nb(n.title)}`, to: `/nyheter/${n.id}` })),
    ...data.events.map((e) => ({ t: e.updated_at, who: e.updated_by, what: `${EVENT_KIND_LABEL[e.kind] || 'Arrangement'}: ${nb(e.title)}`, to: `/kalender/${e.id}` })),
    ...Object.values(data.content).map((c) => ({ t: c.updated_at, who: c.updated_by, what: { site: 'Nettstedet', organization: 'Organisasjonen', stats: 'Tall', partners: 'Partnere' }[c.key] || c.key, to: c.key === 'partners' ? '/partnere' : '/innstillinger' }))]
    .filter((x) => x.t).sort((a, b) => new Date(b.t) - new Date(a.t)).slice(0, 8);

  const hour = new Date().getHours();
  const hi = hour < 10 ? 'God morgen' : hour < 17 ? 'Hei' : 'God kveld';

  return (
    <>
      <PageTitle
        eyebrow="Oversikt"
        title={`${hi}, ${(access.name || me).split(/[ @]/)[0]}.`}
        intro="Alt du endrer her vises på psiusn.no med én gang du lagrer. Spond er fortsatt fasiten for den enkelte uka."
        actions={access.canEdit && (
          <>
            <button type="button" className="btn btn--primary btn--sm" onClick={() => go('/nyheter/ny')}>+ Nyhet</button>
            <button type="button" className="btn btn--dark btn--sm" onClick={() => go('/kalender/ny')}>+ Arrangement</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => go('/bilder')}>Last opp bilde</button>
          </>
        )}
      />

      <div className="stats">
        <Stat value={sports.filter((s) => s.active).length} label="aktive grupper" onClick={() => go(sports[0] ? `/grupper/${sports[0].slug}` : '')} />
        <Stat value={futureEvents.length} label="kommende arrangementer" onClick={() => go('/kalender')} />
        <Stat value={published.length} label="publiserte nyheter" hint={drafts.length ? `${drafts.length} utkast` : undefined} onClick={() => go('/nyheter')} />
        <Stat value={images.length} label="bilder" onClick={() => go('/bilder')} />
      </div>

      <div className="adm__cols adm__cols--wide">
        <div className="stack">
          <Panel title="Neste 14 dager" intro="Treninger fra grunnskjemaet og arrangementer fra kalenderen." actions={<Link to="/kalender" className="btn btn--ghost btn--sm">Se kalenderen</Link>}>
            {upcoming.length === 0 && <p className="muted">Ingenting planlagt. Legg inn treningstider på gruppene, eller et arrangement.</p>}
            <div className="agenda agenda--compact">
              {upcoming.map(({ day, items }) => (
                <div className="agenda__day" key={day}>
                  <div className="agenda__date">{fmtDay(day)}</div>
                  <ul>
                    {items.map((it) => (
                      <li key={it.id} className={`agenda__item kind--${it.kind}${it.cancelled ? ' is-cancelled' : ''}`}>
                        <span className="agenda__time">{it.allDay ? 'Hele dagen' : it.start.toLocaleTimeString('nb-NO', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit' })}</span>
                        <span className="agenda__title">
                          {it.kind === 'training' ? `${it.sport.name} · trening` : <button type="button" className="linkish" onClick={() => go(`/kalender/${it.eventId}`)}>{it.sport ? `${it.sport.name}: ` : 'PSI: '}{nb(it.title)}</button>}
                          {it.kind !== 'training' && <span className="pill pill--kind">{EVENT_KIND_LABEL[it.kind] || it.kind}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Grupper" intro={access.isAdmin ? 'Alle gruppene. Klikk for å redigere.' : 'Gruppene du har tilgang til.'}>
            <div className="tiles">
              {sports.map((sp) => {
                const n = data.news.filter((x) => x.sport_slug === sp.slug).length;
                const ev = data.events.filter((x) => x.sport_slug === sp.slug && new Date(x.starts_at) >= new Date()).length;
                const img = data.media.filter((x) => x.sport_slug === sp.slug).length;
                return (
                  <button type="button" key={sp.slug} className="tile" onClick={() => go(`/grupper/${sp.slug}`)}>
                    <div className="tile__head"><span className="tile__icon" aria-hidden="true">{sp.icon}</span><strong>{sp.name}</strong><StatusPill status={sp.active ? 'active' : 'inactive'} /></div>
                    <div className="tile__meta">{sp.leader} · {sp.spondCode}</div>
                    <div className="tile__facts">
                      <span>{(sp.schedule || []).length} økter</span><span>{ev} arr.</span><span>{n} nyheter</span><span>{img}/30 bilder</span>
                    </div>
                    {!mine(sp.slug) && <div className="tile__meta">Bare lesing</div>}
                  </button>
                );
              })}
            </div>
          </Panel>
        </div>

        <div className="stack">
          {todo.length > 0 && (
            <Panel title="Verdt å ta tak i" className="panel--warn">
              <ul className="list list--tight">
                {todo.map(([text, to]) => <li key={text}><button type="button" className="linkish" onClick={() => go(to)}>{text}</button></li>)}
              </ul>
            </Panel>
          )}
          <Panel title="Kalenderabonnement" intro="Del lenkene, så får folk treninger og arrangementer rett i Google Kalender, Outlook eller iPhone.">
            <ul className="list list--tight">
              <li><FeedLink path={feedPath([])} label="Hele PSI" /></li>
              {sports.filter((s) => s.active).map((sp) => <li key={sp.slug}><FeedLink path={feedPath([sp.slug])} label={sp.name} /></li>)}
            </ul>
            <p className="hint muted">Flere grupper i én: <code>/api/kalender/fotball+klatring.ics</code>. Publikum finner det samme under «Abonner» på /kalender.</p>
          </Panel>
          {recent.length > 0 && (
            <Panel title="Sist endret">
              <ul className="list list--tight">
                {recent.map((x, i) => (
                  <li key={i}><button type="button" className="linkish" onClick={() => go(x.to)}>{x.what}</button><span className="muted"> · {relTime(x.t)}{x.who ? ` · ${x.who.split('@')[0]}` : ''}</span></li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}

export function FeedLink({ path, label }) {
  const abs = `${window.location.origin}${path}`;
  const copy = async (e) => {
    const btn = e.currentTarget;
    try { await navigator.clipboard.writeText(abs); btn.textContent = 'Kopiert'; setTimeout(() => { btn.textContent = 'Kopier'; }, 1500); } catch { window.prompt('Kopier adressen', abs); }
  };
  return (
    <span className="feedlink">
      <span>{label}</span>
      <span className="feedlink__actions">
        <a className="btn btn--ghost btn--sm" href={abs.replace(/^https?:\/\//, 'webcal://')}>Abonner</a>
        <button type="button" className="btn btn--ghost btn--sm" onClick={copy}>Kopier</button>
      </span>
    </span>
  );
}
