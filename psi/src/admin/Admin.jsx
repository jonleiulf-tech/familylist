import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, hasBackend } from '../lib/supabase.js';
import { useContent, fileContent } from '../lib/content.jsx';
import { useAdminAuth, passordFeil, MIN_PASSORD } from './useAdminAuth.js';
import { Form } from './Fields.jsx';
import { SPORT_FIELDS, SITE_FIELDS, ORG_FIELDS, STATS_FIELDS, PARTNER_FIELDS, BLANK_SPORT } from './schema.js';
import { PageHead } from '../components/Bits.jsx';
import SetupCheck from './SetupCheck.jsx';
import { byggSportsRader, byggContentRader } from './importer.js';

/* /admin: styret redigerer innholdet. Norsk grensesnitt.
   Krever Supabase (se SETUP.md). Uten det vises en forklaring. */

const MENU = [['sports', 'Idretter'], ['partners', 'Partnere'], ['settings', 'Innstillinger og tekster'], ['access', 'Tilgang']];

export default function Admin() {
  if (!hasBackend) {
    return (
      <>
        <PageHead eyebrow="For styret" title="Admin er ikke slått på" />
        <section className="section"><div className="wrap prose">
          <p>Siden kjører nå på innholdet i <code>src/data/psi.js</code>. Det er helt fint: endringer gjøres i den fila og publiseres via GitHub.</p>
          <p>Vil styret heller redigere i et skjema her, følg «Admin (valgfritt)» i <code>SETUP.md</code>: opprett et Supabase-prosjekt, kjør <code>supabase/schema.sql</code>, og legg inn to miljøvariabler i Vercel.</p>
        </div></section>
        <section className="section" style={{ paddingTop: 0 }}><div className="wrap" style={{ maxWidth: 640 }}><SetupCheck /></div></section>
      </>
    );
  }
  return <AdminInner />;
}

function useToast() {
  const [toast, setToast] = useState(null);
  const timer = useRef();
  const show = useCallback((message, kind = 'ok') => {
    clearTimeout(timer.current);
    setToast({ message, kind });
    timer.current = setTimeout(() => setToast(null), 3500);
  }, []);
  const el = toast ? <div role="status" className={`toast${toast.kind === 'error' ? ' toast--error' : ''}`}>{toast.message}</div> : null;
  return [show, el];
}

function AdminInner() {
  const auth = useAdminAuth();
  const [tab, setTab] = useState('sports');
  const [toast, toastEl] = useToast();

  if (auth.loading) return <section className="section"><div className="wrap"><p className="muted">Laster …</p></div></section>;
  if (auth.session && auth.måSettePassord) {
    return (
      <>
        <PageHead eyebrow="For styret" title="Velg nytt passord" intro={`For ${auth.session.user.email}.`} />
        <section className="section"><div className="wrap" style={{ maxWidth: 480 }}>
          <SettPassord auth={auth} toast={toast} påFerdig={auth.ferdigMedPassord} tittel="Nytt passord" />
        </div></section>
        {toastEl}
      </>
    );
  }
  if (!auth.session) return <SignIn auth={auth} />;
  if (!auth.isAdmin) {
    return (
      <>
        <PageHead eyebrow="For styret" title="Ingen tilgang" />
        <section className="section"><div className="wrap prose">
          <p>Du er logget inn som <strong>{auth.session.user.email}</strong>, men adressen står ikke på lista over styremedlemmer med tilgang.</p>
          <p>Er du den første, legg deg til ved å kjøre denne i Supabase → SQL Editor:</p>
          <pre style={{ overflowX: 'auto', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: 'var(--sp-3)' }}><code>{`insert into public.admins (email) values ('${auth.session.user.email}')\n  on conflict (email) do nothing;`}</code></pre>
          <p>Er du ikke den første, be en i styret legge deg til under «Tilgang».</p>
          <button className="btn btn--ghost" onClick={auth.signOut}>Logg ut</button>
          <SetupCheck />
        </div></section>
      </>
    );
  }
  const me = auth.session.user.email;
  return (
    <>
      <PageHead eyebrow="For styret" title="Rediger nettsiden" intro={`Logget inn som ${me}. Endringer vises på siden med én gang du lagrer.`} />
      <section className="section">
        <div className="wrap admin">
          <nav className="admin__menu" aria-label="Adminmeny">
            {MENU.map(([k, label]) => <button key={k} className={tab === k ? 'is-active' : ''} onClick={() => setTab(k)}>{label}</button>)}
            <button onClick={auth.signOut} style={{ color: 'var(--ink-muted)' }}>Logg ut</button>
          </nav>
          <div>
            {tab === 'sports' && <SportsAdmin toast={toast} />}
            {tab === 'partners' && <PartnersAdmin toast={toast} />}
            {tab === 'settings' && <SettingsAdmin toast={toast} />}
            {tab === 'access' && <AccessAdmin me={me} toast={toast} />}
            {tab === 'konto' && (
              <>
                <div className="admin__bar"><h2>Min konto</h2></div>
                <p className="muted" style={{ marginBottom: 'var(--sp-4)' }}>
                  Logget inn som {me}. Setter du et passord, kan du logge inn med det i stedet for
                  å hente en lenke på e-post. Lenken virker fortsatt, så du kommer inn selv om du
                  glemmer passordet.
                </p>
                <SettPassord auth={auth} toast={toast} />
              </>
            )}
          </div>
        </div>
      </section>
      {toastEl}
    </>
  );
}

