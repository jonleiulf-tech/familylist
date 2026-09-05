import { useState } from 'react';
import { BLANK_MEMBER, MEMBER_ROLES } from '../schema.js';
import { ROLES } from '../access.js';
import { db } from '../api.jsx';
import { PageTitle, Panel, useToast, useConfirm, Empty, Menu, relTime } from '../ui.jsx';

/* Tilgang: hvem som kan logge inn, med hvilken rolle, og hvem som vises
   som styret på nettsiden. */
export default function Access({ data, access, refresh, me }) {
  const members = data.members;
  const admins = members.filter((m) => m.role === 'psi_admin');
  const bySport = access.visibleSports(data.sports).map((s) => [s, members.filter((m) => m.sport_slug === s.slug)]);
  const orphans = members.filter((m) => m.sport_slug && !data.sports.some((s) => s.slug === m.sport_slug));
  return (
    <>
      <PageTitle eyebrow="Konto" title="Tilgang" intro="Alle som skal inn her må ha en rad. Personen logger inn med e-posten sin (lenke eller passord) og får rollen som står her." />
      <div className="roles">
        {Object.entries(ROLES).map(([k, r]) => <div key={k} className="roles__item"><strong>{r.label}</strong><span className="muted">{r.desc}</span></div>)}
      </div>
      <div className="stack">
        {access.isAdmin && <Panel title="PSI-admin (styret)" intro="Vises som styret på /om når «Vis på nettsiden» er på."><MemberTable members={admins} data={data} access={access} refresh={refresh} scope={null} me={me} adminList /></Panel>}
        {bySport.map(([s, list]) => <Panel key={s.slug} title={`${s.icon} ${s.name}`}><MemberTable members={list} data={data} access={access} refresh={refresh} scope={s.slug} me={me} /></Panel>)}
        {orphans.length > 0 && access.isAdmin && <Panel title="Uten gruppe" intro="Gruppa er slettet eller har fått ny adresse."><MemberTable members={orphans} data={data} access={access} refresh={refresh} scope={undefined} me={me} /></Panel>}
      </div>
    </>
  );
}

export function MemberTable({ members, data, access, refresh, scope, me, adminList = false }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(null);
  const canAdd = adminList ? access.isAdmin : access.canManage(scope);
  const sportName = (slug) => data.sports.find((s) => s.slug === slug)?.name || slug;

  async function save(row) {
    const clean = { ...row, email: row.email.trim().toLowerCase(), name: row.name?.trim() || null, title: row.title?.trim() || null, sport_slug: row.role === 'psi_admin' ? null : row.sport_slug || scope || null };
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean.email)) { toast('Skriv en gyldig e-post.', 'error'); return; }
    if (clean.role !== 'psi_admin' && !clean.sport_slug) { toast('Velg hvilken gruppe rollen gjelder.', 'error'); return; }
    const { error } = await db.saveMember(clean);
    if (error) { toast(error.code === '23505' ? 'Denne personen har allerede den rollen.' : error.message, 'error'); return; }
    toast(row.id ? 'Lagret.' : `${clean.email} har fått tilgang. Be dem logge inn på psiusn.no/admin.`);
    setEditing(null); refresh();
  }
  async function remove(m) {
    if (!(await confirm({ title: `Fjerne ${m.name || m.email}?`, body: `Mister rollen «${ROLES[m.role]?.label}»${m.sport_slug ? ` for ${sportName(m.sport_slug)}` : ''}. Kontoen slettes ikke, bare tilgangen.`, ok: 'Fjern', danger: true }))) return;
    const { error } = await db.deleteMember(m.id);
    if (error) toast(error.message, 'error'); else { toast('Fjernet.'); refresh(); }
  }
  const startNew = () => setEditing({ ...BLANK_MEMBER, role: adminList ? 'psi_admin' : 'group_leader', sport_slug: scope || null, title: adminList ? '' : 'Gruppeleder' });

  return (
    <div className="stack">
      {members.length === 0 ? <Empty title="Ingen her ennå" action={canAdd && <button type="button" className="btn btn--primary btn--sm" onClick={startNew}>+ Gi tilgang</button>} /> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Person</th><th>Rolle</th><th>På nettsiden</th><th>Lagt til</th><th></th></tr></thead>
          <tbody>{members.map((m) => {
            const isMe = m.email === me;
            const can = access.isAdmin || (m.role !== 'psi_admin' && access.canManage(m.sport_slug)) || isMe;
            return (
              <tr key={m.id}>
                <td><strong>{m.name || <em className="muted">Navn mangler</em>}</strong>{isMe && <span className="pill" style={{ marginLeft: 6 }}>deg</span>}<div className="muted">{m.email}</div></td>
                <td>{ROLES[m.role]?.label || m.role}{m.title && <div className="muted">{m.title}</div>}</td>
                <td>{m.show_public && m.name ? <span className="pill pill--teal">Vises</span> : <span className="pill">Skjult</span>}</td>
                <td className="muted">{relTime(m.created_at)}</td>
                <td className="table__actions">{can && <Menu items={[
                  ['Rediger', () => setEditing(m)],
                  (access.isAdmin || (m.role !== 'psi_admin' && access.canManage(m.sport_slug))) && !(m.role === 'psi_admin' && isMe) && ['Fjern tilgang', () => remove(m), true],
                ]} />}</td>
              </tr>
            );
          })}</tbody>
        </table></div>
      )}
      {members.length > 0 && canAdd && !editing && <div><button type="button" className="btn btn--ghost btn--sm" onClick={startNew}>+ Gi tilgang</button></div>}
      {editing && <MemberForm row={editing} setRow={setEditing} data={data} access={access} onSave={() => save(editing)} onCancel={() => setEditing(null)} lockScope={Boolean(scope) && !access.isAdmin} />}
    </div>
  );
}

