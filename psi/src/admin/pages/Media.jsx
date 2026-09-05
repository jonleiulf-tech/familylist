import { useRef, useState } from 'react';
import { db } from '../api.jsx';
import { uploadImage, imageError, ACCEPT, fmtBytes } from '../images.js';
import { PageTitle, Panel, useToast, useConfirm, Empty, Tabs, nb, Menu } from '../ui.jsx';

/* Bilder: per gruppe (maks 30) og felles for PSI. Originalen beholdes til
   trykk og SoMe; nettsiden bruker en nedskalert WebP. Skjult som standard. */
export default function Media({ slug, data, access, go, refresh, me, content }) {
  const scopes = [...(access.isAdmin ? [['psi', 'PSI felles']] : []), ...access.visibleSports(data.sports).filter((s) => access.canSee(s.slug)).map((s) => [s.slug, s.name.replace(/^PSI\s+/, '')])];
  const active = slug || scopes[0]?.[0] || 'psi';
  return (
    <>
      <PageTitle eyebrow="Innhold" title="Bilder" intro="Maks 30 per gruppe. Originalen lagres til trykk og SoMe, nettsiden får en lett kopi. Bildene er skjult til du huker av hvor de skal vises. Bare bilder PSI har rett til å bruke, og bare folk som har sagt ja." />
      <Tabs tabs={scopes.map(([k, l]) => [k, l, data.media.filter((m) => (k === 'psi' ? !m.sport_slug : m.sport_slug === k)).length])} active={active} onChange={(k) => go(`/bilder/${k}`)} />
      <MediaGrid slug={active === 'psi' ? null : active} data={data} access={access} refresh={refresh} me={me} content={content} />
    </>
  );
}

export function MediaGrid({ slug, data, access, refresh, me, content }) {
  const toast = useToast();
  const confirm = useConfirm();
  const inputRef = useRef();
  const [progress, setProgress] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [editing, setEditing] = useState(null);
  const items = data.media.filter((m) => (slug ? m.sport_slug === slug : !m.sport_slug));
  const canEdit = access.canManage(slug);
  const left = 30 - items.length;

  async function onFiles(files) {
    const list = [...files].slice(0, Math.max(0, left));
    if (files.length > left) toast(`Plass til ${left} til. Resten ble ikke lastet opp.`, 'error');
    let n = 0;
    for (const f of list) {
      const err = imageError(f);
      if (err) { toast(`${f.name}: ${err}`, 'error'); continue; }
      setProgress(`${f.name}: starter …`);
      const { error } = await uploadImage(f, { sportSlug: slug, createdBy: me, onProgress: (p) => setProgress(`${f.name}: ${p}`) });
      if (error) toast(`${f.name}: ${error.message}`, 'error'); else n++;
    }
    setProgress(null);
    if (n) { toast(`${n} bilde${n > 1 ? 'r' : ''} lastet opp. Huk av hvor de skal vises.`); refresh(); }
  }
  async function patch(m, p) {
    const { error } = await db.updateMedia(m.id, p);
    if (error) { toast(error.message, 'error'); return; }
    if (p.is_cover) {
      // Bare ett gruppebilde om gangen.
      for (const other of items) if (other.id !== m.id && other.is_cover) await db.updateMedia(other.id, { is_cover: false });
    }
    refresh(); content.reload();
  }
  async function remove(list) {
    if (!(await confirm({ title: list.length === 1 ? 'Slette bildet?' : `Slette ${list.length} bilder?`, body: 'Originalen slettes også. Kan ikke angres.', ok: 'Slett', danger: true }))) return;
    for (const m of list) { const { error } = await db.deleteMedia(m); if (error) toast(error.message, 'error'); }
    setSelected(new Set()); toast('Slettet.'); refresh(); content.reload();
  }
  function download(list) {
    // Originalene åpnes én og én; nettleseren lagrer dem. Zip kommer om det trengs.
    list.forEach((m, i) => setTimeout(() => { const a = document.createElement('a'); a.href = m.url; a.download = m.path.split('/').pop(); a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); }, i * 400));
  }
  const toggleSel = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const sel = items.filter((m) => selected.has(m.id));

  return (
    <div className="stack">
      {canEdit && (
        <div className={`drop${progress ? ' is-busy' : ''}`} onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('is-over'); }} onDragLeave={(e) => e.currentTarget.classList.remove('is-over')}
          onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('is-over'); onFiles(e.dataTransfer.files); }}>
          <input ref={inputRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
          {progress ? <p>{progress}</p> : (
            <>
              <p><strong>Dra bilder hit</strong> eller <button type="button" className="linkish" onClick={() => inputRef.current.click()}>velg fra maskinen</button>.</p>
              <p className="muted">JPG, PNG, WebP eller HEIC, opptil 25 MB. {left} plass{left === 1 ? '' : 'er'} igjen av 30.</p>
            </>
          )}
        </div>
      )}
      {items.length === 0 ? <Empty title="Ingen bilder her" body="Bilder fra treninger, turneringer og sosialt gjør sidene levende. Husk samtykke fra de som er med." /> : (
        <>
          {sel.length > 0 && (
            <div className="bulk">
              <span>{sel.length} valgt</span>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => download(sel)}>Last ned originaler</button>
              {canEdit && <button type="button" className="btn btn--ghost btn--sm" onClick={() => sel.forEach((m) => patch(m, { show_in_gallery: true }))}>Vis i galleri</button>}
              {canEdit && <button type="button" className="btn btn--ghost btn--sm" onClick={() => sel.forEach((m) => patch(m, { show_in_gallery: false, show_on_home: false }))}>Skjul</button>}
              {canEdit && <button type="button" className="btn btn--danger btn--sm" onClick={() => remove(sel)}>Slett</button>}
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSelected(new Set())}>Avbryt</button>
            </div>
          )}
          <div className="mediagrid">
            {items.map((m) => (
              <figure key={m.id} className={`media${selected.has(m.id) ? ' is-selected' : ''}`}>
                <label className="media__select"><input type="checkbox" checked={selected.has(m.id)} onChange={() => toggleSel(m.id)} aria-label="Velg bilde" /></label>
                <button type="button" className="media__img" onClick={() => setEditing(m)} aria-label="Rediger bilde"><img src={m.web_url} alt={nb(m.caption)} loading="lazy" /></button>
                <figcaption>
                  <div className="media__flags">
                    {m.is_cover && <span className="pill pill--orange">Gruppebilde</span>}
                    {m.show_on_home && <span className="pill pill--teal">Forside</span>}
                    {m.show_in_gallery && <span className="pill pill--teal">Galleri</span>}
                    {!m.show_in_gallery && !m.show_on_home && !m.is_cover && <span className="pill">Skjult</span>}
                  </div>
                  <div className="media__meta muted">{nb(m.caption) || m.path.split('/').pop()}{m.width ? ` · ${m.width}×${m.height}` : ''}{m.bytes ? ` · ${fmtBytes(m.bytes)}` : ''}</div>
                </figcaption>
                <Menu items={[
                  ['Rediger tekst og visning', () => setEditing(m)],
                  ['Last ned original', () => download([m])],
                  canEdit && !m.is_cover && slug && ['Bruk som gruppebilde', () => patch(m, { is_cover: true })],
                  canEdit && [m.show_in_gallery ? 'Fjern fra galleri' : 'Vis i galleri', () => patch(m, { show_in_gallery: !m.show_in_gallery })],
                  canEdit && [m.show_on_home ? 'Fjern fra forsiden' : 'Vis på forsiden', () => patch(m, { show_on_home: !m.show_on_home, show_in_gallery: m.show_on_home ? m.show_in_gallery : true })],
                  canEdit && ['Slett', () => remove([m]), true],
                ]} />
              </figure>
            ))}
          </div>
        </>
      )}
      {editing && <MediaDialog m={data.media.find((x) => x.id === editing.id) || editing} canEdit={canEdit} onClose={() => setEditing(null)} onSave={async (p) => { await patch(editing, p); setEditing(null); toast('Lagret.'); }} hasGroup={Boolean(slug)} />}
    </div>
  );
}

