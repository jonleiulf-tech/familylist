import { useMemo, useState } from 'react';
import { Link } from '../../lib/router.jsx';
import { Form } from '../Fields.jsx';
import { SPORT_SECTIONS, SPORT_ADMIN_FIELDS, SPORT_TIME_FIELDS, BLANK_SPORT } from '../schema.js';
import { db } from '../api.jsx';
import { PageTitle, Panel, Tabs, SaveBar, useDraft, useToast, useConfirm, StatusPill, Empty, nb } from '../ui.jsx';
import { NewsTable } from './News.jsx';
import { EventTable } from './Calendar.jsx';
import { MediaGrid } from './Media.jsx';
import { MemberTable } from './Access.jsx';
import { expandTrainings, dayOf, isoDay, osloParts, spondDays } from '../../lib/calendar.js';

const DAYS = ['', 'Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
const VISER_DAGER = 120;

const tidspunkt = (ø) => {
  const p = (d) => `${String(osloParts(d).h).padStart(2, '0')}:${String(osloParts(d).mi).padStart(2, '0')}`;
  return `${p(ø.start)}–${p(ø.end)}`;
};

const fmtDag = (iso) => {
  const [y, m, d] = iso.split('-');
  return `${Number(d)}. ${['jan', 'feb', 'mars', 'april', 'mai', 'juni', 'juli', 'aug', 'sep', 'okt', 'nov', 'des'][Number(m) - 1]} ${y}`;
};

/* Én gruppe, alt på ett sted: info, tider, nyheter, arrangementer, bilder, folk. */
export default function Group({ slug, tab, data, access, go, refresh, content, me }) {
  const isNew = slug === 'ny';
  const sport = data.sports.find((s) => s.slug === slug);
  if (!isNew && !sport) return <Empty title="Fant ikke gruppa" body={`Ingen gruppe har adressen «${slug}».`} action={<button type="button" className="btn btn--ghost btn--sm" onClick={() => go('')}>Til oversikten</button>} />;
  if (isNew && !access.isAdmin) return <Empty title="Bare PSI-admin kan lage nye grupper" />;
  const canEdit = isNew || access.canManage(slug);

  const tabs = [
    ['info', 'Info'], ['tider', 'Treningstider', (sport?.schedule || []).length],
    ...(isNew ? [] : [
      ['nyheter', 'Nyheter', data.news.filter((n) => n.sport_slug === slug).length],
      ['arrangementer', 'Arrangementer', data.events.filter((e) => e.sport_slug === slug && new Date(e.starts_at) >= new Date()).length],
      ['bilder', 'Bilder', data.media.filter((m) => m.sport_slug === slug).length],
      ['folk', 'Folk', data.members.filter((m) => m.sport_slug === slug).length],
    ]),
  ];

  return (
    <>
      <PageTitle
        eyebrow={isNew ? 'Ny gruppe' : `Gruppe · ${sport.spondCode}`}
        title={isNew ? 'Ny idrettsgruppe' : <>{sport.icon} {sport.name} {!sport.active && <StatusPill status="inactive" />}</>}
        intro={isNew ? 'Fyll inn det viktigste. Resten kan komme senere.' : `${sport.leader} · ${sport.email}${canEdit ? '' : ' · bare lesing'}`}
        actions={!isNew && <Link to={`/idretter/${slug}`} className="btn btn--ghost btn--sm" target="_blank" rel="noopener">Se siden ↗</Link>}
      />
      <Tabs tabs={tabs} active={tab} onChange={(k) => go(`/grupper/${slug}/${k}`)} />
      {(tab === 'info' || isNew) && <InfoTab sport={sport} isNew={isNew} canEdit={canEdit} access={access} data={data} refresh={refresh} content={content} go={go} />}
      {tab === 'tider' && !isNew && <TimesTab sport={sport} canEdit={canEdit} refresh={refresh} content={content} events={data.events} />}
      {tab === 'nyheter' && !isNew && <NewsTable news={data.news.filter((n) => n.sport_slug === slug)} data={data} access={access} go={go} refresh={refresh} scope={slug} />}
      {tab === 'arrangementer' && !isNew && <EventTable events={data.events.filter((e) => e.sport_slug === slug)} data={data} access={access} go={go} refresh={refresh} scope={slug} />}
      {tab === 'bilder' && !isNew && <MediaGrid slug={slug} data={data} access={access} refresh={refresh} me={me} content={content} />}
      {tab === 'folk' && !isNew && <MemberTable members={data.members.filter((m) => m.sport_slug === slug)} data={data} access={access} refresh={refresh} scope={slug} me={me} />}
    </>
  );
}

function InfoTab({ sport, isNew, canEdit, access, data, refresh, content, go }) {
  const toast = useToast();
  const confirm = useConfirm();
  const initial = useMemo(() => (isNew ? { slug: '', ...BLANK_SPORT, active: true } : sport), [sport, isNew]);
  const { draft, setDraft, dirty, reset, markSaved } = useDraft(initial);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(draft.slug || '')) { toast('Adressen (slug) må være små bokstaver, tall og bindestrek.', 'error'); return; }
    if (!draft.name || !draft.leader || !draft.email || !draft.spondCode) { toast('Navn, leder, e-post og Spond-kode må være med.', 'error'); return; }
    // To grupper med samme adresse ville overskrevet hverandre.
    if (isNew && data.sports.some((x) => x.slug === draft.slug)) { toast('En annen gruppe har allerede denne adressen.', 'error'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(draft.email)) { toast('E-postadressen ser ikke riktig ut.', 'error'); return; }
    setBusy(true);
    const { error } = await db.saveSport(draft);
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    markSaved();
    toast('Lagret. Siden er oppdatert.');
    refresh(); content.reload();
    if (isNew) go(`/grupper/${draft.slug}`);
  }
  async function remove() {
    if (!(await confirm({ title: `Slette ${sport.name}?`, body: 'Gruppa, tidene og lenkene forsvinner fra nettsiden. Nyheter og bilder blir liggende uten gruppe. Kan ikke angres.', ok: 'Slett gruppa', danger: true }))) return;
    const { error } = await db.deleteSport(sport.slug);
    if (error) { toast(error.message, 'error'); return; }
    toast('Slettet.'); refresh(); content.reload(); go('');
  }

  return (
    <fieldset disabled={!canEdit} className="fieldset">
      <div className="adm__cols adm__cols--wide">
        <div className="stack">
          {isNew && (
            <Panel title="Adresse">
              <div className="field">
                <label htmlFor="f-slug">Adresse (slug)</label>
                <input id="f-slug" required value={draft.slug || ''} onChange={(e) => setDraft({ ...draft, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} placeholder="innebandy" />
                <span className="hint">Vises i lenken /idretter/&lt;slug&gt;. Kan ikke endres etterpå.</span>
              </div>
            </Panel>
          )}
          {SPORT_SECTIONS.map((sec) => (
            <Panel key={sec.title} title={sec.title} intro={sec.intro}>
              <Form fields={sec.fields} value={draft} onChange={setDraft} />
            </Panel>
          ))}
        </div>
        <div className="stack">
          {access.isAdmin && (
            <Panel title="Synlighet" intro="Skjulte grupper vises ikke på nettsiden, men alt innhold beholdes.">
              <Form fields={SPORT_ADMIN_FIELDS} value={draft} onChange={setDraft} />
            </Panel>
          )}
          <Panel title="Slik vises det">
            <div className="preview">
              <div className="preview__icon">{draft.icon}</div>
              <div><strong>{draft.name || 'Navn på gruppa'}</strong><div className="muted">{draft.shortDescription?.nb || 'Kort beskrivelse …'}</div></div>
            </div>
            {!isNew && <Bildekilde sport={sport} content={content} />}
            <p className="hint muted">Bilde velges under fanen «Bilder» (huk av «Bruk som gruppebilde»).</p>
          </Panel>
          {!isNew && access.isAdmin && (
            <Panel title="Farlig sone">
              <button type="button" className="btn btn--danger btn--sm" onClick={remove}>Slett gruppa</button>
            </Panel>
          )}
        </div>
      </div>
      <SaveBar dirty={dirty || isNew} busy={busy} onSave={save} onReset={isNew ? undefined : reset} label={isNew ? 'Opprett gruppa' : 'Lagre endringer'} />
    </fieldset>
  );
}

function TimesTab({ sport, canEdit, refresh, content, events = [] }) {
  const toast = useToast();
  const { draft, setDraft, dirty, reset, markSaved } = useDraft(sport);
  const [busy, setBusy] = useState(false);
  async function save() {
    for (const s of draft.schedule || []) if (!s.from || !s.to || s.from >= s.to) { toast('Hver økt trenger fra- og til-tid, og «til» må være etter «fra».', 'error'); return; }
    setBusy(true);
    const { error } = await db.saveSport(draft);
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    markSaved(); toast('Treningstidene er lagret.'); refresh(); content.reload();
  }
  const sorted = [...(draft.schedule || [])].sort((a, b) => a.day - b.day || (a.from || '').localeCompare(b.from || ''));
  return (
    <fieldset disabled={!canEdit} className="fieldset">
      <div className="adm__cols adm__cols--wide">
        <div className="stack">
          <Panel title="Faste økter" intro="Grunnskjemaet for semesteret. Enkeltuker, avlysninger og påmelding styres i Spond, og kalenderabonnementet sier det.">
            <Form fields={SPORT_TIME_FIELDS} value={draft} onChange={setDraft} />
          </Panel>
          <KommendeØkter sport={sport} draft={draft} setDraft={setDraft} events={events} />
        </div>
        <div className="stack">
          <Panel title="Uka">
            {sorted.length === 0 ? <p className="muted">Ingen økter. Grupper uten fast ukeplan får «Se Spond» på nettsiden.</p> : (
              <ul className="times">
                {sorted.map((s, i) => <li key={i}><b>{DAYS[s.day]}</b><span>{s.from}–{s.to}<small>{s.venue || sport.venue?.nb}{s.from_date ? ` · fra ${s.from_date}` : ''}</small></span></li>)}
              </ul>
            )}
          </Panel>
          <Panel title="Kalender">
            <p className="muted">Øktene her går rett inn i kalenderabonnementet for {sport.name} og for hele PSI. Se «Kalender» i menyen.</p>
          </Panel>
        </div>
      </div>
      <SaveBar dirty={dirty} busy={busy} onSave={save} onReset={reset} />
    </fieldset>
  );
}


/* Hver enkelt økt planen lager, med mulighet for å ta bort de som ikke blir
   noe av. «Avlys» legger datoen i skip_dates for akkurat den serien, så
   verken nettsiden eller kalenderabonnementet viser den. Har Spond alt sagt
   sitt om dagen, er den ikke vår å avlyse. */
export function KommendeØkter({ sport, draft, setDraft, events = [] }) {
  const idag = dayOf(new Date());
  const spond = useMemo(() => spondDays(events), [events]);
  const økter = useMemo(() => {
    const p = osloParts(new Date());
    const til = isoDay(osloParts(new Date(Date.UTC(p.y, p.m - 1, p.d + VISER_DAGER))));
    // Kronologisk, ikke serie for serie: panelet sier «planen for de neste
    // 120 dagene», og da forventer man datoene i rekkefølge.
    return expandTrainings([{ ...draft, slug: sport.slug, active: true }], idag, til)
      .sort((a, b) => a.start - b.start);
  }, [draft, sport.slug, idag]);

  const avlyste = (draft.schedule || []).flatMap((s, i) => (s.skip_dates || []).map((d) => ({ dato: d, slot: i })))
    .filter((x) => x.dato >= idag)
    .sort((a, b) => a.dato.localeCompare(b.dato));

  const endre = (slot, fn) => setDraft({
    ...draft,
    schedule: draft.schedule.map((s, i) => (i === slot ? { ...s, skip_dates: fn(s.skip_dates || []) } : s)),
  });
  const avlys = (slot, dato) => endre(slot, (d) => [...new Set([...d, dato])].sort());
  const angre = (slot, dato) => endre(slot, (d) => d.filter((x) => x !== dato));

  return (
    <Panel
      title="Kommende økter"
      intro={`Planen for de neste ${VISER_DAGER} dagene. Blir en økt ikke noe av – ingen hall, ferie, eksamen – tar du den bort her. Kommer den i Spond, er det Spond som gjelder.`}
    >
      {økter.length === 0 ? (
        <p className="muted">Ingen økter i perioden. Legg inn faste tider over, eller la gruppa styres av Spond alene.</p>
      ) : (
        <ul className="sessions">
          {økter.map((ø) => {
            const iSpond = spond.get(sport.slug)?.has(ø.day);
            return (
              <li key={ø.id} className="sessions__row">
                <span className="sessions__when">
                  <b>{DAYS[osloParts(ø.start).weekday]}</b> {fmtDag(ø.day)}
                  <small className="muted">{nb(ø.venue)}</small>
                </span>
                {iSpond
                  ? <span className="pill pill--spond">Spond</span>
                  : <button type="button" className="btn btn--ghost btn--sm" onClick={() => avlys(ø.slotIndex, ø.day)}>Avlys</button>}
              </li>
            );
          })}
        </ul>
      )}
      {avlyste.length > 0 && (
        <>
          <h4 className="sessions__head">Avlyst framover</h4>
          <ul className="sessions">
            {avlyste.map((a) => (
              <li key={`${a.slot}-${a.dato}`} className="sessions__row sessions__row--off">
                <span className="sessions__when">{fmtDag(a.dato)}<small className="muted">ingen trening</small></span>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => angre(a.slot, a.dato)}>Angre</button>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="hint muted">Endringene lagres med knappen nederst.</p>
    </Panel>
  );
}


/* Hvor gruppebildet kommer fra. Når et bilde uteblir er det alltid det
   samme spørsmålet – er det admin, fila eller ingenting? – og det er
   raskere å lese det her enn å grave i nettverksfanen. */
export function Bildekilde({ sport, content }) {
  const vist = content?.findSport?.(sport.slug) || sport;
  const bilde = vist.image;
  if (!bilde) {
    return <p className="hint muted">Bilde: <b>ingen</b>. Gruppa viser plassholderen med idrettsmerket.</p>;
  }
  const fraAdmin = /^https?:/i.test(bilde);
  return (
    <p className="hint muted">
      Bilde: <b>{fraAdmin ? 'fra admin' : 'fra koden'}</b>
      {fraAdmin ? ' (et bilde merket «Bruk som gruppebilde»)' : ` (${bilde})`}
      {vist.imageFocus && vist.imageFocus !== '50% 50%' && <> · utsnitt {vist.imageFocus}</>}
    </p>
  );
}
