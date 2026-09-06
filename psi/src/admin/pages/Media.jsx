import { useEffect, useRef, useState } from 'react';
import { db, manglerMigrasjon } from '../api.jsx';
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
  // Bilder som fulgte med et Spond-innlegg teller ikke mot kvoten. Den er
  // ment for galleriet styret fyller selv.
  const left = 30 - items.filter((m) => m.source !== 'spond').length;

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
    let { error } = await db.updateMedia(m.id, p);
    // Fokuspunktet kom i migrasjon 0007. Er den ikke kjørt, skal resten av
    // valgene likevel lagres – ellers feiler «Bruk som gruppebilde» bare
    // fordi et utsnitt ble sendt med på lasset.
    if (error && manglerMigrasjon(error)) {
      // Fokuspunkt (0007) og hovedgalleri (0009) er nyere enn resten. Er
      // migrasjonene ikke kjørt, skal de eldre valgene likevel lagres –
      // ellers feiler «Bruk som gruppebilde» bare fordi noe nytt ble sendt
      // med på lasset.
      const { focus_x, focus_y, show_in_main, description, ...uten } = p;
      if (Object.keys(uten).length < Object.keys(p).length) {
        ({ error } = await db.updateMedia(m.id, uten));
        if (!error) toast('Lagret, men beskrivelse, galleri- og utsnittsvalg krever nyeste migrasjoner – kjør npm run db.', 'error');
      }
    }
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
                    {m.show_in_main && <span className="pill pill--teal">Hovedgalleri</span>}
                    {!m.show_in_gallery && !m.show_in_main && !m.show_on_home && !m.is_cover && <span className="pill">Skjult</span>}
                    {m.source === 'spond' && <span className="pill pill--spond">Spond</span>}
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

/* Utsnitt: klikk i bildet for å si hva som skal være med. Vi beskjærer
   ikke fila – vi flytter utsnittet (object-position), så valget kan gjøres
   om igjen, og samme bilde brukes både som kort (16:9) og toppbilde (21:9). */
function Utsnitt({ m, focus, setFocus, canEdit }) {
  const ref = useRef();
  const pos = `${focus.x}% ${focus.y}%`;

  function velg(e) {
    if (!canEdit) return;
    const r = ref.current.getBoundingClientRect();
    const p = e.touches?.[0] || e;
    const x = Math.round(Math.min(100, Math.max(0, ((p.clientX - r.left) / r.width) * 100)));
    const y = Math.round(Math.min(100, Math.max(0, ((p.clientY - r.top) / r.height) * 100)));
    setFocus({ x, y });
  }

  return (
    <div className="crop">
      <div className="crop__pick" ref={ref} onClick={velg} onTouchMove={velg} role={canEdit ? 'button' : undefined}
        aria-label={canEdit ? 'Klikk i bildet for å velge hva som skal vises' : undefined} tabIndex={canEdit ? 0 : -1}
        onKeyDown={(e) => {
          if (!canEdit) return;
          const steg = e.shiftKey ? 10 : 2;
          const flytt = { ArrowLeft: [-steg, 0], ArrowRight: [steg, 0], ArrowUp: [0, -steg], ArrowDown: [0, steg] }[e.key];
          if (!flytt) return;
          e.preventDefault();
          setFocus({ x: Math.min(100, Math.max(0, focus.x + flytt[0])), y: Math.min(100, Math.max(0, focus.y + flytt[1])) });
        }}>
        <img src={m.web_url} alt="" />
        <span className="crop__dot" style={{ left: `${focus.x}%`, top: `${focus.y}%` }} aria-hidden="true" />
      </div>
      <div className="crop__previews">
        <figure><div className="crop__box crop__box--card"><img src={m.web_url} alt="" style={{ objectPosition: pos }} /></div><figcaption>Kort</figcaption></figure>
        <figure><div className="crop__box crop__box--hero"><img src={m.web_url} alt="" style={{ objectPosition: pos }} /></div><figcaption>Toppbilde</figcaption></figure>
        <figure><div className="crop__box crop__box--gallery"><img src={m.web_url} alt="" style={{ objectPosition: pos }} /></div><figcaption>Galleri</figcaption></figure>
      </div>
      {canEdit && (
        <p className="hint muted">
          Klikk der det viktige er – lagbildet, klatreren, ballen. Piltaster flytter, Shift for større steg.
          {' '}<b>{focus.x} % fra venstre, {focus.y} % ned.</b>
          {(focus.x !== 50 || focus.y !== 50) && <> <button type="button" className="linkish" onClick={() => setFocus({ x: 50, y: 50 })}>Midtstill igjen</button></>}
        </p>
      )}
    </div>
  );
}

