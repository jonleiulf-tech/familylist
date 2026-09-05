import { useMemo, useState } from 'react';
import { Link } from '../../lib/router.jsx';
import { Field } from '../Fields.jsx';
import { BLANK_NEWS } from '../schema.js';
import { db, slugify, toLocalInput, fromLocalInput } from '../api.jsx';
import { PageTitle, Panel, SaveBar, useDraft, useToast, useConfirm, StatusPill, Empty, Menu, fmtDateTime, relTime, nb } from '../ui.jsx';
import { ImagePicker } from './Media.jsx';

/* Nyheter: liste + redigering. En nyhet hører til hele PSI eller én gruppe. */
export default function NewsList({ data, access, go, refresh }) {
  const [filter, setFilter] = useState('alle');
  const news = data.news.filter((n) => access.isAdmin || access.canSee(n.sport_slug) || !n.sport_slug);
  const shown = news.filter((n) => (
    filter === 'alle' ? true
      : filter === 'utkast' ? n.status === 'draft'
      : filter === 'spond' ? n.source === 'spond'
      : filter === 'psi' ? !n.sport_slug
      : n.sport_slug === filter));
  return (
    <>
      <PageTitle eyebrow="Innhold" title="Nyheter" intro="Korte oppdateringer: semesterstart, turneringer, nye tider, sosialt. Publiserte nyheter vises på /nyheter, på gruppesiden og (om du vil) på forsiden."
        actions={access.canEdit && <button type="button" className="btn btn--primary btn--sm" onClick={() => go('/nyheter/ny')}>+ Ny nyhet</button>} />
      <div className="chips" role="group" aria-label="Filter">
        {[['alle', 'Alle'], ['utkast', `Utkast (${news.filter((n) => n.status === 'draft').length})`],
          ...(news.some((n) => n.source === 'spond') ? [['spond', `Fra Spond (${news.filter((n) => n.source === 'spond').length})`]] : []),
          ...(access.isAdmin ? [['psi', 'Hele PSI']] : []), ...access.visibleSports(data.sports).map((s) => [s.slug, s.name.replace(/^PSI\s+/, '')])]
          .map(([k, l]) => <button key={k} type="button" className={`chip${filter === k ? ' is-active' : ''}`} onClick={() => setFilter(k)}>{l}</button>)}
      </div>
      <NewsTable news={shown} data={data} access={access} go={go} refresh={refresh} />
    </>
  );
}

export function NewsTable({ news, data, access, go, refresh, scope }) {
  const toast = useToast();
  const confirm = useConfirm();
  const sportName = (slug) => (slug ? data.sports.find((s) => s.slug === slug)?.name || slug : 'Hele PSI');
  async function toggle(n) {
    const status = n.status === 'published' ? 'draft' : 'published';
    const { error } = await db.setNewsStatus(n.id, status);
    if (error) toast(error.message, 'error'); else { toast(status === 'published' ? 'Publisert på nettsiden.' : 'Tatt ned som utkast.'); refresh(); }
  }
  async function hide(n, hidden) {
    const { error } = await db.hideNews(n.id, hidden);
    if (error) toast(error.message, 'error');
    else { toast(hidden ? 'Skjult på nettsiden.' : 'Vises på nettsiden igjen.'); refresh(); }
  }
  async function remove(n) {
    const fraSpond = n.source === 'spond';
    if (!(await confirm({
      title: `Slette «${nb(n.title)}»?`,
      body: fraSpond
        ? 'Denne kom fra Spond. Er innlegget fortsatt der, hentes det inn igjen som utkast ved neste kjøring. Vil du bare ha det vekk fra nettsiden, bruk «Skjul på nettsiden».'
        : 'Kan ikke angres.',
      ok: 'Slett', danger: true,
    }))) return;
    const { error } = await db.deleteNews(n.id);
    if (error) toast(error.message, 'error'); else { toast('Slettet.'); refresh(); }
  }
  if (news.length === 0) {
    return <Empty title="Ingen nyheter her ennå" body="En nyhet trenger bare en tittel og et par setninger. Engelsk kan fylles inn etterpå."
      action={access.canManage(scope) && <button type="button" className="btn btn--primary btn--sm" onClick={() => go(`/nyheter/ny${scope ? `?gruppe=${scope}` : ''}`)}>+ Skriv den første</button>} />;
  }
  return (
    <div className="table-wrap"><table className="table">
      <thead><tr><th>Tittel</th><th>Gjelder</th><th>Status</th><th>Dato</th><th></th></tr></thead>
      <tbody>{news.map((n) => {
        const can = access.canManage(n.sport_slug);
        return (
          <tr key={n.id}>
            <td>
              <button type="button" className="linkish table__title" onClick={() => go(`/nyheter/${n.id}`)}>{nb(n.title) || <em className="muted">Uten tittel</em>}</button>
              {n.source === 'spond' && <span className="pill pill--spond" title="Hentet fra et innlegg i Spond">Spond</span>}
              {!n.title?.en && n.source !== 'spond' && <span className="pill pill--warn" title="Mangler engelsk">EN</span>}
              {n.hidden_by_admin && <span className="pill pill--warn">Skjult</span>}
            </td>
            <td>{sportName(n.sport_slug)}</td>
            <td><StatusPill status={n.status} /></td>
            <td className="muted">{fmtDateTime(n.published_at)}</td>
            <td className="table__actions">
              {can && <Menu items={[
                [n.source === 'spond' ? 'Les og publiser' : 'Rediger', () => go(`/nyheter/${n.id}`)],
                [n.status === 'published' ? 'Ta ned (utkast)' : 'Publiser på nettsiden', () => toggle(n)],
                'hidden_by_admin' in n && [n.hidden_by_admin ? 'Vis på nettsiden igjen' : 'Skjul på nettsiden', () => hide(n, !n.hidden_by_admin)],
                n.status === 'published' && !n.hidden_by_admin && ['Se på nettsiden', () => window.open(`/nyheter/${n.slug}`, '_blank')],
                ['Slett', () => remove(n), true],
              ].map((x) => (Array.isArray(x) && !x[0] ? false : x))} />}
            </td>
          </tr>
        );
      })}</tbody>
    </table></div>
  );
}