function SignIn({ auth }) {
  const [modus, setModus] = useState('passord');   // passord | lenke | glemt
  const [email, setEpost] = useState('');
  const [passord, setPassord] = useState('');
  const [state, setState] = useState({ status: 'idle', message: '' });

  const bytt = (m) => { setModus(m); setState({ status: 'idle', message: '' }); };

  async function submit(e) {
    e.preventDefault();
    setState({ status: 'busy', message: '' });
    let error = null;
    if (modus === 'passord') ({ error } = await auth.signInMedPassord(email, passord));
    else if (modus === 'lenke') ({ error } = await auth.signInMedLenke(email));
    else ({ error } = await auth.glemtPassord(email));

    if (error) {
      const feil = /Invalid login credentials/i.test(error.message)
        ? 'Feil e-post eller passord. Har du ikke laget passord ennå, logg inn med lenke på e-post og sett et under «Min konto».'
        : error.message;
      setState({ status: 'error', message: feil });
      return;
    }
    setState({ status: modus === 'passord' ? 'idle' : 'sendt', message: '' });
  }

  const sendtTekst = modus === 'glemt'
    ? 'Sjekk e-posten din. Lenken lar deg sette nytt passord.'
    : 'Sjekk e-posten din. Lenken virker i én time.';

  return (
    <>
      <PageHead eyebrow="For styret" title="Logg inn" intro="Bare styremedlemmer med tilgang kan redigere." />
      <section className="section"><div className="wrap" style={{ maxWidth: 480 }}>
        {state.status === 'sendt' ? (
          <div className="notice notice--teal" role="status">{sendtTekst}</div>
        ) : (
          <form className="form editor" onSubmit={submit}>
            <div className="field">
              <label htmlFor="login-email">E-post</label>
              <input id="login-email" type="email" required value={email} onChange={(e) => setEpost(e.target.value)} autoComplete="username" />
            </div>
            {modus === 'passord' && (
              <div className="field">
                <label htmlFor="login-pw">Passord</label>
                <input id="login-pw" type="password" required value={passord} onChange={(e) => setPassord(e.target.value)} autoComplete="current-password" />
              </div>
            )}
            {modus === 'glemt' && <p className="hint muted">Vi sender en lenke som lar deg sette nytt passord.</p>}
            {state.status === 'error' && <div className="notice" role="alert">{state.message}</div>}
            <div>
              <button className="btn btn--primary btn--block" disabled={state.status === 'busy'}>
                {state.status === 'busy' ? 'Vent litt …'
                  : modus === 'passord' ? 'Logg inn'
                  : modus === 'lenke' ? 'Send innloggingslenke'
                  : 'Send lenke for nytt passord'}
              </button>
            </div>
            <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap', fontSize: 'var(--fs-sm)' }}>
              {modus !== 'passord' && <button type="button" className="btn btn--ghost btn--sm" onClick={() => bytt('passord')}>Logg inn med passord</button>}
              {modus !== 'lenke' && <button type="button" className="btn btn--ghost btn--sm" onClick={() => bytt('lenke')}>Bruk lenke på e-post</button>}
              {modus !== 'glemt' && <button type="button" className="btn btn--ghost btn--sm" onClick={() => bytt('glemt')}>Glemt passord</button>}
            </div>
          </form>
        )}
        <SetupCheck />
      </div></section>
    </>
  );
}

