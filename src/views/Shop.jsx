import { useMemo, useRef, useState } from 'react';
import { Mic, Check, Plus, Search, Sparkles, X } from 'lucide-react';
import { Stepper } from '../components/Stepper.jsx';
import { AddItemDialog } from '../components/AddItemDialog.jsx';
import { EditItemDialog } from '../components/EditItemDialog.jsx';
import { CompleteTripDialog } from '../components/CompleteTripDialog.jsx';
import { searchCatalog, guessUnit, isPackUnit, parseSpeech, resolveCatalogItem } from '../lib/catalog.js';
import { estimatedTotal, kr } from '../lib/format.js';
import { sortShoppingItems, SORT_MODES, loadSortMode, saveSortMode } from '../lib/sortItems.js';

export function Shop({
  items, catalog, normRules, stores, defaultStore,
  addItem, addMany, updateItem, toggleChecked, removeItem, restoreItem, clearAll,
  positionOf, hasLearnedFor, learnFromTrip, saveTrip, toast, reportItem,
}) {
  const [query, setQuery] = useState('');
  const [addTarget, setAddTarget] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [completing, setCompleting] = useState(false);
  const [micStatus, setMicStatus] = useState(null);
  const [micActive, setMicActive] = useState(false);
  const recRef = useRef(null);
  // Sorteringsvalget huskes per enhet — den som vil ha pris-visning i
  // butikken skal slippe å velge det på nytt hver gang.
  const [sortMode, setSortMode] = useState(loadSortMode);
  // Alle / Ikke kjøpt / Kjøpt — hvilken del av listen som vises.
  const [viewFilter, setViewFilter] = useState('alle');
  // Butikken man står i. Hver kjede har sin egen hylleplassering, så både
  // sorteringen og læringen må vite hvilken rute som gjelder akkurat nå.
  const [activeStore, setActiveStore] = useState(() => {
    try { return localStorage.getItem('fl-active-store-v1') || defaultStore; }
    catch { return defaultStore; }
  });
  const pickStore = (name) => {
    setActiveStore(name);
    try { localStorage.setItem('fl-active-store-v1', name); } catch { /* ignorer */ }
  };
  // Rekkefølgen kategoriene faktisk ble plukket i denne turen — grunnlaget for læringen.
  const pickSequence = useRef([]);

  const suggestions = useMemo(
    () => (query.trim() ? searchCatalog(query, catalog, 8) : []),
    [query, catalog],
  );

  const open = items.filter((i) => !i.checked);
  const picked = items.filter((i) => i.checked);
  const total = estimatedTotal(items);

  const groups = useMemo(
    () => sortShoppingItems(open, sortMode, { positionOf, defaultStore, currentStore: activeStore }),
    [open, sortMode, positionOf, defaultStore, activeStore],
  );

  const changeSort = (mode) => { setSortMode(mode); saveSortMode(mode); };

  // --- Handlinger -----------------------------------------------------------
  const handleToggle = async (item) => {
    if (!item.checked) {
      pickSequence.current.push({ store: activeStore, category: item.category || 'Annet' });
    }
    await toggleChecked(item);
  };

  const handleStep = async (item, dir) => {
    const pack = Number(item.pack_size) || 0;
    const stepBy = pack > 0 ? pack : 1;
    const next = (Number(item.qty) || 0) + dir * stepBy;

    if (next < stepBy) {
      // Minus under én pakke fjerner varen — med angremulighet.
      const snapshot = await removeItem(item.id);
      toast(`${item.name} fjernet`, () => restoreItem(snapshot));
      return;
    }
    await updateItem(item.id, { qty: next });
  };

  const addFromCatalog = async (entry, qty, extra = {}) => {
    const existing = items.find((i) => i.name.toLowerCase() === entry.name.toLowerCase());
    if (existing) {
      const pack = Number(existing.pack_size) || 1;
      await updateItem(existing.id, { qty: Number(existing.qty) + (qty ?? pack) });
      toast(`${entry.name} økt`);
      return;
    }
    const unit = extra.unit ?? guessUnit(entry.name, entry.major_category);
    const packSize = isPackUnit(unit) ? (qty ?? (unit === 'liter' ? 1 : 400)) : null;
    await addItem({
      name: entry.name,
      qty: qty ?? (packSize ?? 1),
      unit,
      pack_size: packSize,
      category: entry.major_category || 'Annet',
      store: entry.primary_store || defaultStore,
      price: entry.avg_price ?? null,
      price_source: entry.avg_price ? 'receipt' : null,
      ...extra,
    });
    toast(`${entry.name} lagt til`);
  };

  const handleSubmitSearch = async (e) => {
    e.preventDefault();
    const raw = query.trim();
    if (!raw) return;
    const { name, item } = resolveCatalogItem(raw, catalog, normRules);
    await addFromCatalog(item ?? { name, major_category: 'Annet' }, null);
    setQuery('');
  };

  // --- Talelegging (Web Speech API, no-NO) ----------------------------------
  const startMic = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setMicStatus('Talegjenkjenning støttes ikke i denne nettleseren.'); return; }
    const rec = new SR();
    recRef.current = rec;
    rec.lang = 'no-NO';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    setMicActive(true);
    setMicStatus(null);

    rec.onresult = async (event) => {
      const text = event.results[0][0].transcript;
      setMicActive(false);
      const parsed = parseSpeech(text);
      if (!parsed.length) { toast('Fikk ikke tak i noen varer'); return; }
      const rows = parsed.map(({ qty, name }) => {
        const { name: resolved, item } = resolveCatalogItem(name, catalog, normRules);
        const unit = guessUnit(resolved, item?.major_category);
        return {
          name: resolved,
          qty,
          unit,
          category: item?.major_category || 'Annet',
          store: item?.primary_store || defaultStore,
          price: item?.avg_price ?? null,
          price_source: item?.avg_price ? 'receipt' : null,
        };
      });
      await addMany(rows);
      toast(`La til ${rows.length} ${rows.length === 1 ? 'vare' : 'varer'}: ${rows.map((r) => r.name).join(', ')}`);
    };
    rec.onerror = () => { setMicActive(false); setMicStatus('Fikk ikke tilgang til mikrofonen.'); };
    rec.onend = () => setMicActive(false);
    rec.start();
  };

  const stopMic = () => {
    recRef.current?.stop();
    setMicActive(false);
  };

  // --- Fullfør handletur ----------------------------------------------------
  const completeTrip = async ({ save, name }) => {
    const boughtItems = items.filter((i) => i.checked);

    // Lær plukk-rekkefølgen fra denne turen
    const byStore = {};
    pickSequence.current.forEach(({ store, category }) => {
      byStore[store] = byStore[store] || [];
      byStore[store].push(category);
    });
    if (Object.keys(byStore).length) await learnFromTrip(byStore);

    if (save && boughtItems.length) await saveTrip(name, boughtItems);

    // Fullføring nullstiller HELE listen, ikke bare de avkryssede.
    const snapshot = await clearAll();
    pickSequence.current = [];
    setCompleting(false);
    toast(
      `Handletur fullført — ${boughtItems.length} ${boughtItems.length === 1 ? 'vare' : 'varer'}`,
      async () => { for (const row of snapshot) await restoreItem(row); },
    );
  };

  return (
    <div>
      {/* Søk og talelegging */}
      <div style={{ padding: 'var(--space-4) var(--space-4) var(--space-2)' }}>
        <form onSubmit={handleSubmitSearch} className="row" style={{ gap: 8 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search
              size={15}
              style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }}
              aria-hidden="true"
            />
            <input
              className="input"
              style={{ paddingLeft: 34 }}
              placeholder="Søk eller legg til vare …"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Søk etter vare"
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={!query.trim()}>
            <Plus size={16} /> Legg til
          </button>
          <button
            type="button"
            className="btn btn-icon"
            onClick={startMic}
            aria-label="Legg til med tale"
            title="Legg til med tale"
          >
            <Mic size={18} />
          </button>
        </form>
        {micActive && (
          <div className="row" style={{
            marginTop: 8, border: '2px solid var(--color-accent)', borderRadius: 'var(--radius)',
            padding: '8px 12px', gap: 10, background: 'var(--color-surface)',
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: 'var(--color-accent)', animation: 'flpulse 1.2s infinite',
            }} aria-hidden="true" />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Lytter … si f.eks. «2 liter melk og brød»</span>
            <span className="spacer" />
            <button type="button" className="btn btn-sm" onClick={stopMic}>Stopp</button>
          </div>
        )}
        {micStatus && <div className="text-muted" style={{ fontSize: 11, marginTop: 6 }}>{micStatus}</div>}

        {(suggestions.length > 0 || query.trim()) && (
          <div className="autocomplete">
            {suggestions.map((s) => (
              <button
                key={s.id ?? s.name}
                type="button"
                className="autocomplete-item"
                onClick={() => { setAddTarget(s); setQuery(''); }}
              >
                <div className="item-name">{s.name}</div>
                <div className="item-sub">
                  {s.avg_price
                    ? <>ca. {kr(s.avg_price)} snitt{s.primary_store ? ` · ${s.primary_store}` : ''}</>
                    : (s.major_category || '')}
                  {s.frequency_sig ? ` · ${s.frequency_sig}` : ''}
                </div>
              </button>
            ))}
            {query.trim() && (
              <button
                type="button"
                className="autocomplete-item"
                style={{ color: 'var(--color-accent)', fontWeight: 600 }}
                onClick={() => { setAddTarget({ name: query.trim() }); setQuery(''); }}
              >
                Søk i Kassalapp etter «{query.trim()}» — ekte priser
              </button>
            )}
          </div>
        )}
      </div>

      {/* Estimert total + fremdrift */}
      <div className="row-between" style={{ padding: '4px var(--space-4) 0', alignItems: 'flex-end' }}>
        <div>
          <div className="card-kicker" style={{ marginBottom: 2 }}>Estimert total</div>
          <div style={{
            fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28,
            letterSpacing: '-0.02em', lineHeight: 1,
          }}>
            {total.label}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            {picked.length} av {items.length} kjøpt
          </div>
          <div className="text-muted" style={{ fontSize: 11 }}>
            {items.length ? Math.round((picked.length / items.length) * 100) : 0} % fullført
          </div>
        </div>
      </div>
      <div style={{ margin: '10px var(--space-4) 12px', height: 4, background: 'var(--color-bg-sunken)' }}>
        <div style={{
          width: `${items.length ? Math.round((picked.length / items.length) * 100) : 0}%`,
          height: '100%',
          background: 'var(--color-accent)',
        }} />
      </div>

      {items.length > 0 && (
        <div style={{ padding: '0 var(--space-4) var(--space-3)' }}>
          <div className="seg">
            {[['alle', 'Alle'], ['open', 'Ikke kjøpt'], ['picked', 'Kjøpt']].map(([v, l]) => (
              <button
                key={v}
                type="button"
                className="seg-opt"
                aria-pressed={viewFilter === v}
                onClick={() => setViewFilter(v)}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      )}
      {viewFilter !== 'picked' && open.length > 1 && (
        <div className="row" style={{ padding: '0 var(--space-4) var(--space-3)', gap: 8, alignItems: 'center' }}>
          <label className="text-muted" htmlFor="shop-sort" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600 }}>
            Sortering
          </label>
          {/* minWidth: 0 lar select-en krympe — uten den tvinger den lengste
              option-teksten hele siden bredere enn mobilskjermen. */}
          <select
            id="shop-sort"
            className="input"
            value={sortMode}
            onChange={(e) => changeSort(e.target.value)}
            style={{ width: 'auto', flex: 1, minWidth: 0, maxWidth: '100%', padding: '6px 10px', fontSize: 13 }}
          >
            {SORT_MODES.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
      )}
      {viewFilter !== 'picked' && open.length > 1 && (
        <p className="text-muted" style={{ fontSize: 11, margin: 0, padding: '0 var(--space-4) var(--space-3)' }}>
          {SORT_MODES.find((m) => m.value === sortMode)?.hint}
        </p>
      )}

      {viewFilter !== 'picked' && sortMode === 'plukk' && open.length > 1 && (
        <div style={{ padding: '0 var(--space-4) var(--space-3)' }}>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <span className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600 }}>
              Butikk
            </span>
            {stores.map((st) => (
              <button
                key={st.code}
                type="button"
                className={`tag tag-button ${activeStore === st.name ? 'tag-accent' : 'tag-outline'}`}
                onClick={() => pickStore(st.name)}
                aria-pressed={activeStore === st.name}
              >
                {st.name}
              </button>
            ))}
          </div>

        </div>
      )}
      <hr className="divider" />

      {/* Åpne varer, gruppert i lært plukk-rekkefølge */}
      {viewFilter !== 'picked' && groups.map(({ key, label, rows, kind, sum }) => (
        <section key={key}>
          {label && kind === 'store' && (
            <>
              <hr className="divider" />
              <div className="section-head" style={{ paddingBottom: 2 }}>
                <span className="section-title">{label}</span>
                <span className="text-muted" style={{ fontSize: 11 }}>
                  {rows.length} {rows.length === 1 ? 'vare' : 'varer'}{sum > 0 ? ` · ca. ${kr(Math.round(sum))}` : ''}
                </span>
              </div>
              <div className="row" style={{ gap: 5, padding: '0 var(--space-4) 6px' }}>
                <Sparkles size={11} color="var(--color-accent)" aria-hidden="true" />
                <span className="text-muted" style={{ fontSize: 11 }}>
                  {hasLearnedFor(label)
                    ? 'Sortert i din plukk-rekkefølge'
                    : 'Standard rekkefølge — fullfør en handletur her, så læres ruta'}
                </span>
              </div>
            </>
          )}
          {label && kind !== 'store' && (
            <div className="section-head" style={{ paddingBottom: 4 }}>
              <span className="section-title">{label}</span>
              <span className="text-muted" style={{ fontSize: 11 }}>{rows.length}</span>
            </div>
          )}
          {rows.map((item) => (
            <div key={item.id} className="item-row">
              <input
                type="checkbox"
                className="checkbox"
                checked={false}
                onChange={() => handleToggle(item)}
                aria-label={`Plukk ${item.name}`}
              />
              <button type="button" className="item-mid" onClick={() => setEditItem(item)}>
                <div className="item-name">{item.name}</div>
                <div className="item-sub">
                  {item.store || defaultStore}
                  {item.variant ? ` · ${item.variant}` : ''}
                  {item.is_offer ? ' · tilbud' : ''}
                </div>
              </button>
              <Stepper item={item} onStep={(d) => handleStep(item, d)} onOpen={() => setEditItem(item)} />
              {/* Rask sletting rett fra listen — med angre i toasten. */}
              <button
                type="button"
                className="btn btn-ghost btn-icon btn-sm"
                aria-label={`Fjern ${item.name} fra listen`}
                style={{ color: 'var(--color-text-muted)', padding: 6, marginLeft: -4 }}
                onClick={async () => {
                  const snapshot = await removeItem(item.id);
                  toast(`${item.name} fjernet`, () => restoreItem(snapshot));
                }}
              >
                <X size={15} />
              </button>
            </div>
          ))}
        </section>
      ))}

      {viewFilter !== 'picked' && !open.length && (
        <p className="text-muted" style={{ padding: 'var(--space-5) var(--space-4)', fontSize: 13 }}>
          Handlelisten er tom. Søk øverst, eller hent forslag fra Middag-fanen.
        </p>
      )}

      {/* Plukket */}
      {viewFilter !== 'open' && picked.length > 0 && (
        <section style={{ marginTop: 'var(--space-4)' }}>
          <hr className="divider" />
          <div className="section-head">
            <span className="section-title">Plukket</span>
            <span className="text-muted" style={{ fontSize: 11 }}>{picked.length}</span>
          </div>
          {picked.map((item) => (
            <div key={item.id} className="item-row is-checked">
              <input
                type="checkbox"
                className="checkbox"
                checked
                onChange={() => handleToggle(item)}
                aria-label={`Angre plukk av ${item.name}`}
              />
              <div className="item-mid">
                <div className="item-name">{item.name}</div>
                <div className="item-sub">{item.qty} {item.unit}</div>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleToggle(item)}>
                Angre
              </button>
            </div>
          ))}
        </section>
      )}

      {/* Fullfør handletur */}
      {items.length > 0 && (
        <div style={{ padding: 'var(--space-4)' }}>
          <button type="button" className="btn btn-secondary btn-block" onClick={() => setCompleting(true)}>
            <Check size={16} /> Fullfør handletur
          </button>
        </div>
      )}

      {addTarget && (
        <AddItemDialog
          entry={addTarget}
          stores={stores}
          defaultStore={defaultStore}
          onClose={() => setAddTarget(null)}
          onAdd={async (qty, extra) => { await addFromCatalog(addTarget, qty, extra); setAddTarget(null); }}
        />
      )}
      {editItem && (
        <EditItemDialog
          item={editItem}
          stores={stores}
          onClose={() => setEditItem(null)}
          onSave={async (patch) => { await updateItem(editItem.id, patch); setEditItem(null); }}
          onDelete={async () => {
            const snapshot = await removeItem(editItem.id);
            setEditItem(null);
            toast(`${snapshot.name} fjernet`, () => restoreItem(snapshot));
          }}
          onReport={reportItem}
        />
      )}
      {completing && (
        <CompleteTripDialog
          boughtCount={picked.length}
          totalCount={items.length}
          onClose={() => setCompleting(false)}
          onComplete={completeTrip}
        />
      )}
    </div>
  );
}