function MediaDialog({ m, canEdit, onClose, onSave, hasGroup }) {
  const [caption, setCaption] = useState(m.caption || { nb: '', en: '' });
  const [description, setDescription] = useState(m.description || { nb: '', en: '' });
  const [credit, setCredit] = useState(m.credit || '');
  const [flags, setFlags] = useState({ show_in_gallery: m.show_in_gallery, show_in_main: Boolean(m.show_in_main), show_on_home: m.show_on_home, is_cover: m.is_cover });
  const [focus, setFocus] = useState({ x: m.focus_x ?? 50, y: m.focus_y ?? 50 });
  // showModal, ikke open-attributtet: da får dialogen mørk bakgrunn, Escape
  // lukker, og den havner over siden i stedet for nederst i flyten.
  const dialogRef = useRef(null);
  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
    return () => { if (d?.open) d.close(); };
  }, []);
  return (
    <dialog className="dialog dialog--wide" ref={dialogRef} onClose={onClose} onCancel={onClose}>
      <div className="dialog__body">
        <Utsnitt m={m} focus={focus} setFocus={setFocus} canEdit={canEdit} />
        <fieldset disabled={!canEdit} className="fieldset form">
          <div className="field"><label>Tittel (norsk)</label><input value={caption.nb || ''} onChange={(e) => setCaption({ ...caption, nb: e.target.value })} placeholder="Kick-off i Porsgrunn Arena" /><span className="hint">Står under bildet i galleriet. Hold den kort.</span></div>
          <div className="field"><label>Title (English)</label><input value={caption.en || ''} onChange={(e) => setCaption({ ...caption, en: e.target.value })} /></div>
          <div className="field"><label>Beskrivelse (norsk)</label><textarea rows="3" value={description.nb || ''} onChange={(e) => setDescription({ ...description, nb: e.target.value })} placeholder="Første trening etter sommeren. 34 møtte opp, og halve gjengen hadde aldri spilt før." /><span className="hint">Vises når noen klikker seg inn på bildet.</span></div>
          <div className="field"><label>Description (English)</label><textarea rows="3" value={description.en || ''} onChange={(e) => setDescription({ ...description, en: e.target.value })} /></div>
          <div className="field"><label>Fotograf / kilde</label><input value={credit} onChange={(e) => setCredit(e.target.value)} placeholder="Navn Navnesen" /></div>
          {hasGroup && <label className="check"><input type="checkbox" checked={flags.show_in_gallery} onChange={(e) => setFlags({ ...flags, show_in_gallery: e.target.checked })} />Vis i galleriet på gruppesiden</label>}
          <label className="check"><input type="checkbox" checked={flags.show_in_main} onChange={(e) => setFlags({ ...flags, show_in_main: e.target.checked })} />Vis i hovedgalleriet (felles for hele PSI, på Om PSI)</label>
          <label className="check"><input type="checkbox" checked={flags.show_on_home} onChange={(e) => setFlags({ ...flags, show_on_home: e.target.checked, show_in_gallery: hasGroup ? (e.target.checked || flags.show_in_gallery) : flags.show_in_gallery, show_in_main: e.target.checked || flags.show_in_main })} />Vis på forsiden</label>
          {hasGroup && <label className="check"><input type="checkbox" checked={flags.is_cover} onChange={(e) => setFlags({ ...flags, is_cover: e.target.checked })} />Bruk som gruppebilde (kort og toppen av gruppesiden)</label>}
        </fieldset>
        <p className="hint muted">Original: {m.path.split('/').pop()}{m.width ? `, ${m.width}×${m.height}` : ''}. <a href={m.url} target="_blank" rel="noopener noreferrer">Åpne originalen</a></p>
        <div className="dialog__actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>Lukk</button>
          {canEdit && <button type="button" className="btn btn--primary btn--sm" onClick={() => onSave({ caption, description, credit, ...flags, focus_x: focus.x, focus_y: focus.y })}>Lagre</button>}
        </div>
      </div>
    </dialog>
  );
}

/* Velg ett bilde blant de som er lastet opp – eller last opp et nytt her og
   nå, uten å forlate saken du holder på med. Opplastingen skalerer ned til
   nettstørrelse (WebP, maks 1600 px) på samme måte som under «Bilder», så
   et mobilbilde på 8 MB blir noen hundre kilobyte for leserne. */
export function ImagePicker({ media, value, onChange, sportSlug = null, me, refresh }) {
  const toast = useToast();
  const inputRef = useRef();
  const [progress, setProgress] = useState(null);
  const kanLasteOpp = Boolean(me && refresh);

  async function last(file) {
    const feil = imageError(file);
    if (feil) { toast(feil, 'error'); return; }
    setProgress('Klargjør …');
    const { data, error } = await uploadImage(file, { sportSlug, createdBy: me, onProgress: setProgress });
    setProgress(null);
    if (error) { toast(error.message, 'error'); return; }
    await refresh();
    onChange(data.id);
    toast('Bildet er lastet opp og valgt.');
  }

  return (
    <>
      <div className="picker">
        <button type="button" className={`picker__item picker__none${!value ? ' is-active' : ''}`} onClick={() => onChange(null)}>Uten bilde</button>
        {kanLasteOpp && (
          <button type="button" className="picker__item picker__add" onClick={() => inputRef.current.click()} disabled={Boolean(progress)}>
            {progress ? <small>{progress}</small> : <><span aria-hidden="true">＋</span><small>Last opp</small></>}
          </button>
        )}
        {media.map((m) => (
          <button type="button" key={m.id} className={`picker__item${value === m.id ? ' is-active' : ''}`} onClick={() => onChange(m.id)} title={nb(m.caption)}>
            <img src={m.web_url} alt={nb(m.caption)} loading="lazy" />
          </button>
        ))}
      </div>
      {kanLasteOpp && (
        <input ref={inputRef} type="file" accept={ACCEPT} hidden
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) last(f); }} />
      )}
      {media.length === 0 && !kanLasteOpp && <p className="muted">Ingen bilder lastet opp ennå.</p>}
    </>
  );
}