/* Skjema for å sette passord. Brukes både etter «glemt passord» og fra
   «Min konto» når man er logget inn med lenke. */
function SettPassord({ auth, toast, påFerdig, tittel = 'Sett passord' }) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const feil = passordFeil(a, b);
    if (feil) { toast(feil, 'error'); return; }
    setBusy(true);
    const { error } = await auth.settPassord(a);
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    setA(''); setB('');
    toast('Passordet er lagret. Neste gang kan du logge inn med det.');
    påFerdig?.();
  }

  return (
    <form className="editor form" onSubmit={submit}>
      <h3>{tittel}</h3>
      <div className="field">
        <label htmlFor="pw-1">Nytt passord</label>
        <input id="pw-1" type="password" required minLength={MIN_PASSORD} value={a} onChange={(e) => setA(e.target.value)} autoComplete="new-password" />
        <span className="hint">Minst {MIN_PASSORD} tegn. Bruk gjerne passordbehandleren i nettleseren.</span>
      </div>
      <div className="field">
        <label htmlFor="pw-2">Gjenta passordet</label>
        <input id="pw-2" type="password" required minLength={MIN_PASSORD} value={b} onChange={(e) => setB(e.target.value)} autoComplete="new-password" />
      </div>
      <div><button className="btn btn--primary" disabled={busy}>{busy ? 'Lagrer …' : 'Lagre passord'}</button></div>
    </form>
  );
}

