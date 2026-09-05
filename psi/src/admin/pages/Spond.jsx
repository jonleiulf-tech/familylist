import { useState } from 'react';
import { db, fileContent } from '../api.jsx';
import { Panel, StatusPill, useToast, relTime, fmtDateTime } from '../ui.jsx';

/* Innstillinger → Spond: status for den automatiske synken, og hjelp til
   å koble hver PSI-gruppe til riktig Spond-gruppe.

   Selve jobben kjører i GitHub Actions (psi/scripts/spond_sync.py), ikke
   herfra. Denne siden viser bare hva den gjorde sist. */
/* Når navnene ikke ligner nok til et forslag, velger man selv. */
function LinkPicker({ sports, onPick }) {
  const [valgt, setValgt] = useState('');
  if (sports.length === 0) return <span className="muted">Alle PSI-grupper er koblet</span>;
  return (
    <span className="syncline__pick">
      <select value={valgt} onChange={(e) => setValgt(e.target.value)} aria-label="Velg PSI-gruppe">
        <option value="">Koble til …</option>
        {sports.map((sp) => <option key={sp.slug} value={sp.slug}>{sp.name}</option>)}
      </select>
      <button type="button" className="btn btn--primary btn--sm" disabled={!valgt}
        onClick={() => onPick(sports.find((sp) => sp.slug === valgt))}>Koble</button>
    </span>
  );
}

