import { db, fileContent } from '../api.jsx';
import { Panel, StatusPill, useToast, relTime, fmtDateTime } from '../ui.jsx';

/* Innstillinger → Spond: status for den automatiske synken, og hjelp til
   å koble hver PSI-gruppe til riktig Spond-gruppe.

   Selve jobben kjører i GitHub Actions (psi/scripts/spond_sync.py), ikke
   herfra. Denne siden viser bare hva den gjorde sist. */
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
          <p className="muted">Ingen grupper er koblet ennå. Finn ID-en i lista under og lim den inn under gruppa → Info → Spond.</p>
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

      <Panel title="Grupper i Spond" intro="Gruppene PSI-kontoen er medlem av, sett ved siste kjøring. Kopier ID-en og lim den inn på riktig PSI-gruppe.">
        {groups.length === 0 ? (
          <p className="muted">Ingen funnet ennå. De dukker opp etter første vellykkede kjøring.</p>
        ) : (
          <ul className="list list--tight">
            {groups.map((g) => {
              const brukt = data.sports.find((s) => s.spondGroupId === g.id);
              return (
                <li key={g.id} className="syncline">
                  <span><strong>{g.name}</strong><br /><code className="muted">{g.id}</code></span>
                  {brukt ? <span className="pill pill--teal">{brukt.name}</span> : <span className="pill">Ikke koblet</span>}
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