/* ---------- Idretter ---------- */
function SportsAdmin({ toast }) {
  const content = useContent();
  const [rows, setRows] = useState(null);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const { data, error } = await supabase.from('sports').select('slug, sort_order, active, data').order('sort_order');
    if (error) toast(error.message, 'error'); else setRows(data);
  }, [toast]);
  useEffect(() => { reload(); }, [reload]);

  async function importFromFile() {
    if (!window.confirm('Kopiere alt innhold fra datafila (src/data/psi.js) inn i databasen? Eksisterende rader med samme slug overskrives.')) return;
    const f = fileContent();
    setBusy(true);
    const sportsRows = byggSportsRader(f.sports);
    const contentRows = byggContentRader(f);
    const a = await supabase.from('sports').upsert(sportsRows);
    const b = await supabase.from('content').upsert(contentRows);
    setBusy(false);
    if (a.error || b.error) toast((a.error || b.error).message, 'error');
    else { toast('Importert.'); reload(); content.reload(); }
  }

  async function save(e) {
    e.preventDefault();
    const { slug, active, sort_order, ...data } = editing.row;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug || '')) { toast('Adressen (slug) må være små bokstaver, tall og bindestrek.', 'error'); return; }
    setBusy(true);
    const { error } = await supabase.from('sports').upsert({ slug, active: Boolean(active), sort_order: sort_order ?? 10, data });
    setBusy(false);
    if (error) toast(error.message, 'error');
    else { toast('Lagret.'); setEditing(null); reload(); content.reload(); }
  }
  async function remove(row) {
    if (!window.confirm(`Slette ${row.data.name}? Kan ikke angres.`)) return;
    const { error } = await supabase.from('sports').delete().eq('slug', row.slug);
    if (error) toast(error.message, 'error'); else { toast('Slettet.'); setEditing(null); reload(); content.reload(); }
  }

  if (rows === null) return <p className="muted">Laster …</p>;

  if (editing) {
    return (
      <form className="editor" onSubmit={save}>
        <h3>{editing.isNew ? 'Ny idrettsgruppe' : `Rediger ${editing.row.name}`}</h3>
        <div className="form" style={{ marginTop: 'var(--sp-4)' }}>
          <div className="field">
            <label htmlFor="f-slug">Adresse (slug)</label>
            <input id="f-slug" required value={editing.row.slug || ''} disabled={!editing.isNew}
              onChange={(e) => setEditing((s) => ({ ...s, row: { ...s.row, slug: e.target.value.toLowerCase() } }))} />
            <span className="hint">Vises i lenken /idretter/&lt;slug&gt;. Kan ikke endres etterpå.</span>
          </div>
          <Form fields={SPORT_FIELDS} value={editing.row} onChange={(row) => setEditing((s) => ({ ...s, row }))} />
        </div>
        <div className="editor__actions">
          <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
            <button className="btn btn--primary" disabled={busy}>{busy ? 'Lagrer …' : 'Lagre'}</button>
            <button type="button" className="btn btn--ghost" onClick={() => setEditing(null)}>Avbryt</button>
          </div>
          {!editing.isNew && <button type="button" className="btn btn--danger btn--sm" onClick={() => remove(rows.find((r) => r.slug === editing.row.slug))}>Slett</button>}
        </div>
      </form>
    );
  }

  return (
    <>
      <div className="admin__bar">
        <h2>Idretter</h2>
        <button className="btn btn--primary btn--sm" onClick={() => setEditing({ row: { slug: '', ...BLANK_SPORT }, isNew: true })}>+ Ny gruppe</button>
      </div>
      {rows.length === 0 ? (
        <div className="empty">
          <p>Databasen er tom, så siden viser innholdet fra datafila.</p>
          <button className="btn btn--dark" disabled={busy} onClick={importFromFile}>Kopier innholdet fra datafila hit</button>
        </div>
      ) : (
        <div className="table-wrap"><table>
          <thead><tr><th></th><th>Gruppe</th><th>Leder</th><th>Spond</th><th>Økter</th><th>Aktiv</th><th></th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.slug}>
              <td>{r.data.icon}</td><td>{r.data.name}</td><td>{r.data.leader}</td><td>{r.data.spondCode}</td>
              <td>{(r.data.schedule || []).length}</td><td>{r.active ? 'Ja' : 'Nei'}</td>
              <td><button className="btn btn--ghost btn--sm" onClick={() => setEditing({ row: { slug: r.slug, active: r.active, sort_order: r.sort_order, ...r.data }, isNew: false })}>Rediger</button></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      {rows.length > 0 && <p className="hint muted" style={{ marginTop: 'var(--sp-3)' }}>Trenger du å starte på nytt fra datafila? <button className="btn btn--ghost btn--sm" onClick={importFromFile}>Importer igjen</button></p>}
    </>
  );
}

/* ---------- Ett jsonb-dokument i content-tabellen ---------- */
function useDoc(key, toast) {
  const content = useContent();
  const [value, setValue] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    supabase.from('content').select('value').eq('key', key).maybeSingle().then(({ data, error }) => {
      if (error) toast(error.message, 'error');
      else setValue(data?.value ?? fileContent()[key]);
    });
  }, [key, toast]);
  async function save(next = value) {
    setBusy(true);
    const { error } = await supabase.from('content').upsert({ key, value: next });
    setBusy(false);
    if (error) toast(error.message, 'error'); else { toast('Lagret.'); content.reload(); }
  }
  return { value, setValue, save, busy };
}

function SettingsAdmin({ toast }) {
  const site = useDoc('site', toast);
  const org = useDoc('organization', toast);
  const stats = useDoc('stats', toast);
  if (!site.value || !org.value || !stats.value) return <p className="muted">Laster …</p>;
  const Block = ({ title, doc, fields }) => (
    <form className="editor" onSubmit={(e) => { e.preventDefault(); doc.save(); }}>
      <h3>{title}</h3>
      <div style={{ marginTop: 'var(--sp-4)' }}><Form fields={fields} value={doc.value} onChange={doc.setValue} /></div>
      <div className="editor__actions"><button className="btn btn--primary" disabled={doc.busy}>{doc.busy ? 'Lagrer …' : 'Lagre'}</button></div>
    </form>
  );
  return (
    <div className="stack">
      <Block title="Nettstedet" doc={site} fields={SITE_FIELDS} />
      <Block title="Organisasjonen" doc={org} fields={ORG_FIELDS} />
      <Block title="Tall" doc={stats} fields={STATS_FIELDS} />
    </div>
  );
}

