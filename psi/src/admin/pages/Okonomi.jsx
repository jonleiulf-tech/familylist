import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageTitle, Panel, Tabs, Empty, Loading, useToast, useConfirm, StatusPill, Menu } from '../ui.jsx';
import { db, hentØkonomi, signertLenke, hentBytes, GODTAR, filFeil } from '../okonomi.js';
import {
  kr, oversikt, total, andelBrukt, grupperFor, nøkkel, sorterPerioder, periodeNavn,
  BILAGSTATUS, BILAGSTATUS_TEKST, sum, teller,
} from '../../lib/okonomi.js';
import { erSynlig } from '../../lib/gruppestatus.js';
import Hovedbok from './Hovedbok.jsx';

/* /admin/okonomi – budsjett, bilag og utlegg.

   Gruppelederen skal kunne svare på ett spørsmål uten å spørre noen:
   «hvor mye har vi igjen?». Derfor står den summen øverst, i tall som er
   store nok til å se på en mobil, før alt annet.

   PSI-admin ser alle gruppene i én tabell, som helårsoversikten nederst i
   regnearket. */

const idag = () => new Date().toISOString().slice(0, 10);

export default function Okonomi({ data, access, me, content }) {
  const toast = useToast();
  const [øk, setØk] = useState(null);
  const [feil, setFeil] = useState(null);
  const [periodeId, setPeriodeId] = useState(null);
  const [gruppe, setGruppe] = useState(() => (access.isAdmin ? '__alle' : null));
  const [fane, setFane] = useState('oversikt');

  const last = useCallback(async () => {
    try { setØk(await hentØkonomi()); setFeil(null); } catch (e) { setFeil(e); }
  }, []);
  useEffect(() => { last(); }, [last]);

  const perioder = useMemo(() => sorterPerioder(øk?.perioder || []), [øk]);
  const periode = perioder.find((p) => p.id === periodeId) || perioder.find((p) => p.gjeldende) || perioder[0] || null;

  // Gruppene lederen faktisk har noe med. Pausede grupper er med: de har
  // gjerne penger igjen som skal gjøres opp.
  const mine = useMemo(() => {
    const alle = (data.sports || []).filter(erSynlig);
    return access.isAdmin ? grupperFor(alle) : grupperFor(alle.filter((s) => access.canManage(s.slug))).filter((g) => g.slug);
  }, [data.sports, access]);

  useEffect(() => {
    if (!access.isAdmin && gruppe === null && mine.length) setGruppe(mine[0].slug);
  }, [access.isAdmin, gruppe, mine]);

  if (feil) return <Empty title="Fikk ikke hentet økonomien" body={feil.message} />;
  if (!øk) return <Loading text="Henter budsjettet …" />;
  if (øk.mangler) {
    return (
      <>
        <PageTitle eyebrow="Økonomi" title="Økonomien er ikke satt opp ennå" />
        <Panel title="Kjør migrasjon 0012">
          <p className="muted">Tabellene for budsjett, bilag og utlegg finnes ikke i databasen ennå.</p>
          <pre className="code"><code>supabase/migrations/0012_okonomi.sql</code></pre>
          <p className="muted">Lim fila inn i Supabase → SQL Editor og kjør den, eller bruk <code>.\scripts\db.ps1</code>. Resten av admin virker som før.</p>
        </Panel>
      </>
    );
  }
  if (!periode) {
    return (
      <>
        <PageTitle eyebrow="Økonomi" title="Ingen budsjettperiode" />
        <Panel title="Lag en periode først">
          <p className="muted">Migrasjonen lager Vår og Høst 2026. Finner du ingen her, er de slettet – be PSI-admin lage en ny.</p>
        </Panel>
      </>
    );
  }

  const iPerioden = (liste) => liste.filter((x) => x.periode_id === periode.id);
  const valgt = access.isAdmin && gruppe === '__alle' ? null : gruppe;
  const forGruppe = (liste) => (valgt === null && gruppe === '__alle' ? liste : liste.filter((x) => (x.sport_slug || null) === (valgt || null)));

  const tildeling = iPerioden(øk.tildeling);
  const poster = iPerioden(øk.poster);
  const bilag = iPerioden(øk.bilag);
  const hovedbok = iPerioden(øk.hovedbok || []);

  const rader = oversikt({ grupper: mine, tildelinger: tildeling, poster, bilag, hovedbok });
  const sumAlle = total(rader);
  const min = gruppe === '__alle' ? null : rader.find((r) => (r.slug || null) === (valgt || null));

  const faner = [
    ['oversikt', 'Oversikt'],
    ['bilag', 'Bilag', forGruppe(bilag).length],
    ['budsjett', 'Budsjett', forGruppe(poster).length],
    ['utlegg', 'Utlegg', forGruppe(øk.utlegg).length],
    ['hovedbok', 'Hovedbok', forGruppe(hovedbok).length],
  ];

  return (
    <>
      <PageTitle
        eyebrow="Økonomi"
        title={periodeNavn(periode)}
        intro={access.isAdmin ? 'Budsjett, bilag og utlegg for alle gruppene.' : 'Hva gruppa har fått, hva som er brukt, og hva som er igjen.'}
        actions={
          <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
            <select value={periode.id} onChange={(e) => setPeriodeId(e.target.value)} aria-label="Periode">
              {perioder.map((p) => <option key={p.id} value={p.id}>{periodeNavn(p)}{p.gjeldende ? ' (nå)' : ''}</option>)}
            </select>
            <select value={gruppe ?? ''} onChange={(e) => setGruppe(e.target.value === '__felles' ? null : e.target.value)} aria-label="Gruppe">
              {access.isAdmin && <option value="__alle">Alle gruppene</option>}
              {mine.map((g) => <option key={nøkkel(g.slug)} value={g.slug ?? '__felles'}>{g.icon} {g.name}</option>)}
            </select>
          </div>
        }
      />

      {/* Svaret på spørsmålet folk faktisk kommer hit for å få. */}
      <Nøkkeltall rad={min || sumAlle} navn={min ? min.name : 'Alle gruppene'} />

      <Tabs tabs={faner} active={fane} onChange={setFane} ariaLabel="Økonomi" />

      {fane === 'oversikt' && <Oversikt rader={rader} sum={sumAlle} visAlle={gruppe === '__alle'} onVelg={setGruppe} />}
      {fane === 'bilag' && (
        <Bilag
          bilag={forGruppe(bilag)} poster={forGruppe(poster)} periode={periode}
          gruppe={valgt} alle={gruppe === '__alle'} grupper={mine} me={me} access={access}
          etter={last} toast={toast}
        />
      )}
      {fane === 'budsjett' && (
        <Budsjett
          poster={forGruppe(poster)} bilag={forGruppe(bilag)} tildeling={tildeling} periode={periode}
          gruppe={valgt} alle={gruppe === '__alle'} grupper={mine} access={access} etter={last} toast={toast}
        />
      )}
      {fane === 'hovedbok' && (
        access.isAdmin
          ? <Hovedbok øk={øk} periode={periode} grupper={mine} access={access} me={me} etter={last} />
          : <Bokfort linjer={forGruppe(hovedbok)} bilag={forGruppe(bilag)} />
      )}
      {fane === 'utlegg' && (
        <Utlegg
          utlegg={forGruppe(øk.utlegg)} bilag={forGruppe(bilag)} gruppe={valgt} alle={gruppe === '__alle'}
          grupper={mine} me={me} access={access} content={content} etter={last} toast={toast}
        />
      )}
    </>
  );
}