function MediaDialog({ m, canEdit, onClose, onSave, hasGroup }) {
  const [caption, setCaption] = useState(m.caption || { nb: '', en: '' });
  const [credit, setCredit] = useState(m.credit || '');
  const [flags, setFlags] = useState({ show_in_gallery: m.show_in_gallery, show_on_home: m.show_on_home, is_cover: m.is_cover });
  return (
    <dialog className="dialog dialog--wide" open onClose={onClose}>
      <div className="dialog__body">
        <img src={m.web_url} alt="" className="dialog__img" />
        <fieldset disabled={!canEdit} className="fieldset form">
          <div className="field"><label>Bildetekst (norsk)</label><input value={caption.nb || ''} onChange={(e) => setCaption({ ...caption, nb: e.target.value })} placeholder="Fra kick-off i Porsgrunn Arena" /></div>
          <div className="field"><label>Caption (English)</label><input value={caption.en || ''} onChange={(e) => setCaption({ ...caption, en: e.target.value })} /></div>
          <div className="field"><label>Fotograf / kilde</label><input value={credit} onChange={(e) => setCredit(e.target.value)} placeholder="Foto: Navn Navnesen" /></div>
          <label className="check"><input type="checkbox" checked={flags.show_in_gallery} onChange={(e) => setFlags({ ...flags, show_in_gallery: e.target.checked })} />Vis i galleriet {hasGroup ? 'på gruppesiden' : 'på /om'}</label>
          <label className="check"><input type="checkbox" checked={flags.show_on_home} onChange={(e) => setFlags({ ...flags, show_on_home: e.target.checked, show_in_gallery: e.target.checked || flags.show_in_gallery })} />Vis på forsiden</label>
          {hasGroup && <label className="check"><input type="checkbox" checked={flags.is_cover} onChange={(e) => setFlags({ ...flags, is_cover: e.target.checked })} />Bruk som gruppebilde (kort og toppen av gruppesiden)</label>}
        </fieldset>
        <p className="hint muted">Original: {m.path.split('/').pop()}{m.width ? `, ${m.width}×${m.height}` : ''}. <a href={m.url} target="_blank" rel="noopener noreferrer">Åpne originalen</a></p>
        <div className="dialog__actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>Lukk</button>
          {canEdit && <button type="button" className="btn btn--primary btn--sm" onClick={() => onSave({ caption, credit, ...flags })}>Lagre</button>}
        </div>
      </div>
    </dialog>
  );
}

/* Velg ett bilde blant de som er lastet opp (til nyheter). */
export function ImagePicker({ media, value, onChange }) {
  if (media.length === 0) return <p className="muted">Ingen bilder lastet opp ennå.</p>;
  return (
    <div className="picker">
      <button type="button" className={`picker__item picker__none${!value ? ' is-active' : ''}`} onClick={() => onChange(null)}>Uten bilde</button>
      {media.map((m) => (
        <button type="button" key={m.id} className={`picker__item${value === m.id ? ' is-active' : ''}`} onClick={() => onChange(m.id)} title={nb(m.caption)}>
          <img src={m.web_url} alt={nb(m.caption)} loading="lazy" />
        </button>
      ))}
    </div>
  );
}
