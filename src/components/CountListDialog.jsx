import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, FileSpreadsheet, Printer, Users, Copy, Pencil, Check } from 'lucide-react';
import { Dialog } from './Dialog.jsx';
import {
  countItem, ensureIds, needsIds, parseCountLine, groupItems, countTotals,
  bumpLocal, removeById, toCsv, csvName, renameItem, renameGroup,
} from '../lib/countList.js';

const STEPS = [1, 5, 10];

/**
 * Telleliste — inventar og opptelling, delt i sanntid.
 *
 * Hovedvare med varianter under (Sko → 39, 40, 41), antall som økes i
 * valgte steg (1/5/10), og eksport til Excel (CSV) eller utskrift/PDF.
 *
 * Økninger går gjennom onBump, som teller atomisk i databasen — flere kan
 * telle hver sine varer samtidig uten å overskrive hverandre. Alt annet
 * (nye linjer, sletting, navn) skriver hele listen som før.
 */
export function CountListDialog({ list, onClose, onUpdate, onBump, onRename, onCopy, onDelete, toast }) {
  const items = list.items ?? [];
  const [editName, setEditName] = useState(null);   // null = viser, streng = redigerer
  // Hvilken linje eller hovedvare som får nytt navn: {kind:'row'|'group', key, value}
  const [editing, setEditing] = useState(null);
  // { id, text } mens et antall tastes inn. Skrives først ved blur.
  const [qtyDraft, setQtyDraft] = useState(null);
  const [step, setStep] = useState(() => {
    try { return Number(localStorage.getItem('pl.count.step')) || 1; } catch { return 1; }
  });
  const [draft, setDraft] = useState('');
  const [variantFor, setVariantFor] = useState(null);   // hovedvare det legges variant på
  const [variantDraft, setVariantDraft] = useState('');
  const variantRef = useRef(null);

  // Gamle lister (laget som pakkeliste) mangler stabile id-er — uten dem
  // kan ikke tellingen skje atomisk. Fyll dem inn én gang.
  useEffect(() => {
    if (needsIds(items)) onUpdate(list.id, { items: ensureIds(items) });
  }, [list.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (variantFor !== null) variantRef.current?.focus(); }, [variantFor]);

  const pickStep = (n) => {
    setStep(n);
    try { localStorage.setItem('pl.count.step', String(n)); } catch { /* ignorer */ }
  };

  const groups = groupItems(items);
  const { lines, units } = countTotals(items);

  /** Øk/senk én linje — atomisk i databasen. */
  const bump = (item, delta) => onBump(list.id, item.id, delta);

  const startEdit = (kind, key, value) => setEditing({ kind, key, value });

  /** Skriver det innskrevne tallet som ÉN differanse, atomisk som −/+. */
  const commitQty = (item) => {
    if (qtyDraft?.id !== item.id) return;
    const next = Math.max(0, Math.min(999999, Math.floor(Number(qtyDraft.text) || 0)));
    const delta = next - (Number(item.qty) || 0);
    setQtyDraft(null);
    if (delta !== 0) bump(item, delta);
  };

  const saveEdit = (e) => {
    e.preventDefault();
    const { kind, key, value } = editing;
    const name = value.trim();
    // Uendret navn skal ikke koste en skriving. For grupper ER key navnet,
    // men for rader er key en id — sammenlignet mot den traff sjekken aldri,
    // og hver «Lagre» skrev hele lista på nytt.
    const current = kind === 'group' ? key : (items.find((i) => i.id === key)?.n ?? '');
    if (!name || name === current) { setEditing(null); return; }
    onRename(list.id, kind, key, name);
    setEditing(null);
  };

  /**
   * Samme skjema for begge navnene. BEVISST en funksjon som returnerer
   * JSX, ikke en komponent definert her inne — en nestet komponent får ny
   * identitet for hver render, og da monterer React feltet på nytt og
   * fokus forsvinner mellom hvert tastetrykk.
   */
  const nameForm = (label) => (
    <form onSubmit={saveEdit} className="row" style={{ gap: 6, flex: 1 }}>
      <input
        className="input"
        value={editing.value}
        onChange={(e) => setEditing({ ...editing, value: e.target.value })}
        aria-label={label}
        autoFocus
        onKeyDown={(e) => { if (e.key === 'Escape') setEditing(null); }}
      />
      <button type="submit" className="btn btn-primary btn-sm" disabled={!editing.value.trim()}>Lagre</button>
      <button type="button" className="btn btn-sm" onClick={() => setEditing(null)}>Avbryt</button>
    </form>
  );

  const addLine = (e) => {
    e.preventDefault();
    const { group, name, qty } = parseCountLine(draft);
    if (!name) return;
    onUpdate(list.id, { items: [...ensureIds(items), countItem(group, name, qty)] });
    setDraft('');
  };

  const addVariant = (e) => {
    e.preventDefault();
    const { name, qty } = parseCountLine(variantDraft);
    if (!name) return;
    onUpdate(list.id, { items: [...ensureIds(items), countItem(variantFor, name, qty)] });
    setVariantDraft('');
  };

  const download = () => {
    const blob = new Blob([toCsv(list)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = csvName(list);
    a.click();
    URL.revokeObjectURL(a.href);
    toast?.('Regnearket er lastet ned');
  };

  /** Utskrift → «Lagre som PDF» i utskriftsdialogen. */
  const print = () => {
    const rows = groups.map((g) => `
      <tr class="grp"><td colspan="2">${esc(g.group ?? 'Uten hovedvare')}</td><td class="n">${g.sum}</td></tr>
      ${g.rows.map((r) => `<tr><td></td><td>${esc(r.n)}</td><td class="n">${Number(r.qty) || 0}</td></tr>`).join('')}
    `).join('');
    const html = `<!doctype html><html lang="no"><head><meta charset="utf-8">
      <title>${esc(list.name)}</title>
      <style>
        body { font-family: Georgia, 'Times New Roman', serif; color:#211d19; margin:32px; }
        h1 { font-size:24px; margin:0 0 4px; }
        .meta { font-family: Arial, sans-serif; font-size:12px; color:#726a61; margin:0 0 20px; }
        table { width:100%; border-collapse:collapse; font-family: Arial, sans-serif; font-size:13px; }
        th { text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:.06em;
             color:#726a61; border-bottom:2px solid #211d19; padding:6px 8px; }
        td { padding:6px 8px; border-bottom:1px solid #e6ded1; }
        td.n { text-align:right; font-variant-numeric:tabular-nums; width:80px; }
        tr.grp td { font-weight:bold; background:#f8f5ef; }
        tfoot td { font-weight:bold; border-top:2px solid #211d19; border-bottom:none; font-size:15px; }
      </style></head><body>
      <h1>${esc(list.name)}</h1>
      <p class="meta">Telleliste · ${lines} linjer · skrevet ut ${new Date().toLocaleDateString('nb-NO')}</p>
      <table>
        <thead><tr><th>Hovedvare</th><th>Variant</th><th class="n">Antall</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="2">Totalt</td><td class="n">${units}</td></tr></tfoot>
      </table>
      </body></html>`;

    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(frame);
    const doc = frame.contentWindow.document;
    doc.open(); doc.write(html); doc.close();
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 1500);
  };

  return (
    <Dialog
      title={list.name}
      subtitle={`Telleliste · ${list.shared ? 'delt' : 'privat'}`}
      onClose={onClose}
      footer={(
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={download}>
            <FileSpreadsheet size={15} /> Last ned Excel
          </button>
          <button type="button" className="btn" onClick={print}>
            <Printer size={15} /> PDF
          </button>
        </div>
      )}
    >
      {/* Totalen — det man er her for */}
      <div style={{
        background: 'var(--color-text)', color: 'var(--color-surface)',
        borderRadius: 'var(--radius-lg)', padding: '16px 18px', marginBottom: 'var(--space-4)',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', opacity: 0.75 }}>
          Totalt talt
        </div>
        <div className="tnum" style={{
          fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 40, lineHeight: 1.05, marginTop: 2,
        }}>
          {units}
        </div>
        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>
          fordelt på {lines} {lines === 1 ? 'linje' : 'linjer'}
          {groups.length > 1 ? ` i ${groups.length} hovedvarer` : ''}
        </div>
      </div>

      {/* Steg: hvor mye hvert trykk teller */}
      <div className="row" style={{ gap: 10, marginBottom: 'var(--space-4)' }}>
        <span className="card-kicker" style={{ marginBottom: 0 }}>Hvert trykk</span>
        <div className="seg" style={{ flex: 1 }}>
          {STEPS.map((n) => (
            <button
              key={n}
              type="button"
              className="seg-opt tnum"
              aria-pressed={step === n}
              onClick={() => pickStep(n)}
            >
              +{n}
            </button>
          ))}
        </div>
      </div>

      {/* Legg til linje */}
      <form onSubmit={addLine} className="row" style={{ gap: 8, marginBottom: 'var(--space-4)' }}>
        <input
          className="input"
          placeholder="Sko / 39 — eller bare «Kjegler»"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Legg til hovedvare og variant"
        />
        <button type="submit" className="btn" disabled={!draft.trim()}>
          <Plus size={15} /> Legg til
        </button>
      </form>

      {!items.length && (
        <p className="text-muted" style={{ fontSize: 13 }}>
          Tom telleliste. Skriv «Sko / 39» for å få hovedvare med variant under,
          eller bare «Kjegler» for en enkel linje. Alle som har listen kan telle
          samtidig — tellingene legges sammen.
        </p>
      )}

      {/* Gruppene */}
      {groups.map((g) => (
        <div key={g.group ?? '_'} style={{ marginBottom: 'var(--space-4)' }}>
          <div className="row-between" style={{
            borderBottom: '2px solid var(--color-divider-strong)', paddingBottom: 6, marginBottom: 2,
          }}>
            {editing?.kind === 'group' && editing.key === g.group ? (
              nameForm(`Nytt navn på ${g.group}`)
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => g.group && startEdit('group', g.group, g.group)}
                  disabled={!g.group}
                  title={g.group ? 'Trykk for å endre navn' : undefined}
                  style={{
                    background: 'none', border: 0, padding: 0, textAlign: 'left',
                    cursor: g.group ? 'pointer' : 'default', color: 'inherit',
                    fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 17,
                  }}
                >
                  {g.group ?? 'Enkeltlinjer'}
                </button>
                <span className="tag tag-herb tnum">{g.sum}</span>
              </>
            )}
          </div>

          {g.rows.map((item) => (
            <div key={item.id} className="item-row" style={{ paddingLeft: 0, paddingRight: 0 }}>
              {editing?.kind === 'row' && editing.key === item.id ? (
                nameForm(`Nytt navn på ${item.n}`)
              ) : (
                <button
                  type="button"
                  className="item-mid"
                  onClick={() => startEdit('row', item.id, item.n)}
                  title="Trykk for å endre navn"
                  style={{
                    background: 'none', border: 0, padding: 0, textAlign: 'left',
                    cursor: 'pointer', color: 'inherit',
                  }}
                >
                  <div className="item-name">{item.n}</div>
                </button>
              )}
              <div className="row" style={{ gap: 6, flexShrink: 0 }}>
                <div className="stepper">
                  <button
                    type="button" className="stepper-btn"
                    onClick={() => bump(item, -step)}
                    aria-label={`Færre ${item.n}`}
                  >
                    −
                  </button>
                  <input
                    className="stepper-val tnum"
                    style={{
                      minWidth: 52, border: 'none', textAlign: 'center', fontSize: 16,
                      fontWeight: 700, background: 'var(--color-surface)', padding: '4px 2px',
                    }}
                    inputMode="numeric"
                    // Redigeres lokalt, og skrives FØRST når feltet forlates.
                    // Før gikk hvert tastetrykk rett i databasen som en egen
                    // differanse: «12» → «1» → «15» lagret mellomtilstanden 1
                    // for alle som telte samtidig, og ett bokstavtrykk gjorde
                    // Number('12x') til 0 og nullstilte linja uten angremulighet.
                    value={qtyDraft?.id === item.id ? qtyDraft.text : String(Number(item.qty) || 0)}
                    onFocus={() => setQtyDraft({ id: item.id, text: String(Number(item.qty) || 0) })}
                    onChange={(e) => setQtyDraft({ id: item.id, text: e.target.value.replace(/[^\d]/g, '') })}
                    onBlur={() => commitQty(item)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                      if (e.key === 'Escape') setQtyDraft(null);
                    }}
                    aria-label={`Antall ${item.n}`}
                  />
                  <button
                    type="button" className="stepper-btn"
                    onClick={() => bump(item, step)}
                    aria-label={`Flere ${item.n}`}
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => onUpdate(list.id, { items: removeById(items, item.id) })}
                  aria-label={`Fjern ${item.n}`}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}

          {/* Ny variant under denne hovedvaren */}
          {g.group && (variantFor === g.group ? (
            <form onSubmit={addVariant} className="row" style={{ gap: 6, marginTop: 8 }}>
              <input
                ref={variantRef}
                className="input"
                placeholder={`Ny variant av ${g.group} …`}
                value={variantDraft}
                onChange={(e) => setVariantDraft(e.target.value)}
                aria-label={`Ny variant av ${g.group}`}
              />
              <button type="submit" className="btn btn-sm" disabled={!variantDraft.trim()}>Legg til</button>
              <button type="button" className="btn btn-sm" onClick={() => { setVariantFor(null); setVariantDraft(''); }}>
                Avbryt
              </button>
            </form>
          ) : (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ color: 'var(--color-accent)', fontWeight: 600, paddingLeft: 0, marginTop: 4 }}
              onClick={() => { setVariantFor(g.group); setVariantDraft(''); }}
            >
              + Variant av {g.group}
            </button>
          ))}
        </div>
      ))}

      <hr className="divider" style={{ margin: 'var(--space-4) 0', height: 1, background: 'var(--color-divider-soft)' }} />
      {editName === null ? (
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setEditName(list.name)}
          >
            <Pencil size={13} /> Endre navn
          </button>
          <button
            type="button"
            className={`btn btn-sm ${list.shared ? 'btn-secondary' : ''}`}
            aria-pressed={list.shared}
            onClick={() => onUpdate(list.id, { shared: !list.shared })}
          >
            {list.shared ? <><Check size={13} /> Delt</> : <><Users size={13} /> Del</>}
          </button>
        </div>
      ) : (
        <form
          className="row"
          style={{ gap: 8, marginBottom: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            const name = editName.trim();
            if (name && name !== list.name) onUpdate(list.id, { name });
            setEditName(null);
          }}
        >
          <input
            className="input"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            aria-label="Nytt navn på tellelisten"
            autoFocus
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={!editName.trim()}>Lagre</button>
          <button type="button" className="btn btn-sm" onClick={() => setEditName(null)}>Avbryt</button>
        </form>
      )}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-sm" onClick={() => onCopy(list)} title="Ny liste med samme varer og varianter, men alle tall på null">
          <Copy size={13} /> Kopier som tom mal
        </button>
        <button type="button" className="btn btn-sm" onClick={() => onDelete(list)}>
          <Trash2 size={13} /> Slett
        </button>
      </div>
      <p className="text-muted" style={{ fontSize: 11, marginTop: 'var(--space-3)', marginBottom: 0 }}>
        <Users size={11} style={{ verticalAlign: -1 }} /> Flere kan telle samtidig —
        hver økning legges til i databasen, så ingen overskriver andres tall.
        Excel-fila åpner rett i norsk Excel; PDF lager du fra utskriftsdialogen.
      </p>
    </Dialog>
  );
}

/** Escape for utskrifts-HTML. */
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