export default function Spond({ data, refresh, content, go }) {
  const toast = useToast();
  const run = data.lastSync;
  const groups = run?.detail?.groups || [];
  const posts = run?.detail?.posts || null;
  const linked = data.sports.filter((s) => (s.spondGroupId || '').trim());
  const nameOf = (id) => groups.find((g) => g.id === id)?.name || null;
  const site = data.content.site?.value ?? fileContent().site;
  const syncPosts = site.spondSyncPosts !== false;
  const autoPublish = site.spondAutoPublishPosts === true;
  const fromSpond = data.news.filter((n) => n.source === 'spond');

  async function setFlag(key, value) {
    const { error } = await db.saveContent('site', { ...site, [key]: value });
    if (error) toast(error.message, 'error');
    else { toast('Lagret. Gjelder fra neste kjøring.'); refresh(); content.reload(); }
  }

  /* Foreslår hvilken PSI-gruppe en Spond-gruppe hører til, ut fra navnet.
     «Psi volleyball» og «PSI Volleyball» skal treffe hverandre. */
  function foreslå(spondNavn) {
    const rens = (x) => (x || '').toLowerCase().replace(/^psi\s*/, '').replace(/[^a-z0-9]/g, '');
    const mål = rens(spondNavn);
    if (!mål) return null;
    return data.sports.find((sp) => !sp.spondGroupId && (rens(sp.name) === mål || rens(sp.shortName?.nb) === mål || sp.slug === mål)) || null;
  }

  async function link(sport, groupId) {
    const { error } = await db.saveSport({ ...sport, spondGroupId: groupId });
    if (error) toast(error.message, 'error');
    else { toast(`${sport.name} er koblet til Spond. Neste kjøring henter arrangementene.`); refresh(); content.reload(); }
  }

  async function unlink(sport) {
    const { error } = await db.saveSport({ ...sport, spondGroupId: null });
    if (error) toast(error.message, 'error');
    else { toast(`${sport.name} er koblet fra Spond. Arrangementene som allerede er hentet blir stående.`); refresh(); content.reload(); }
  }
  const copy = async (text, e) => {
    const btn = e.currentTarget;
    try { await navigator.clipboard.writeText(text); btn.textContent = 'Kopiert'; setTimeout(() => { btn.textContent = 'Kopier ID'; }, 1500); }
    catch { window.prompt('Kopier ID-en', text); }
  };

  if (!data.syncReady) {
    return (
      <Panel title="Spond-synk er ikke satt opp">
        <p className="muted">Kjør <code>supabase/migrations/0003_spond_arrangementer.sql</code> i Supabase → SQL Editor, og legg inn hemmelighetene i GitHub. Framgangsmåten står i <code>SETUP.md</code> under «Spond-synk».</p>
        <p className="muted">Uten synken virker alt annet som før: treningstidene kommer fra grunnskjemaet, og arrangementer legges inn for hånd under Kalender.</p>
      </Panel>
    );
  }

  return (
    <div className="stack">
      <Panel title="Siste kjøring" intro="Jobben går hver time og henter kamper og arrangementer fra Spond inn i kalenderen.">
        {!run ? (
          <p className="muted">Har ikke kjørt ennå. Første kjøring skjer innen en time, eller start den manuelt fra GitHub → Actions → «PSI – Spond-synk» → Run workflow.</p>
        ) : (
          <>
            <div className="syncline">
              <StatusPill status={run.status === 'ok' ? 'ok' : run.status === 'error' ? 'cancelled' : 'draft'} />
              <span>{run.message}</span>
              <span className="muted">{relTime(run.created_at)} · {fmtDateTime(run.created_at)}</span>
            </div>
            {posts && posts.enabled && (
              <p className="hint muted">Innlegg: {posts.new} nye, {posts.updated} oppdatert, {posts.removed} fjernet. {posts.auto_published ? 'Publiseres automatisk.' : 'Legges inn som utkast.'}</p>
            )}
            {run.status === 'error' && (
              <p className="hint muted">Spond har ikke et offentlig API, så jobben kan slutte å virke uten forvarsel. Nettsiden står som før på grunnskjemaet og det som er lagt inn for hånd; ingenting går tapt.</p>
            )}
          </>
        )}
      </Panel>

      <Panel title="Koblede grupper" intro="Bare grupper med en Spond-gruppe-ID blir synket. Resten styres for hånd, som før.">
        {linked.length === 0 ? (
          <p className="muted">
            Ingen grupper er koblet ennå. Neste kjøring kobler dem automatisk der navnet stemmer —
            eller bruk knappene i lista under.
          </p>
        ) : (
          <ul className="list list--tight">
            {linked.map((s) => {
              const n = data.events.filter((e) => e.sport_slug === s.slug && e.source === 'spond').length;
              return (
                <li key={s.slug} className="syncline">
                  <span>{s.icon} <strong>{s.name}</strong> <span className="muted">· {nameOf(s.spondGroupId) || s.spondGroupId}</span></span>
                  <span className="muted">{n} hentet</span>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => unlink(s)}>Koble fra</button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel title="Innlegg fra Spond" intro="Vegginnleggene i Spond kan bli nyheter på psiusn.no.">
        <label className="check"><input type="checkbox" checked={syncPosts} onChange={(e) => setFlag('spondSyncPosts', e.target.checked)} />Hent innlegg fra Spond-veggene</label>
        <label className="check"><input type="checkbox" checked={autoPublish} disabled={!syncPosts} onChange={(e) => setFlag('spondAutoPublishPosts', e.target.checked)} />Publiser dem automatisk på nettsiden</label>
        <div className="notice">
          <strong>Tenk over den siste.</strong> Et innlegg skrevet til en lukket gruppe er ikke alltid ment for åpen nett: navn, telefonnummer, Vipps-beløp, interne planer. Med den av kommer innleggene inn som utkast, og noen i styret leser gjennom og trykker publiser — det tar noen sekunder per innlegg. Med den på går alt rett ut.
        </div>
        {fromSpond.length > 0 && (
          <p className="hint muted">
            {fromSpond.length} innlegg hentet, {fromSpond.filter((n) => n.status === 'draft').length} venter på gjennomlesing.
            {' '}<button type="button" className="linkish" onClick={() => go('/nyheter')}>Se dem under Nyheter</button>.
          </p>
        )}
        <p className="hint muted">Kommentarer hentes aldri. Har noen lest gjennom og publisert et innlegg, rører ikke synken teksten etterpå — da er det deres.</p>
      </Panel>

      <Panel title="Grupper i Spond" intro="Gruppene PSI-kontoen er medlem av, sett ved siste kjøring. Synken kobler dem selv når navnene stemmer; her kan du koble resten, eller endre en kobling.">
        {groups.length === 0 ? (
          <p className="muted">
            Ingen funnet ennå. De dukker opp etter første kjøring av jobben — også før noen grupper er koblet.
            Står lista fortsatt tom, finner du dem i loggen: GitHub → Actions → «PSI – Spond-synk» → siste kjøring → Synk.
          </p>
        ) : (
          <ul className="list list--tight">
            {groups.map((g) => {
              const brukt = data.sports.find((s) => s.spondGroupId === g.id);
              const forslag = brukt ? null : foreslå(g.name);
              return (
                <li key={g.id} className="syncline">
                  <span><strong>{g.name}</strong><br /><code className="muted">{g.id}</code></span>
                  {brukt ? <span className="pill pill--teal">{brukt.name}</span> : <span className="pill">Ikke koblet</span>}
                  {forslag && (
                    <button type="button" className="btn btn--primary btn--sm" onClick={() => link(forslag, g.id)}>
                      Koble til {forslag.name.replace(/^PSI\s+/, '')}
                    </button>
                  )}
                  {!brukt && !forslag && (
                    <LinkPicker sports={data.sports.filter((sp) => !sp.spondGroupId)} onPick={(sp) => link(sp, g.id)} />
                  )}
                  <button type="button" className="btn btn--ghost btn--sm" onClick={(e) => copy(g.id, e)}>Kopier ID</button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel title="Hva synken gjør, og ikke gjør">
        <ul className="list list--tight">
          <li>Henter <strong>tittel, tid, sted og avlyst</strong> fra arrangementer, og <strong>teksten</strong> fra vegginnlegg. Aldri medlemmer, svar, oppmøte, betaling eller kommentarer.</li>
          <li>Arrangementer fra Spond er merket i kalenderen og kan ikke redigeres her — endre dem i Spond, så følger nettsiden etter innen en time. Du kan skjule enkeltposter.</li>
          <li>Har en gruppe et Spond-arrangement en dag, skjules den genererte treningen fra grunnskjemaet den dagen, så uka ikke vises dobbelt.</li>
          <li>Slettes noe i Spond, forsvinner det herfra ved neste kjøring.</li>
          <li>Spond har ikke et offentlig API. Slutter dette å virke, står nettsiden på grunnskjemaet og det dere legger inn selv.</li>
        </ul>
      </Panel>
    </div>
  );
}
