import { useMemo, useState } from 'react';
import { Field } from '../Fields.jsx';
import { BLANK_EVENT, EVENT_KINDS, EVENT_KIND_LABEL } from '../schema.js';
import { db, toLocalInput, fromLocalInput } from '../api.jsx';
import { agenda, byDay, feedPath } from '../../lib/calendar.js';
import { PageTitle, Panel, SaveBar, useDraft, useToast, useConfirm, StatusPill, Empty, Menu, Tabs, fmtDateTime, fmtDay, nb, relTime } from '../ui.jsx';
import { FeedLink } from './Overview.jsx';

/* Kalender i admin: arrangementer og kamper (treningene styres per gruppe). */
export default function Calendar({ data, access, go, refresh }) {
  const [view, setView] = useState('kommende');
  const now = new Date();
  const events = data.events
    .filter((e) => access.isAdmin || access.canSee(e.sport_slug) || !e.sport_slug)
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  const upcoming = events.filter((e) => new Date(e.ends_at || e.starts_at) >= now);
  const past = events.filter((e) => new Date(e.ends_at || e.starts_at) < now).reverse();
  const today = now.toISOString().slice(0, 10);
  const in28 = new Date(Date.now() + 28 * 86400e3).toISOString().slice(0, 10);
  const full = byDay(agenda({ sports: data.sports.filter((s) => s.active), events, fromIso: today, toIso: in28 }));

  return (
    <>
      <PageTitle eyebrow="Innhold" title="Kalender" intro="Kamper, turneringer, sosialt og møter. Treningstidene ligger på hver gruppe og kommer automatisk med."
        actions={access.canEdit && <button type="button" className="btn btn--primary btn--sm" onClick={() => go('/kalender/ny')}>+ Nytt arrangement</button>} />
      <Tabs tabs={[['kommende', 'Kommende', upcoming.length], ['uke', 'Neste 4 uker'], ['tidligere', 'Tidligere', past.length], ['abonner', 'Abonnement']]} active={view} onChange={setView} />
      {view === 'kommende' && <EventTable events={upcoming} data={data} access={access} go={go} refresh={refresh} />}
      {view === 'tidligere' && <EventTable events={past} data={data} access={access} go={go} refresh={refresh} past />}
      {view === 'uke' && (
        <Panel title="Slik ser de neste fire ukene ut" intro="Dette er det publikum ser på /kalender og i abonnementet.">
          {full.length === 0 && <p className="muted">Ingenting planlagt.</p>}
          <div className="agenda">
            {full.map(({ day, items }) => (
              <div className="agenda__day" key={day}>
                <div className="agenda__date">{fmtDay(day)}</div>
                <ul>{items.map((it) => (
                  <li key={it.id} className={`agenda__item kind--${it.kind}${it.cancelled ? ' is-cancelled' : ''}`}>
                    <span className="agenda__time">{it.allDay ? 'Hele dagen' : `${it.start.toLocaleTimeString('nb-NO', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit' })}–${it.end.toLocaleTimeString('nb-NO', { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit' })}`}</span>
                    <span className="agenda__title">
                      {it.kind === 'training' ? `${it.sport.name} · trening` : <button type="button" className="linkish" onClick={() => go(`/kalender/${it.eventId}`)}>{it.sport ? `${it.sport.name}: ` : 'PSI: '}{nb(it.title)}</button>}
                      <span className="pill pill--kind">{it.kind === 'training' ? 'Trening' : EVENT_KIND_LABEL[it.kind] || it.kind}</span>
                      {it.venue && <span className="muted"> · {nb(it.venue)}</span>}
                    </span>
                  </li>
                ))}</ul>
              </div>
            ))}
          </div>
        </Panel>
      )}
      {view === 'abonner' && (
        <div className="adm__cols">
          <Panel title="Abonnementslenker" intro="Én lenke per gruppe, eller hele PSI. Lenkene oppdaterer seg selv når dere endrer tider eller legger inn arrangementer.">
            <ul className="list list--tight">
              <li><FeedLink path={feedPath([])} label="Hele PSI" /></li>
              {data.sports.filter((s) => s.active).map((sp) => <li key={sp.slug}><FeedLink path={feedPath([sp.slug])} label={sp.name} /></li>)}
            </ul>
          </Panel>
          <Panel title="Slik legger folk det inn">
            <ol className="steps-plain">
              <li><strong>Google Kalender (nett):</strong> Andre kalendere → + → Fra nettadresse → lim inn lenken.</li>
              <li><strong>iPhone/Mac:</strong> trykk «Abonner», så åpner Kalender seg.</li>
              <li><strong>Outlook:</strong> Legg til kalender → Abonner fra nettet.</li>
            </ol>
            <p className="hint muted">Kalenderprogrammene henter på nytt hver 6.–24. time, så endringer kommer med litt forsinkelse. Spond er fasiten for enkeltuker og står i hver post.</p>
          </Panel>
        </div>
      )}
    </>
  );
}