function MemberForm({ row, setRow, data, access, onSave, onCancel, lockScope }) {
  const set = (k) => (e) => setRow({ ...row, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const roles = MEMBER_ROLES.filter(([k]) => access.isAdmin || k !== 'psi_admin');
  const isSelf = row.email === access.email;
  return (
    <form className="editor form" onSubmit={(e) => { e.preventDefault(); onSave(); }}>
      <h3>{row.id ? 'Rediger' : 'Gi tilgang'}</h3>
      <div className="form form--2">
        <div className="field"><label htmlFor="m-email">E-post</label><input id="m-email" type="email" required value={row.email} onChange={set('email')} disabled={Boolean(row.id)} placeholder="navn@student.usn.no" /></div>
        <div className="field"><label htmlFor="m-name">Navn</label><input id="m-name" value={row.name || ''} onChange={set('name')} placeholder="Fornavn Etternavn" /></div>
        <div className="field">
          <label htmlFor="m-role">Rolle</label>
          <select id="m-role" value={row.role} onChange={set('role')} disabled={!access.isAdmin && isSelf}>{roles.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </div>
        {row.role !== 'psi_admin' && (
          <div className="field">
            <label htmlFor="m-sport">Gruppe</label>
            <select id="m-sport" value={row.sport_slug || ''} onChange={set('sport_slug')} disabled={lockScope} required>
              <option value="">Velg gruppe …</option>
              {data.sports.filter((s) => access.canManage(s.slug)).map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
            </select>
          </div>
        )}
        <div className="field"><label htmlFor="m-title">Tittel på nettsiden</label><input id="m-title" value={row.title || ''} onChange={set('title')} placeholder={row.role === 'psi_admin' ? 'Leder, PSI / Økonomi / Arrangement' : 'Gruppeleder'} /></div>
        <label className="check" style={{ alignSelf: 'end' }}><input type="checkbox" checked={Boolean(row.show_public)} onChange={set('show_public')} />Vis navn og tittel på nettsiden</label>
      </div>
      <p className="hint muted">E-posten vises aldri offentlig for styremedlemmer; gruppene bruker gruppe-e-posten sin.</p>
      <div className="editor__actions">
        <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
          <button className="btn btn--primary btn--sm">{row.id ? 'Lagre' : 'Gi tilgang'}</button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>Avbryt</button>
        </div>
      </div>
    </form>
  );
}
