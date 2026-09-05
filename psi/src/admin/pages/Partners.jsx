import { useState } from 'react';
import { Form } from '../Fields.jsx';
import { PARTNER_FIELDS } from '../schema.js';
import { db, fileContent } from '../api.jsx';
import { PageTitle, Panel, useToast, useConfirm, Menu, Empty } from '../ui.jsx';

export default function Partners({ data, refresh, content }) {
  const toast = useToast();
  const confirm = useConfirm();
  const list = data.content.partners?.value ?? fileContent().partners;
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  async function commit(next, msg = 'Lagret.') {
    setBusy(true);
    const { error } = await db.saveContent('partners', next);
    setBusy(false);
    if (error) { toast(error.message, 'error'); return; }
    toast(msg); setEditing(null); refresh(); content.reload();
  }
  const move = (i, d) => { const n = [...list]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); commit(n, 'Rekkefølgen er lagret.'); };

  if (editing) {
    const isNew = editing.index === -1;
    return (
      <>
        <PageTitle eyebrow={<button type="button" className="linkish" onClick={() => setEditing(null)}>← Partnere</button>} title={isNew ? 'Ny partner' : editing.row.name} />
        <form className="editor" onSubmit={(e) => { e.preventDefault(); commit(isNew ? [...list, editing.row] : list.map((p, i) => (i === editing.index ? editing.row : p))); }}>
          <Form fields={PARTNER_FIELDS} value={editing.row} onChange={(row) => setEditing((s) => ({ ...s, row }))} />
          <div className="editor__actions">
            <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
              <button className="btn btn--primary btn--sm" disabled={busy}>Lagre</button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(null)}>Avbryt</button>
            </div>
            {!isNew && <button type="button" className="btn btn--danger btn--sm" onClick={async () => (await confirm({ title: `Fjerne ${editing.row.name}?`, ok: 'Fjern', danger: true })) && commit(list.filter((_, i) => i !== editing.index), 'Fjernet.')}>Fjern</button>}
          </div>
        </form>
      </>
    );
  }
  return (
    <>
      <PageTitle eyebrow="Nettstedet" title="Partnere" intro="Vises på forsiden og /partnere, i denne rekkefølgen. Bare offisielle logofiler; uten logo vises navnet som tekst."
        actions={<button type="button" className="btn btn--primary btn--sm" onClick={() => setEditing({ index: -1, row: { name: '', shortName: '', logo: null, url: null, description: { nb: '', en: '' }, status: 'partner' } })}>+ Ny partner</button>} />
      {list.length === 0 ? <Empty title="Ingen partnere" /> : (
        <Panel pad={false}>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Navn</th><th>Type</th><th>Lenke</th><th>Logo</th><th></th></tr></thead>
            <tbody>{list.map((p, i) => (
              <tr key={p.name + i}>
                <td><button type="button" className="linkish table__title" onClick={() => setEditing({ index: i, row: p })}>{p.name}</button></td>
                <td className="muted">{p.status}</td>
                <td className="muted">{p.url}</td>
                <td>{p.logo ? <span className="pill pill--teal">Logo</span> : <span className="pill pill--warn">Tekst</span>}</td>
                <td className="table__actions"><Menu items={[['Rediger', () => setEditing({ index: i, row: p })], i > 0 && ['Flytt opp', () => move(i, -1)], i < list.length - 1 && ['Flytt ned', () => move(i, 1)]]} /></td>
              </tr>
            ))}</tbody>
          </table></div>
        </Panel>
      )}
    </>
  );
}