export function EventTable({ events, data, access, go, refresh, scope, past = false }) {
  const toast = useToast();
  const confirm = useConfirm();
  const sportName = (slug) => (slug ? data.sports.find((s) => s.slug === slug)?.name || slug : 'Hele PSI');
  async function setStatus(e, status) {
    const { error } = await db.saveEvent({ ...e, status });
    if (error) toast(error.message, 'error'); else { toast(status === 'cancelled' ? 'Merket som avlyst.' : status === 'published' ? 'Publisert.' : 'Lagret som utkast.'); refresh(); }
  }
  async function hide(e, hidden) {
    const { error } = await db.hideEvent(e.id, hidden);
    if (error) toast(error.message, 'error');
    else { toast(hidden ? 'Skjult på nettsiden. Den blir stående her.' : 'Vises på nettsiden igjen.'); refresh(); }
  }
  async function remove(e) {
    if (e.source === 'spond') {
      await confirm({ title: 'Slett i Spond i stedet', body: 'Denne kom fra Spond og blir hentet inn igjen ved neste kjøring. Slett den i Spond, eller velg «Skjul på nettsiden».', ok: 'Greit', cancel: 'Lukk' });
      return;
    }
    if (!(await confirm({ title: `Slette «${nb(e.title)}»?`, body: 'Er det avlyst, er «Merk som avlyst» bedre: da ser folk at det ikke skjer.', ok: 'Slett', danger: true }))) return;
    const { error } = await db.deleteEvent(e.id);
    if (error) toast(error.message, 'error'); else { toast('Slettet.'); refresh(); }
  }
  if (events.length === 0) {
    return <Empty title={past ? 'Ingen tidligere arrangementer' : 'Ingen arrangementer planlagt'} body={past ? undefined : 'Kamper, turneringer, kick-off, sosialt. Det som legges inn her går også ut i kalenderabonnementet.'}
      action={!past && access.canManage(scope) && <button type="button" className="btn btn--primary btn--sm" onClick={() => go(`/kalender/ny${scope ? `?gruppe=${scope}` : ''}`)}>+ Legg inn det første</button>} />;
  }
  return (
    <div className="table-wrap"><table className="table">
      <thead><tr><th>Når</th><th>Hva</th><th>Gjelder</th><th>Sted</th><th>Status</th><th></th></tr></thead>
      <tbody>{events.map((e) => {
        const can = access.canManage(e.sport_slug);
        return (
          <tr key={e.id} className={e.status === 'cancelled' ? 'is-cancelled' : ''}>
            <td className="nowrap">{e.all_day ? fmtDay(e.starts_at) : fmtDateTime(e.starts_at)}</td>
            <td>
              <button type="button" className="linkish table__title" onClick={() => go(`/kalender/${e.id}`)}>{nb(e.title) || <em className="muted">Uten tittel</em>}</button>
              {' '}<span className="pill pill--kind">{EVENT_KIND_LABEL[e.kind] || e.kind}</span>
              {e.source === 'spond' && <span className="pill pill--spond" title="Hentet fra Spond automatisk">Spond</span>}
              {e.hidden_by_admin && <span className="pill pill--warn">Skjult</span>}
            </td>
            <td>{sportName(e.sport_slug)}</td>
            <td className="muted">{e.venue}</td>
            <td><StatusPill status={e.status} /></td>
            <td className="table__actions">
              {can && <Menu items={[
                [e.source === 'spond' ? 'Se detaljer' : 'Rediger', () => go(`/kalender/${e.id}`)],
                e.source === 'spond' && ['Åpne i Spond', () => window.open(e.link_url, '_blank', 'noopener')],
                e.source !== 'spond' && e.status !== 'cancelled' && ['Merk som avlyst', () => setStatus(e, 'cancelled')],
                e.source !== 'spond' && e.status !== 'published' && ['Publiser', () => setStatus(e, 'published')],
                ['hidden_by_admin' in e && (e.hidden_by_admin ? 'Vis på nettsiden igjen' : 'Skjul på nettsiden'), () => hide(e, !e.hidden_by_admin)],
                ['Slett', () => remove(e), true],
              ].map((x) => (Array.isArray(x) && !x[0] ? false : x))} />}
            </td>
          </tr>
        );
      })}</tbody>
    </table></div>
  );
}