export function NewsEditor({ id, data, access, go, refresh, content }) {
  const toast = useToast();
  const confirm = useConfirm();
  const isNew = id === 'ny';
  const existing = data.news.find((n) => n.id === id);
  const preset = new URLSearchParams(window.location.search).get('gruppe');
  const initial = useMemo(() => {
    if (!isNew) return existing;
    const opts = access.scopeOptions(data.sports);
    return { ...BLANK_NEWS, sport_slug: preset || (opts[0]?.value || null) || null, published_at: new Date().toISOString() };
  }, [existing, isNew, access, data.sports, preset]);
  const { draft, setDraft, dirty, reset, markSaved } = useDraft(initial);
  const [busy, setBusy] = useState(false);
  const [slugTouched, setSlugTouched] = useState(!isNew);

  if (!isNew && !existing) return <Empty title="Fant ikke nyheten" action={<button type="button" className="btn btn--ghost btn--sm" onClick={() => go('/nyheter')}>Til nyhetene</button>} />;
  const fromSpond = draft.source === 'spond';
  const canEdit = access.canManage(draft.sport_slug);
  const set = (k) => (v) => setDraft((d) => ({ ...d, [k]: v }));
  const setTitle = (v) => setDraft((d) => ({ ...d, title: v, slug: slugTouched ? d.slug : slugify(v.nb) }));

  async function save(status = draft.status) {
    if (!draft.title?.nb) { toast('Nyheten trenger en norsk tittel.', 'error'); return; }
    const slug = draft.slug || slugify(draft.title.nb);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) { toast('Adressen må være små bokstaver, tall og bindestrek.', 'error'); return; }
    if (data.news.some((n) => n.slug === slug && n.id !== draft.id)) { toast('En annen nyhet har allerede denne adressen.', 'error'); return; }
    setBusy(true);
    const row = { ...draft, slug, status, sport_slug: draft.sport_slug || null, link_url: draft.link_url || null, image_id: draft.image_id || null };
    const { data: saved, error } = await db.saveNews(row);
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    markSaved(saved || row);
    toast(status === 'published' ? 'Publisert på nettsiden.' : 'Lagret som utkast.');
    refresh(); content.reload();
    if (isNew) go(`/nyheter/${saved?.id || ''}`);
  }
  async function remove() {
    if (!(await confirm({ title: 'Slette nyheten?', body: 'Kan ikke angres.', ok: 'Slett', danger: true }))) return;
    const { error } = await db.deleteNews(draft.id);
    if (error) toast(error.message, 'error'); else { toast('Slettet.'); refresh(); content.reload(); go('/nyheter'); }
  }

  const image = data.media.find((m) => m.id === draft.image_id);
  return (
    <fieldset disabled={!canEdit} className="fieldset">
      <PageTitle eyebrow={<button type="button" className="linkish" onClick={() => go('/nyheter')}>← Nyheter</button>} title={isNew ? 'Ny nyhet' : nb(draft.title) || 'Uten tittel'}
        actions={<>
          <StatusPill status={draft.status} />
          {!isNew && draft.status === 'published' && <Link to={`/nyheter/${draft.slug}`} className="btn btn--ghost btn--sm" target="_blank" rel="noopener">Se ↗</Link>}
        </>} />
      {fromSpond && (
        <div className="notice" style={{ marginBottom: 'var(--sp-4)' }}>
          <strong>Hentet fra et innlegg i Spond{draft.updated_at ? `, ${relTime(draft.updated_at)}` : ''}.</strong>{' '}
          {draft.status === 'draft'
            ? 'Det ligger som utkast til noen har lest gjennom. Les teksten, rett det som ikke passer på en åpen nettside, og trykk publiser.'
            : 'Det er publisert på psiusn.no. Endringer du gjør her blir stående; synken rører ikke teksten etter at den er hentet inn.'}
        </div>
      )}
      <div className="adm__cols adm__cols--wide">
        <div className="stack">
          <Panel title="Innhold">
            <div className="form">
              <Field field={{ key: 'title', label: 'Tittel', type: 'bi', required: true }} value={draft.title} onChange={setTitle} />
              <Field field={{ key: 'lead', label: 'Ingress (én–to setninger)', type: 'bitext' }} value={draft.lead} onChange={set('lead')} />
              <Field field={{ key: 'body', label: 'Tekst', type: 'bitext', hint: 'Tom linje gir nytt avsnitt. Lenker skrives som vanlig adresse.' }} value={draft.body} onChange={set('body')} />
              <Field field={{ key: 'link_url', label: 'Lenke (valgfritt)', type: 'url', hint: 'F.eks. Spond-arrangementet eller påmelding. Vises som knapp.' }} value={draft.link_url} onChange={set('link_url')} />
            </div>
          </Panel>
          <Panel title="Bilde" intro="Velg blant bildene som er lastet opp. Nye lastes opp under Bilder.">
            <ImagePicker media={data.media.filter((m) => !draft.sport_slug || m.sport_slug === draft.sport_slug || !m.sport_slug)} value={draft.image_id} onChange={set('image_id')} />
            {image && <p className="hint muted">{nb(image.caption) || image.path.split('/').pop()}</p>}
          </Panel>
        </div>
        <div className="stack">
          <Panel title="Publisering">
            <div className="form">
              <div className="field">
                <label htmlFor="n-scope">Gjelder</label>
                <select id="n-scope" value={draft.sport_slug || ''} onChange={(e) => set('sport_slug')(e.target.value || null)} disabled={!isNew && !access.isAdmin}>
                  {access.scopeOptions(data.sports).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="n-date">Dato</label>
                <input id="n-date" type="datetime-local" value={toLocalInput(draft.published_at)} onChange={(e) => set('published_at')(fromLocalInput(e.target.value) || new Date().toISOString())} />
                <span className="hint">Nyheter sorteres etter denne. Sett fram i tid for å planlegge.</span>
              </div>
              <div className="field">
                <label htmlFor="n-slug">Adresse</label>
                <input id="n-slug" value={draft.slug || ''} onChange={(e) => { setSlugTouched(true); set('slug')(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); }} />
                <span className="hint">psiusn.no/nyheter/{draft.slug || '…'}</span>
              </div>
              <label className="check"><input type="checkbox" checked={Boolean(draft.show_on_home)} onChange={(e) => set('show_on_home')(e.target.checked)} />Vis på forsiden</label>
            </div>
          </Panel>
          {!isNew && canEdit && <Panel title="Farlig sone"><button type="button" className="btn btn--danger btn--sm" onClick={remove}>Slett nyheten</button></Panel>}
        </div>
      </div>
      <SaveBar dirty={dirty || isNew} busy={busy} onSave={() => save()} onReset={isNew ? undefined : reset}
        label={draft.status === 'published' ? 'Lagre og publiser' : 'Lagre utkast'}
        extra={draft.status !== 'published' && <button type="button" className="btn btn--dark btn--sm" disabled={busy} onClick={() => save('published')}>Publiser nå</button>} />
    </fieldset>
  );
}
