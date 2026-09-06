import { useMemo, useState } from 'react';
import { Panel, Empty, useToast, useConfirm } from '../ui.jsx';
import { db, koblingAv } from '../okonomi.js';
import { kr, nøkkel, sum, periodeNavn } from '../../lib/okonomi.js';
import { parseHovedbok, planlegg, gikkOpp } from '../../lib/hovedbok.js';

/* Import av «Kontoutskrift hovedbok, pr. avdeling» – rapporten Michael
   sender fra regnskapet.

   Rekkefølgen er med vilje: les fila, se hva som står i den, koble
   avdelinger vi ikke kjenner, og først da skrive. Ingenting går inn i
   basen før noen har sett denne lista.

   Rapporten oppgir sine egne delsummer. Stemmer de ikke med det vi har
   lest, har vi lest feil, og da tilbys ikke importen i det hele tatt. */
export default function Hovedbok({ øk, periode, grupper, access, me, etter }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [lest, setLest] = useState(null);
  const [filnavn, setFilnavn] = useState('');
  const [jobber, setJobber] = useState(false);
  const [feil, setFeil] = useState(null);
  const [ekstra, setEkstra] = useState({});

  const kobling = useMemo(() => ({ ...koblingAv(øk.avdelinger), ...ekstra }), [øk.avdelinger, ekstra]);
  const plan = useMemo(
    () => (lest ? planlegg({ linjer: lest.linjer, eksisterende: øk.hovedbok, kobling }) : null),
    [lest, øk.hovedbok, kobling],
  );

  if (øk.utenHovedbok) {
    return (
      <Panel title="Hovedbokimport er ikke satt opp ennå">
        <p className="muted">Tabellene for import finnes ikke i databasen ennå.</p>
        <pre className="code"><code>supabase/migrations/0013_hovedbok.sql</code></pre>
        <p className="muted">Kjør fila i Supabase → SQL Editor. Resten av økonomien virker som før.</p>
      </Panel>
    );
  }
  if (!access.isAdmin) {
    return <Empty title="Bare PSI-admin importerer regnskapet" body="Tallene fra hovedboken vises i oversikten og på bilagene." />;
  }

  async function lesFil(fil) {
    if (!fil) return;
    setFeil(null); setLest(null); setEkstra({}); setFilnavn(fil.name);
    setJobber(true);
    try {
      const { pdfTilLinjer } = await import('../../lib/pdf-tekst.js');
      const bytes = new Uint8Array(await fil.arrayBuffer());
      const linjer = await pdfTilLinjer(bytes);
      const r = parseHovedbok(linjer);
      if (r.linjer.length === 0) {
        setFeil('Fant ingen bokføringslinjer i fila. Er dette «Kontoutskrift hovedbok, pr. avdeling»?');
      } else {
        setLest(r);
      }
    } catch (e) {
      setFeil(e.message || 'Klarte ikke lese PDF-en.');
    } finally {
      setJobber(false);
    }
  }

  async function importer() {
    if (!plan || !lest) return;
    if (plan.ukjenteAvdelinger.length) { toast('Koble alle avdelingene først.', 'error'); return; }
    const antall = plan.nye.length + plan.endret.length;
    if (antall === 0) { toast('Alt i rapporten ligger allerede inne. Ingenting å gjøre.'); return; }
    const ok = await confirm({
      title: `Importere ${antall} ${antall === 1 ? 'linje' : 'linjer'}?`,
      body: `${plan.nye.length} nye og ${plan.endret.length} endrede, ført på ${periodeNavn(periode)}. Linjer som allerede ligger inne røres ikke.`,
      ok: 'Importer',
    });
    if (!ok) return;
    setJobber(true);
    const r = await db.importerHovedbok({
      nye: plan.nye,
      endret: plan.endret,
      meta: { filnavn, ar: lest.ar, konto: lest.konto, sum: lest.sum, oppgittSum: lest.oppgittSum, av: me, periodeId: periode?.id },
    });
    setJobber(false);
    if (r.error) { toast(r.error.message, 'error'); return; }
    toast(`Importert. ${plan.nye.length} nye linjer.`);
    setLest(null); setFilnavn('');
    etter();
  }

  return (
    <>
      <Panel
        title="Importer hovedbok"
        intro="Rapporten «Kontoutskrift hovedbok, pr. avdeling» fra SiG. Dra fila hit eller velg den – ingenting lagres før du har sett hva som står i den."
      >
        <div className="field">
          <label htmlFor="hb-fil">PDF fra regnskapet</label>
          <input id="hb-fil" type="file" accept="application/pdf" disabled={jobber} onChange={(e) => lesFil(e.target.files?.[0])} />
          <span className="hint">Samme rapport kan importeres om igjen. Linjer som allerede ligger inne, legges ikke inn på nytt.</span>
        </div>
        {jobber && <p className="muted">Leser …</p>}
        {feil && <div className="notice notice--warn">{feil}</div>}
      </Panel>

      {lest && (
        <>
          <Panel title="Slik leste vi rapporten">
            <dl className="okon__fakta">
              <div><dt>År</dt><dd>{lest.ar || '–'}</dd></div>
              <div><dt>Konto</dt><dd>{lest.konto || '–'}</dd></div>
              <div><dt>Linjer</dt><dd>{lest.linjer.length}</dd></div>
              <div><dt>Sum</dt><dd>{kr(lest.sum)}</dd></div>
            </dl>
            {/* Rapporten oppgir sine egne summer. Det er den beste
                kontrollen vi har på at vi har lest riktig. */}
            {gikkOpp(lest) ? (
              <div className="notice">
                Summene går opp: {kr(lest.sum)} lest, {kr(lest.oppgittSum)} oppgitt i rapporten.
              </div>
            ) : (
              <div className="notice notice--warn">
                <strong>Tallene går ikke opp.</strong> Da har vi lest fila feil, og importen er slått av.
                <ul>{lest.advarsler.map((a, i) => <li key={i}>{a}</li>)}</ul>
              </div>
            )}
          </Panel>

          <Panel title="Avdelinger" intro="Avdelingsnummeret er gruppa. Hvilket nummer som er hvilken gruppe står ikke i rapporten, så det settes her – én gang." pad={false}>
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Avdeling</th><th>Gruppe</th><th className="tall">Linjer</th><th className="tall">Sum</th><th>Eksempel</th></tr></thead>
              <tbody>
                {lest.avdelinger.map((a) => {
                  const koblet = kobling[a.nr] !== undefined;
                  const eksempel = a.linjer.find((l) => l.tekst)?.tekst || '';
                  return (
                    <tr key={a.nr} className={koblet ? undefined : 'er-mangler'}>
                      <td><strong>{a.nr}</strong></td>
                      <td>
                        <select
                          value={koblet ? (kobling[a.nr] ?? '__felles') : ''}
                          onChange={(e) => setEkstra({ ...ekstra, [a.nr]: e.target.value === '__felles' ? null : e.target.value })}
                          aria-label={`Gruppe for avdeling ${a.nr}`}
                        >
                          <option value="">Velg gruppe …</option>
                          {grupper.map((g) => <option key={nøkkel(g.slug)} value={g.slug ?? '__felles'}>{g.name}</option>)}
                        </select>
                      </td>
                      <td className="tall">{a.linjer.length}</td>
                      <td className="tall">{kr(a.sum)}</td>
                      <td className="muted">{eksempel.slice(0, 44)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          </Panel>

          <Panel
            title="Hva importen vil gjøre"
            intro={`Føres på ${periodeNavn(periode)}.`}
            actions={
              <button
                type="button"
                className="btn btn--primary btn--sm"
                disabled={jobber || !gikkOpp(lest) || plan.ukjenteAvdelinger.length > 0}
                onClick={importer}
              >
                {jobber ? 'Importerer …' : `Importer ${plan.nye.length + plan.endret.length} linjer`}
              </button>
            }
          >
            <dl className="okon__fakta">
              <div><dt>Nye</dt><dd>{plan.nye.length}</dd></div>
              <div><dt>Endret siden sist</dt><dd>{plan.endret.length}</dd></div>
              <div><dt>Ligger inne fra før</dt><dd>{plan.uendret.length}</dd></div>
              <div><dt>Beløp som kommer inn</dt><dd>{kr(sum(plan.nye))}</dd></div>
            </dl>
            {plan.ukjenteAvdelinger.length > 0 && (
              <div className="notice notice--warn">
                Avdeling {plan.ukjenteAvdelinger.join(', ')} er ikke koblet til noen gruppe. Velg gruppe over først.
              </div>
            )}
            {plan.nye.length > 0 && (
              <div className="table-wrap" style={{ marginTop: 'var(--sp-4)' }}>
                <table className="table">
                  <thead><tr><th>Dato</th><th>Bilag</th><th>Tekst</th><th>Gruppe</th><th className="tall">Beløp</th></tr></thead>
                  <tbody>
                    {plan.nye.slice(0, 40).map((r) => (
                      <tr key={r.nokkel}>
                        <td className="muted">{r.dato}</td>
                        <td className="muted">{r.bilagsnr}</td>
                        <td>{r.tekst || <em className="muted">uten tekst</em>}</td>
                        <td className="muted">{grupper.find((g) => (g.slug || null) === (r.sport_slug || null))?.name || '–'}</td>
                        <td className="tall">{kr(r.belop)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {plan.nye.length > 40 && <p className="muted">… og {plan.nye.length - 40} til.</p>}
              </div>
            )}
          </Panel>
        </>
      )}

      {øk.importer.length > 0 && (
        <Panel title="Tidligere importer" pad={false}>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Fil</th><th>Når</th><th>Av</th><th className="tall">Nye</th><th className="tall">Sum i rapporten</th></tr></thead>
            <tbody>
              {øk.importer.map((i) => (
                <tr key={i.id}>
                  <td>{i.filnavn || '–'}</td>
                  <td className="muted">{(i.created_at || '').slice(0, 16).replace('T', ' ')}</td>
                  <td className="muted">{i.importert_av || '–'}</td>
                  <td className="tall">{i.nye}</td>
                  <td className="tall">{kr(i.oppgitt_sum)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </Panel>
      )}
    </>
  );
}