export function EventEditor({ id, data, access, go, refresh, content }) {
  const toast = useToast();
  const confirm = useConfirm();
  const isNew = id === 'ny';
  const existing = data.events.find((e) => e.id === id);
  const preset = new URLSearchParams(window.location.search).get('gruppe');
  const initial = useMemo(() => {
    if (!isNew) return existing;
    const opts = access.scopeOptions(data.sports);
    const start = new Date(); start.setDate(start.getDate() + 7); start.setHours(18, 0, 0, 0);
    const end = new Date(start.getTime() + 2 * 3600e3);
    return { ...BLANK_EVENT, sport_slug: preset || (opts[0]?.value || null) || null, starts_at: start.toISOString(), ends_at: end.toISOString() };
  }, [existing, isNew, access, data.sports, preset]);
  const { draft, setDraft, dirty, reset, markSaved } = useDraft(initial);
  const [busy, setBusy] = useState(false);
  if (!isNew && !existing) return <Empty title="Fant ikke arrangementet" action={<button type="button" className="btn btn--ghost btn--sm" onClick={() => go('/kalender')}>Til kalenderen</button>} />;
  const fromSpond = draft.source === 'spond';
  const canEdit = access.canManage(draft.sport_slug) && !fromSpond;
  const set = (k) => (v) => setDraft((d) => ({ ...d, [k]: v }));

  async function save() {
    if (!draft.title?.nb) { toast('Arrangementet trenger en norsk tittel.', 'error'); return; }
    if (!draft.starts_at) { toast('Når starter det?', 'error'); return; }
    if (draft.ends_at && draft.ends_at < draft.starts_at) { toast('Slutt må være etter start.', 'error'); return; }
    setBusy(true);
    const row = { ...draft, sport_slug: draft.sport_slug || null, link_url: draft.link_url || null, venue: draft.venue || null, ends_at: draft.ends_at || null };
    const { data: saved, error } = await db.saveEvent(row);
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    markSaved(saved || row);
    toast('Lagret. Kalenderen og abonnementet er oppdatert.');
    refresh(); content.reload();
    if (isNew) go(`/kalender/${saved?.id || ''}`);
  }
  async function remove() {
    if (!(await confirm({ title: 'Slette arrangementet?', body: 'Er det avlyst, sett status til «Avlyst» i stedet, så ser folk det.', ok: 'Slett', danger: true }))) return;
    const { error } = await db.deleteEvent(draft.id);
    if (error) toast(error.message, 'error'); else { toast('Slettet.'); refresh(); content.reload(); go('/kalender'); }
  }
  const sport = data.sports.find((s) => s.slug === draft.sport_slug);

  return (
    <fieldset disabled={!canEdit} className="fieldset">
      <PageTitle eyebrow={<button type="button" className="linkish" onClick={() => go('/kalender')}>← Kalender</button>} title={isNew ? 'Nytt arrangement' : nb(draft.title) || 'Uten tittel'}
        actions={<>
          <StatusPill status={draft.status} />
          {fromSpond && <a className="btn btn--ghost btn--sm" href={draft.link_url} target="_blank" rel="noopener noreferrer">Åpne i Spond ↗</a>}
        </>} />
      {fromSpond && (
        <div className="notice" style={{ marginBottom: 'var(--sp-4)' }}>
          <strong>Hentet fra Spond{draft.updated_at ? `, ${relTime(draft.updated_at)}` : ''}.</strong> Spond er fasiten, så feltene endres der, ikke her — nettsiden følger etter innen en time.
          Skal den vekk fra nettsiden nå, bruk «Skjul på nettsiden» i kalenderlista.
        </div>
      )}
      <div className="adm__cols adm__cols--wide">
        <div className="stack">
          <Panel title="Hva">
            <div className="form">
              <Field field={{ key: 'title', label: 'Tittel', type: 'bi', required: true }} value={draft.title} onChange={set('title')} />
              <div className="field">
                <label htmlFor="e-kind">Type</label>
                <select id="e-kind" value={draft.kind} onChange={(e) => set('kind')(e.target.value)}>{EVENT_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              </div>
              <Field field={{ key: 'description', label: 'Beskrivelse', type: 'bitext' }} value={draft.description} onChange={set('description')} />
              <Field field={{ key: 'venue', label: 'Sted', type: 'text', hint: sport ? `Tom = ${nb(sport.venue)}` : undefined }} value={draft.venue} onChange={set('venue')} />
              <Field field={{ key: 'link_url', label: 'Lenke til påmelding / Spond', type: 'url' }} value={draft.link_url} onChange={set('link_url')} />
            </div>
          </Panel>
        </div>
        <div className="stack">
          <Panel title="Når">
            <div className="form">
              <label className="check"><input type="checkbox" checked={draft.all_day} onChange={(e) => set('all_day')(e.target.checked)} />Hele dagen</label>
              <div className="field">
                <label htmlFor="e-start">Start</label>
                <input id="e-start" type={draft.all_day ? 'date' : 'datetime-local'} required value={draft.all_day ? toLocalInput(draft.starts_at).slice(0, 10) : toLocalInput(draft.starts_at)}
                  onChange={(e) => set('starts_at')(fromLocalInput(draft.all_day ? `${e.target.value}T00:00` : e.target.value))} />
              </div>
              <div className="field">
                <label htmlFor="e-end">Slutt</label>
                <input id="e-end" type={draft.all_day ? 'date' : 'datetime-local'} value={draft.ends_at ? (draft.all_day ? toLocalInput(draft.ends_at).slice(0, 10) : toLocalInput(draft.ends_at)) : ''}
                  onChange={(e) => set('ends_at')(e.target.value ? fromLocalInput(draft.all_day ? `${e.target.value}T00:00` : e.target.value) : null)} />
                <span className="hint">Tom = to timer.</span>
              </div>
            </div>
          </Panel>
          <Panel title="Publisering">
            <div className="form">
              <div className="field">
                <label htmlFor="e-scope">Gjelder</label>
                <select id="e-scope" value={draft.sport_slug || ''} onChange={(e) => set('sport_slug')(e.target.value || null)} disabled={!isNew && !access.isAdmin}>
                  {access.scopeOptions(data.sports).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="e-status">Status</label>
                <select id="e-status" value={draft.status} onChange={(e) => set('status')(e.target.value)}>
                  <option value="published">Publisert</option><option value="draft">Utkast (bare synlig her)</option><option value="cancelled">Avlyst (vises gjennomstreket)</option>
                </select>
              </div>
            </div>
          </Panel>
          {!isNew && canEdit && <Panel title="Farlig sone"><button type="button" className="btn btn--danger btn--sm" onClick={remove}>Slett arrangementet</button></Panel>}
        </div>
      </div>
      {!fromSpond && <SaveBar dirty={dirty || isNew} busy={busy} onSave={save} onReset={isNew ? undefined : reset} label={isNew ? 'Opprett' : 'Lagre endringer'} />}
    </fieldset>
  );
}