/* ---------- Toppen: tildelt, brukt, igjen ---------- */

function Nøkkeltall({ rad, navn }) {
  const andel = andelBrukt(rad);
  const over = rad.rest < 0;
  return (
    <div className="okon__topp">
      <div className="okon__tall">
        <span className="okon__etikett">{navn} har igjen</span>
        <strong className={over ? 'okon__rest okon__rest--over' : 'okon__rest'}>{kr(rad.rest)}</strong>
        <span className="muted">av {kr(rad.tilgjengelig)} tildelt</span>
      </div>
      <div className="okon__soyle" role="img" aria-label={`${Math.round(andel * 100)} prosent brukt`}>
        <span style={{ width: `${andel * 100}%` }} className={over ? 'is-over' : undefined} />
      </div>
      <dl className="okon__fakta">
        <div><dt>Brukt</dt><dd>{kr(rad.brukt)}</dd></div>
        {/* Bokført er det SiG faktisk har ført i regnskapet. Registrert er
            det gruppa har lagt inn selv som ennå ikke er bokført. */}
        <div><dt>Bokført hos SiG</dt><dd>{kr(rad.bokfort)}</dd></div>
        <div><dt>Registrert, ikke bokført</dt><dd>{kr(rad.registrert)}</dd></div>
        <div><dt>Budsjettert</dt><dd>{kr(rad.budsjettert)}</dd></div>
      </dl>
      {over && <div className="notice notice--warn">Forbruket er større enn det som er tildelt. Ta det opp med økonomiansvarlig før flere innkjøp.</div>}
    </div>
  );
}