function PartnersAdmin({ toast }) {
  const doc = useDoc('partners', toast);
  const [editing, setEditing] = useState(null);
  if (!doc.value) return <p className="muted">Laster …</p>;
  const list = doc.value;

  function commit(next) { doc.setValue(next); doc.save(next); setEditing(null); }
  if (editing) {
    const isNew = editing.index === -1;
    return (
      <form className="editor" onSubmit={(e) => { e.preventDefault(); commit(isNew ? [...list, editing.row] : list.map((p, i) => (i === editing.index ? editing.row : p))); }}>
        <h3>{isNew ? 'Ny partner' : `Rediger ${editing.row.name}`}</h3>
        <div style={{ marginTop: 'var(--sp-4)' }}><Form fields={PARTNER_FIELDS} value={editing.row} onChange={(row) => setEditing((s) => ({ ...s, row }))} /></div>
        <div className="editor__actions">
          <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
            <button className="btn btn--primary" disabled={doc.busy}>Lagre</button>
            <button type="button" className="btn btn--ghost" onClick={() => setEditing(null)}>Avbryt</button>
          </div>
          {!isNew && <button type="button" className="btn btn--danger btn--sm" onClick={() => window.confirm('Slette?') && commit(list.filter((_, i) => i !== editing.index))}>Slett</button>}
        </div>
      </form>
    );
  }
  return (
    <>
      <div className="admin__bar">
        <h2>Partnere</h2>
        <button className="btn btn--primary btn--sm" onClick={() => setEditing({ index: -1, row: { name: '', shortName: '', logo: null, url: null, description: { nb: '', en: '' }, status: 'partner' } })}>+ Ny partner</button>
      </div>
      <div className="table-wrap"><table>
        <thead><tr><th>Navn</th><th>Lenke</th><th></th></tr></thead>
        <tbody>{list.map((p, i) => (
          <tr key={i}><td>{p.name}</td><td>{p.url}</td>
            <td><button className="btn btn--ghost btn--sm" onClick={() => setEditing({ index: i, row: p })}>Rediger</button></td></tr>
        ))}</tbody>
      </table></div>
    </>
  );
}

/* ---------- Tilgang ---------- */
function AccessAdmin({ me, toast }) {
  const [rows, setRows] = useState(null);
  const [email, setEmail] = useState('');
  const reload = useCallback(() => supabase.from('admins').select('*').order('created_at')
    .then(({ data, error }) => (error ? toast(error.message, 'error') : setRows(data))), [toast]);
  useEffect(() => { reload(); }, [reload]);

  async function add(e) {
    e.preventDefault();
    const { error } = await supabase.from('admins').insert({ email: email.trim().toLowerCase(), added_by: me });
    if (error) toast(error.code === '23505' ? 'Er allerede admin.' : error.message, 'error');
    else { toast('Lagt til.'); setEmail(''); reload(); }
  }
  async function remove(row) {
    if (!window.confirm(`Fjerne ${row.email}?`)) return;
    const { error } = await supabase.from('admins').delete().eq('email', row.email);
    if (error) toast(error.message, 'error'); else { toast('Fjernet.'); reload(); }
  }
  return (
    <>
      <div className="admin__bar"><h2>Tilgang</h2></div>
      <form className="editor form" onSubmit={add} style={{ marginBottom: 'var(--sp-4)' }}>
        <div className="field">
          <label htmlFor="adm-email">Gi et styremedlem tilgang</label>
          <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
            <input id="adm-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="navn@student.usn.no" style={{ flex: 1, minWidth: 200 }} />
            <button className="btn btn--primary btn--sm">Legg til</button>
          </div>
          <span className="hint">Personen logger inn på /admin med denne e-posten og får en lenke.</span>
        </div>
      </form>
      {rows && (
        <div className="table-wrap"><table>
          <thead><tr><th>E-post</th><th>Lagt til</th><th></th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.email}>
              <td>{r.email}{r.email === me && <span className="pill" style={{ marginLeft: 8 }}>deg</span>}</td>
              <td>{new Date(r.created_at).toLocaleDateString('nb-NO')}</td>
              <td>{r.email !== me && <button className="btn btn--ghost btn--sm" onClick={() => remove(r)}>Fjern</button>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  );
}
