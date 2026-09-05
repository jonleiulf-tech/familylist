import { useMemo, useState } from 'react';
import { Form } from '../Fields.jsx';
import { SITE_FIELDS, ORG_FIELDS, STATS_FIELDS } from '../schema.js';
import { db, fileContent } from '../api.jsx';
import { byggSportsRader, byggContentRader } from '../importer.js';
import { supabase } from '../../lib/supabase.js';
import { PageTitle, Panel, SaveBar, Tabs, useDraft, useToast, useConfirm, relTime } from '../ui.jsx';
import Spond from './Spond.jsx';

const DOCS = [
  ['site', 'Nettstedet', SITE_FIELDS, 'Semester, kontakt, medlemslenke, sosiale kanaler og logo.'],
  ['organization', 'Organisasjonen', ORG_FIELDS, 'Navn, profiltekst og leder. Forholdet til SiG endres bare når noe faktisk er vedtatt.'],
  ['stats', 'Tall', STATS_FIELDS, 'Tallene på forsiden. Alltid datert.'],
];

export default function Settings({ data, refresh, content, go }) {
  const [tab, setTab] = useState('site');
  const doc = DOCS.find((d) => d[0] === tab);
  return (
    <>
      <PageTitle eyebrow="Nettstedet" title="Innstillinger og tekster" intro="Faste tekster og fakta som brukes på tvers av sidene." />
      <Tabs tabs={[...DOCS.map(([k, l]) => [k, l]), ['spond', 'Spond'], ['verktoy', 'Verktøy']]} active={tab} onChange={setTab} />
      {tab === 'verktoy' && <Tools data={data} refresh={refresh} content={content} />}
      {tab === 'spond' && <Spond data={data} refresh={refresh} content={content} go={go} />}
      {doc && <Doc key={doc[0]} docKey={doc[0]} title={doc[1]} fields={doc[2]} intro={doc[3]} data={data} refresh={refresh} content={content} />}
    </>
  );
}

function Doc({ docKey, title, fields, intro, data, refresh, content }) {
  const toast = useToast();
  const row = data.content[docKey];
  const initial = useMemo(() => row?.value ?? fileContent()[docKey], [row, docKey]);
  const { draft, setDraft, dirty, reset, markSaved } = useDraft(initial);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const { error } = await db.saveContent(docKey, draft);
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    markSaved(); toast('Lagret.'); refresh(); content.reload();
  }
  return (
    <>
      <Panel title={title} intro={intro} actions={row?.updated_at && <span className="muted" style={{ fontSize: 'var(--fs-sm)' }}>Sist endret {relTime(row.updated_at)}{row.updated_by ? ` av ${row.updated_by.split('@')[0]}` : ''}</span>}>
        <Form fields={fields} value={draft} onChange={setDraft} />
      </Panel>
      <SaveBar dirty={dirty} busy={busy} onSave={save} onReset={reset} />
    </>
  );
}

function Tools({ data, refresh, content }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const empty = data.sports.length === 0;

  async function importFromFile() {
    if (!(await confirm({ title: 'Kopiere innholdet fra datafila inn i databasen?', body: empty ? 'Databasen er tom, så dette er trygt.' : 'Grupper med samme adresse og tekstene overskrives med det som ligger i src/data/psi.js. Nyheter, arrangementer, bilder og tilgang rører vi ikke.', ok: 'Importer' }))) return;
    const f = fileContent();
    setBusy(true);
    const a = await supabase.from('sports').upsert(byggSportsRader(f.sports));
    const b = await supabase.from('content').upsert(byggContentRader(f));
    setBusy(false);
    if (a.error || b.error) toast((a.error || b.error).message, 'error');
    else { toast('Importert.'); refresh(); content.reload(); }
  }
  function exportJson() {
    const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), sports: data.sports, content: Object.fromEntries(Object.entries(data.content).map(([k, v]) => [k, v.value])), news: data.news, events: data.events, media: data.media.map(({ web_url, url, ...m }) => m), members: data.members }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `psiusn-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(a.href);
  }
  return (
    <div className="adm__cols">
      <Panel title="Datafila" intro="src/data/psi.js er startpunktet og reserven. Databasen har forrang så snart den har innhold.">
        {empty ? <div className="notice">Databasen er tom, så nettsiden viser fila. Importer for å begynne å redigere her.</div> : <p className="muted">{data.sports.length} grupper i databasen.</p>}
        <div><button type="button" className="btn btn--dark btn--sm" disabled={busy} onClick={importFromFile}>{empty ? 'Kopier innholdet fra datafila hit' : 'Importer fra datafila igjen'}</button></div>
      </Panel>
      <Panel title="Sikkerhetskopi" intro="Last ned alt som JSON. Nyttig før store endringer, og når PSI en dag flytter til eget oppsett.">
        <div><button type="button" className="btn btn--ghost btn--sm" onClick={exportJson}>Last ned kopi</button></div>
      </Panel>
    </div>
  );
}