/* ---------- Oversikt: alle gruppene, som i regnearket ---------- */

function Oversikt({ rader, sum: t, visAlle, onVelg }) {
  if (!visAlle) {
    return (
      <Panel title="Slik ligger gruppa an" intro="Tallene over er hentet fra bilagene som er ført på denne perioden.">
        <p className="muted">Bytt til «Alle gruppene» i menyen over for å se hele PSI, om du har tilgang.</p>
      </Panel>
    );
  }
  return (
    <Panel title="Alle gruppene" intro="Samme oversikt som nederst i regnearket. Klikk på en gruppe for å se bilagene." pad={false}>
      <div className="table-wrap"><table className="table table--tall">
        <thead>
          <tr>
            <th>Gruppe</th><th className="tall">Tildelt</th><th className="tall">Budsjettert</th>
            <th className="tall">Bokført</th><th className="tall">Brukt</th><th className="tall">Igjen</th><th className="tall">Bilag</th>
          </tr>
        </thead>
        <tbody>
          {rader.map((r) => (
            <tr key={nøkkel(r.slug)}>
              <td>
                <button type="button" className="linkish" onClick={() => onVelg(r.slug ?? '__felles')}>{r.icon} {r.name}</button>
              </td>
              <td className="tall">{kr(r.tilgjengelig)}</td>
              <td className={`tall${r.overbudsjettert ? ' er-over' : ''}`}>{kr(r.budsjettert)}</td>
              <td className="tall muted">{r.bokfort ? kr(r.bokfort) : '–'}</td>
              <td className="tall">{kr(r.brukt)}</td>
              <td className={`tall${r.rest < 0 ? ' er-over' : ''}`}><strong>{kr(r.rest)}</strong></td>
              <td className="tall muted">{r.antallBilag}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th>Til sammen</th>
            <th className="tall">{kr(t.tilgjengelig)}</th>
            <th className="tall">{kr(t.budsjettert)}</th>
            <th className="tall">{kr(t.bokfort)}</th>
            <th className="tall">{kr(t.brukt)}</th>
            <th className="tall">{kr(t.rest)}</th>
            <th className="tall">{t.antallBilag}</th>
          </tr>
        </tfoot>
      </table></div>
    </Panel>
  );
}

/* Det gruppelederen ser av regnskapet: hva SiG har bokført på gruppa.
   Ikke noe å redigere – tallene kommer fra regnskapet, ikke herfra. */
function Bokfort({ linjer }) {
  if (linjer.length === 0) {
    return <Empty title="Ingenting bokført ennå" body="Her dukker det opp det SiG har ført i regnskapet på gruppa, når styret har importert siste hovedbokrapport." />;
  }
  return (
    <Panel title="Bokført hos SiG" intro="Hentet fra kontoutskriften fra regnskapet. Halleie og fakturaer som går rett til SiG står her, selv om gruppa aldri har hatt en kvittering i hånda." pad={false}>
      <div className="table-wrap"><table className="table">
        <thead><tr><th>Dato</th><th>Bilag</th><th>Tekst</th><th className="tall">Beløp</th></tr></thead>
        <tbody>
          {linjer.map((l) => (
            <tr key={l.id}>
              <td className="muted">{l.dato}</td>
              <td className="muted">{l.bilagsnr}</td>
              <td>{l.tekst || <em className="muted">uten tekst</em>}</td>
              <td className="tall">{kr(l.belop)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><th colSpan={3}>Til sammen</th><th className="tall">{kr(sum(linjer))}</th></tr></tfoot>
      </table></div>
    </Panel>
  );
}

/* ---------- Bilag ---------- */

const TOMT_BILAG = { hva: '', belop: '', dato: idag(), post_id: null, notat: '' };

function Bilag({ bilag, poster, periode, gruppe, alle, grupper, me, access, etter, toast }) {
  const confirm = useConfirm();
  const [nytt, setNytt] = useState(null);
  const [busy, setBusy] = useState(false);
  const kanSkrive = !alle || access.isAdmin;

  async function lagre(fil) {
    const belop = Number(String(nytt.belop).replace(',', '.'));
    if (!nytt.hva.trim()) { toast('Hva gjelder bilaget?', 'error'); return; }
    if (!(belop > 0)) { toast('Beløpet må være større enn null.', 'error'); return; }
    if (fil) { const f = filFeil(fil); if (f) { toast(f, 'error'); return; } }
    setBusy(true);
    const rad = { hva: nytt.hva.trim(), belop, dato: nytt.dato, periode_id: periode.id, post_id: nytt.post_id || null, notat: nytt.notat || null, lagt_inn_av: me };
    const r = fil
      ? await db.lastOppBilag(fil, { sportSlug: nytt.sport_slug ?? gruppe, rad })
      : await db.lagreBilag({ ...rad, sport_slug: nytt.sport_slug ?? gruppe ?? null });
    setBusy(false);
    if (r.error) { toast(r.error.message, 'error'); return; }
    toast(fil ? 'Bilaget er lagt inn med kvittering.' : 'Bilaget er lagt inn. Husk å laste opp kvitteringen.');
    setNytt(null);
    etter();
  }

  async function slett(b) {
    if (!(await confirm({ title: 'Slette bilaget?', body: `${b.hva} · ${kr(b.belop)}. Kvitteringen slettes også. Kan ikke angres.`, ok: 'Slett', danger: true }))) return;
    const r = await db.slettBilag(b);
    if (r.error) toast(r.error.message, 'error'); else { toast('Slettet.'); etter(); }
  }

  async function settStatus(b, status) {
    const r = await db.settBilagStatus([b.id], status);
    if (r.error) toast(r.error.message, 'error'); else etter();
  }

  return (
    <Panel
      title="Bilag"
      intro="Hver kvittering føres her. Den trekkes fra budsjettet med en gang, og status forteller hvor den er i løypa."
      actions={kanSkrive && !nytt && <button type="button" className="btn btn--primary btn--sm" onClick={() => setNytt({ ...TOMT_BILAG, sport_slug: gruppe ?? null })}>+ Nytt bilag</button>}
      pad={false}
    >
      {nytt && (
        <NyttBilag
          verdi={nytt} setVerdi={setNytt} poster={poster} grupper={grupper} alle={alle}
          busy={busy} onLagre={lagre} onAvbryt={() => setNytt(null)}
        />
      )}
      {bilag.length === 0 ? (
        <Empty title="Ingen bilag ennå" body="Legg inn den første kvitteringen, så begynner regnskapet å gå av seg selv." />
      ) : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Dato</th><th>Hva</th>{alle && <th>Gruppe</th>}<th className="tall">Beløp</th><th>Status</th><th>Kvittering</th><th /></tr></thead>
          <tbody>
            {bilag.map((b) => (
              <tr key={b.id} className={teller(b) ? undefined : 'er-blek'}>
                <td className="muted">{b.dato}</td>
                <td><strong>{b.hva}</strong>{b.notat && <div className="muted">{b.notat}</div>}</td>
                {alle && <td className="muted">{grupper.find((g) => (g.slug || null) === (b.sport_slug || null))?.name || 'Felles PSI'}</td>}
                <td className="tall">{kr(b.belop)}</td>
                <td><StatusPill status={b.status} /></td>
                <td><Kvittering bilag={b} /></td>
                <td className="table__actions">
                  {kanSkrive && <Menu items={[
                    ...BILAGSTATUS.filter((s) => s !== b.status).map((s) => [`Sett til «${BILAGSTATUS_TEKST[s]}»`, () => settStatus(b, s)]),
                    ['Slett', () => slett(b), true],
                  ]} />}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><th colSpan={alle ? 3 : 2}>Til sammen</th><th className="tall">{kr(sum(bilag.filter(teller)))}</th><th colSpan={3} /></tr></tfoot>
        </table></div>
      )}
    </Panel>
  );
}

function NyttBilag({ verdi, setVerdi, poster, grupper, alle, busy, onLagre, onAvbryt }) {
  const [fil, setFil] = useState(null);
  const sett = (k) => (e) => setVerdi({ ...verdi, [k]: e.target.value });
  return (
    <form className="editor form" onSubmit={(e) => { e.preventDefault(); onLagre(fil); }}>
      <h3>Nytt bilag</h3>
      <div className="form form--2">
        <div className="field"><label htmlFor="b-hva">Hva</label><input id="b-hva" required value={verdi.hva} onChange={sett('hva')} placeholder="Innkjøp av scoreboard" /></div>
        <div className="field"><label htmlFor="b-belop">Beløp (kr)</label><input id="b-belop" required inputMode="decimal" value={verdi.belop} onChange={sett('belop')} placeholder="2193,75" /></div>
        <div className="field"><label htmlFor="b-dato">Kjøpsdato</label><input id="b-dato" type="date" required value={verdi.dato} onChange={sett('dato')} /></div>
        {alle && (
          <div className="field">
            <label htmlFor="b-gruppe">Gruppe</label>
            <select id="b-gruppe" value={verdi.sport_slug ?? '__felles'} onChange={(e) => setVerdi({ ...verdi, sport_slug: e.target.value === '__felles' ? null : e.target.value })}>
              {grupper.map((g) => <option key={nøkkel(g.slug)} value={g.slug ?? '__felles'}>{g.name}</option>)}
            </select>
          </div>
        )}
        {poster.length > 0 && (
          <div className="field">
            <label htmlFor="b-post">Budsjettlinje</label>
            <select id="b-post" value={verdi.post_id || ''} onChange={sett('post_id')}>
              <option value="">Ingen bestemt</option>
              {poster.map((p) => <option key={p.id} value={p.id}>{p.aktivitet}</option>)}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="b-fil">Kvittering</label>
          <input id="b-fil" type="file" accept={GODTAR} onChange={(e) => setFil(e.target.files?.[0] || null)} />
          <span className="hint">Bilde eller PDF, maks 25 MB. Kan legges til senere.</span>
        </div>
        <div className="field"><label htmlFor="b-notat">Notat</label><input id="b-notat" value={verdi.notat || ''} onChange={sett('notat')} placeholder="Valgfritt" /></div>
      </div>
      <div className="editor__actions">
        <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
          <button className="btn btn--primary btn--sm" disabled={busy}>{busy ? 'Lagrer …' : 'Legg inn'}</button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onAvbryt} disabled={busy}>Avbryt</button>
        </div>
      </div>
    </form>
  );
}

/* Kvitteringen ligger i en lukket bøtte. Lenken lages først når noen
   faktisk skal se på den, og varer ti minutter. */
function Kvittering({ bilag }) {
  const [henter, setHenter] = useState(false);
  if (!bilag.fil_path) return <span className="muted">Mangler</span>;
  return (
    <button
      type="button"
      className="linkish"
      disabled={henter}
      onClick={async () => {
        setHenter(true);
        const u = await signertLenke(bilag.fil_path);
        setHenter(false);
        if (u) window.open(u, '_blank', 'noopener');
      }}
    >
      {henter ? 'Åpner …' : bilag.fil_navn || 'Se kvittering'}
    </button>
  );
}

/* ---------- Budsjett ---------- */

function Budsjett({ poster, bilag, tildeling, periode, gruppe, alle, grupper, access, etter, toast }) {
  const confirm = useConfirm();
  const [ny, setNy] = useState(null);
  const t = tildeling.find((x) => (x.sport_slug || null) === (gruppe || null));

  async function lagre(e) {
    e.preventDefault();
    const budsjettert = Number(String(ny.budsjettert).replace(',', '.'));
    if (!ny.aktivitet.trim()) { toast('Hva heter linja?', 'error'); return; }
    if (!Number.isFinite(budsjettert)) { toast('Beløpet må være et tall.', 'error'); return; }
    const r = await db.lagrePost({
      ...(ny.id ? { id: ny.id } : {}),
      periode_id: periode.id, sport_slug: ny.sport_slug ?? gruppe ?? null,
      aktivitet: ny.aktivitet.trim(), beskrivelse: ny.beskrivelse || null,
      budsjettert, kommentar: ny.kommentar || null,
    });
    if (r.error) { toast(r.error.message, 'error'); return; }
    toast('Lagret.'); setNy(null); etter();
  }

  async function slett(p) {
    if (!(await confirm({ title: 'Slette budsjettlinja?', body: p.aktivitet, ok: 'Slett', danger: true }))) return;
    const r = await db.slettPost(p.id);
    if (r.error) toast(r.error.message, 'error'); else { toast('Slettet.'); etter(); }
  }

  const bruktPå = (postId) => sum(bilag.filter((b) => b.post_id === postId && teller(b)));

  return (
    <>
      {access.isAdmin && !alle && <Tildeling tildeling={t} periode={periode} gruppe={gruppe} etter={etter} toast={toast} />}
      <Panel
        title="Budsjettlinjer"
        intro="Det som er planlagt. Bilag kan knyttes til en linje, så ser du hvor mye av den som er brukt."
        actions={!ny && <button type="button" className="btn btn--primary btn--sm" onClick={() => setNy({ aktivitet: '', beskrivelse: '', budsjettert: '', kommentar: '', sport_slug: gruppe ?? null })}>+ Ny linje</button>}
        pad={false}
      >
        {ny && (
          <form className="editor form" onSubmit={lagre}>
            <h3>{ny.id ? 'Endre linje' : 'Ny budsjettlinje'}</h3>
            <div className="form form--2">
              <div className="field"><label htmlFor="p-akt">Aktivitet</label><input id="p-akt" required value={ny.aktivitet} onChange={(e) => setNy({ ...ny, aktivitet: e.target.value })} placeholder="Halleie Kjølnes Arena" /></div>
              <div className="field"><label htmlFor="p-sum">Budsjettert (kr)</label><input id="p-sum" required inputMode="decimal" value={ny.budsjettert} onChange={(e) => setNy({ ...ny, budsjettert: e.target.value })} placeholder="14500" /></div>
              <div className="field"><label htmlFor="p-besk">Beskrivelse</label><input id="p-besk" value={ny.beskrivelse || ''} onChange={(e) => setNy({ ...ny, beskrivelse: e.target.value })} placeholder="175 kr/t × 4 t × 15 uker" /></div>
              <div className="field"><label htmlFor="p-komm">Kommentar</label><input id="p-komm" value={ny.kommentar || ''} onChange={(e) => setNy({ ...ny, kommentar: e.target.value })} /></div>
            </div>
            <div className="editor__actions">
              <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                <button className="btn btn--primary btn--sm">Lagre</button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setNy(null)}>Avbryt</button>
              </div>
            </div>
          </form>
        )}
        {poster.length === 0 ? (
          <Empty title="Ingen budsjettlinjer" body="Legg inn det som er planlagt for semesteret, så ser du hvor mye som er igjen å disponere." />
        ) : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Aktivitet</th><th className="tall">Budsjettert</th><th className="tall">Brukt</th><th className="tall">Igjen</th><th /></tr></thead>
            <tbody>
              {poster.map((p) => {
                const brukt = bruktPå(p.id);
                const igjen = Math.round((Number(p.budsjettert) - brukt) * 100) / 100;
                return (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.aktivitet}</strong>
                      {p.beskrivelse && <div className="muted">{p.beskrivelse}</div>}
                      {p.kommentar && <div className="muted"><em>{p.kommentar}</em></div>}
                    </td>
                    <td className="tall">{kr(p.budsjettert)}</td>
                    <td className="tall">{brukt ? kr(brukt) : <span className="muted">–</span>}</td>
                    <td className={`tall${igjen < 0 ? ' er-over' : ''}`}>{kr(igjen)}</td>
                    <td className="table__actions">
                      <Menu items={[['Endre', () => setNy(p)], ['Slett', () => slett(p), true]]} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr><th>Til sammen</th><th className="tall">{kr(sum(poster.map((p) => p.budsjettert)))}</th><th colSpan={3} /></tr></tfoot>
          </table></div>
        )}
      </Panel>
    </>
  );
}

/* Tildelingen er styrets sak, ikke gruppas. RLS sier det samme, så dette
   skjemaet vises bare for admin. */
function Tildeling({ tildeling, periode, gruppe, etter, toast }) {
  const [v, setV] = useState(null);
  const nå = v || { innvilget: tildeling?.innvilget ?? '', overfort: tildeling?.overfort ?? '', kilde: tildeling?.kilde ?? 'SSN' };
  async function lagre(e) {
    e.preventDefault();
    const r = await db.lagreTildeling({
      ...(tildeling?.id ? { id: tildeling.id } : {}),
      periode_id: periode.id, sport_slug: gruppe || null,
      innvilget: Number(String(nå.innvilget).replace(',', '.')) || 0,
      overfort: Number(String(nå.overfort).replace(',', '.')) || 0,
      kilde: nå.kilde || null,
    });
    if (r.error) { toast(r.error.message, 'error'); return; }
    toast('Tildelingen er lagret.'); setV(null); etter();
  }
  return (
    <Panel title="Tildeling" intro="Det gruppa har fått for perioden. Settes av styret.">
      <form className="form form--2" onSubmit={lagre}>
        <div className="field"><label htmlFor="t-inn">Innvilget (kr)</label><input id="t-inn" inputMode="decimal" value={nå.innvilget} onChange={(e) => setV({ ...nå, innvilget: e.target.value })} /></div>
        <div className="field"><label htmlFor="t-over">Overført fra i fjor (kr)</label><input id="t-over" inputMode="decimal" value={nå.overfort} onChange={(e) => setV({ ...nå, overfort: e.target.value })} /></div>
        <div className="field"><label htmlFor="t-kilde">Kilde</label><input id="t-kilde" value={nå.kilde || ''} onChange={(e) => setV({ ...nå, kilde: e.target.value })} placeholder="SSN" /></div>
        <div className="field" style={{ alignSelf: 'end' }}><button className="btn btn--primary btn--sm">Lagre tildeling</button></div>
      </form>
    </Panel>
  );
}

/* ---------- Utlegg ---------- */

function Utlegg({ utlegg, bilag, gruppe, alle, grupper, me, access, content, etter, toast }) {
  const confirm = useConfirm();
  const [åpent, setÅpent] = useState(null);

  async function nytt() {
    const g = grupper.find((x) => (x.slug || null) === (gruppe || null));
    const r = await db.lagreUtlegg({
      sport_slug: gruppe || null,
      navn: '', adresse: '', kontonummer: '',
      gjelder: `Utlegg for ${g?.name || 'PSI'}`,
      type: gruppe ? 'undergruppe' : 'drift',
      opprettet_av: me,
    });
    if (r.error) { toast(r.error.message, 'error'); return; }
    setÅpent(r.data); etter();
  }

  async function slett(u) {
    if (!(await confirm({ title: 'Slette utlegget?', body: 'Bilagene blir liggende, men løsnes fra dette kravet.', ok: 'Slett', danger: true }))) return;
    const r = await db.slettUtlegg(u.id);
    if (r.error) toast(r.error.message, 'error'); else { toast('Slettet.'); setÅpent(null); etter(); }
  }

  if (alle && !access.isAdmin) return <Empty title="Velg en gruppe" body="Utlegg lages per gruppe." />;

  return (
    <>
      <Panel
        title="Utlegg til SiG"
        intro="Samler bilag til ett refusjonskrav, og lager PDF-en med kvitteringene nummerert bakpå – klar til å sendes michael@sig.no."
        actions={!alle && <button type="button" className="btn btn--primary btn--sm" onClick={nytt}>+ Nytt utlegg</button>}
        pad={false}
      >
        {utlegg.length === 0 ? (
          <Empty title="Ingen utlegg ennå" body={alle ? 'Velg en gruppe for å lage ett.' : 'Lag ett når du har bilag som skal refunderes.'} />
        ) : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Gjelder</th><th>Navn</th><th className="tall">Sum</th><th>Status</th><th /></tr></thead>
            <tbody>
              {utlegg.map((u) => {
                const mine = bilag.filter((b) => b.utlegg_id === u.id);
                return (
                  <tr key={u.id}>
                    <td><button type="button" className="linkish" onClick={() => setÅpent(u)}>{u.gjelder || 'Uten beskrivelse'}</button><div className="muted">{mine.length} bilag</div></td>
                    <td>{u.navn || <em className="muted">Mangler navn</em>}</td>
                    <td className="tall">{kr(sum(mine))}</td>
                    <td><StatusPill status={u.status === 'utkast' ? 'draft' : u.status === 'sendt' ? 'published' : 'ok'} /></td>
                    <td className="table__actions"><Menu items={[['Åpne', () => setÅpent(u)], ['Slett', () => slett(u), true]]} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </Panel>
      {åpent && (
        <UtleggSkjema
          utlegg={åpent} bilag={bilag} grupper={grupper} content={content}
          onLukk={() => setÅpent(null)} etter={etter} toast={toast}
        />
      )}
    </>
  );
}

function UtleggSkjema({ utlegg, bilag, grupper, content, onLukk, etter, toast }) {
  const [u, setU] = useState(utlegg);
  const [valgte, setValgte] = useState(() => bilag.filter((b) => b.utlegg_id === utlegg.id).map((b) => b.id));
  const [jobber, setJobber] = useState(false);
  const sett = (k) => (e) => setU({ ...u, [k]: e.target.value });

  // Bilag som kan tas med: gruppas egne, som ikke alt ligger i et annet krav.
  const mulige = bilag.filter((b) => teller(b) && (!b.utlegg_id || b.utlegg_id === u.id));
  const linjer = valgte.map((id, i) => {
    const b = mulige.find((x) => x.id === id);
    return b ? { nummer: i + 1, beskrivelse: b.hva, belop: Number(b.belop), bilag: b } : null;
  }).filter(Boolean);

  async function lagre() {
    const r = await db.lagreUtlegg({ id: u.id, navn: u.navn, adresse: u.adresse, kontonummer: u.kontonummer, gjelder: u.gjelder, type: u.type, status: u.status });
    if (r.error) { toast(r.error.message, 'error'); return false; }
    const k = await db.knyttTilUtlegg(u.id, valgte);
    if (k.error) { toast(k.error.message, 'error'); return false; }
    etter();
    return true;
  }

  async function lagPdf() {
    if (!u.navn?.trim()) { toast('Skjemaet trenger navnet ditt.', 'error'); return; }
    if (linjer.length === 0) { toast('Velg minst ett bilag.', 'error'); return; }
    setJobber(true);
    try {
      if (!(await lagre())) return;
      const { lagUtleggPdf } = await import('../../lib/utlegg-pdf.js');
      const vedlegg = [];
      for (const l of linjer) {
        vedlegg.push({ nummer: l.nummer, bytes: await hentBytes(l.bilag.fil_path) });
      }
      const g = grupper.find((x) => (x.slug || null) === (u.sport_slug || null));
      const bytes = await lagUtleggPdf({
        navn: u.navn, adresse: u.adresse, kontonummer: u.kontonummer,
        gjelder: u.gjelder, type: u.type, gruppe: g?.name || '',
        dato: new Date().toLocaleDateString('nb-NO'),
        linjer, vedlegg,
      });
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `utlegg-${(g?.name || 'psi').toLowerCase().replace(/\s+/g, '-')}-${idag()}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      const uten = linjer.filter((l) => !l.bilag.fil_path).length;
      toast(uten ? `PDF laget, men ${uten} bilag mangler kvittering.` : 'PDF laget. Send den til michael@sig.no.', uten ? 'error' : undefined);
    } catch (e) {
      toast(e.message || 'Klarte ikke lage PDF-en.', 'error');
    } finally {
      setJobber(false);
    }
  }

  return (
    <Panel
      title="Refusjonskrav"
      intro="Feltene er de samme som i SiG sitt skjema. Bilagene du huker av blir vedlegg 1, 2, 3 … i den rekkefølgen de står."
      actions={<button type="button" className="btn btn--ghost btn--sm" onClick={onLukk}>Lukk</button>}
    >
      <div className="form form--2">
        <div className="field"><label htmlFor="u-navn">Navn</label><input id="u-navn" value={u.navn || ''} onChange={sett('navn')} placeholder="Fornavn Etternavn" /></div>
        <div className="field"><label htmlFor="u-konto">Kontonummer</label><input id="u-konto" value={u.kontonummer || ''} onChange={sett('kontonummer')} placeholder="1234 56 78901" /></div>
        <div className="field"><label htmlFor="u-adr">Adresse</label><input id="u-adr" value={u.adresse || ''} onChange={sett('adresse')} /></div>
        <div className="field">
          <label htmlFor="u-type">Utleggene gjelder</label>
          <select id="u-type" value={u.type} onChange={sett('type')}>
            <option value="undergruppe">Undergruppe</option>
            <option value="drift">Driftsutgifter</option>
            <option value="styre">Styreutgifter</option>
          </select>
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label htmlFor="u-gjelder">Hva som kreves refundert, og hvem som har godkjent innkjøpet</label>
          <input id="u-gjelder" value={u.gjelder || ''} onChange={sett('gjelder')} />
        </div>
      </div>

      <h3 style={{ marginTop: 'var(--sp-5)' }}>Bilag i kravet</h3>
      {mulige.length === 0 ? (
        <p className="muted">Ingen ledige bilag på denne gruppa. Legg inn kvitteringer under «Bilag» først.</p>
      ) : (
        <ul className="velgliste">
          {mulige.map((b) => {
            const i = valgte.indexOf(b.id);
            return (
              <li key={b.id}>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={i >= 0}
                    onChange={() => setValgte(i >= 0 ? valgte.filter((x) => x !== b.id) : [...valgte, b.id])}
                  />
                  <span className="velgliste__nr">{i >= 0 ? i + 1 : '–'}</span>
                  <span>{b.hva} <span className="muted">· {b.dato}</span></span>
                </label>
                <span className="tall">{kr(b.belop)}</span>
                {!b.fil_path && <span className="pill pill--warn">Mangler kvittering</span>}
              </li>
            );
          })}
        </ul>
      )}

      <div className="okon__sum">
        <span>Totalt å få refundert</span>
        <strong>{kr(sum(linjer.map((l) => l.belop)))}</strong>
      </div>

      <div className="editor__actions">
        <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn--primary btn--sm" onClick={lagPdf} disabled={jobber}>
            {jobber ? 'Lager PDF …' : 'Lag PDF med vedlegg'}
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={async () => { if (await lagre()) toast('Lagret.'); }} disabled={jobber}>Lagre</button>
          <a className="btn btn--ghost btn--sm" href={`mailto:michael@sig.no?subject=${encodeURIComponent(`Refusjon av utlegg – ${u.gjelder || 'PSI'}`)}&body=${encodeURIComponent('Hei!\n\nVedlagt følger utleggsskjema med kvitteringer.\n\nMvh\n' + (u.navn || ''))}`}>
            Åpne e-post til Michael
          </a>
        </div>
      </div>
      <p className="hint muted">PDF-en lastes ned til maskinen din. Legg den ved e-posten – nettleseren får ikke lov til å gjøre det for deg.</p>
    </Panel>
  );
}
