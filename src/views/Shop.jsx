import { useMemo, useRef, useState } from 'react';
import { Mic, Check } from 'lucide-react';
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
  positionOf, hasLearnedFor, learnFromTrip, saveTrip, toast,
}) {
  const [query, setQuery] = useState('');
  const [addTarget, setAddTarget] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [completing, setCompleting] = useState(false);
  const [micStatus, setMicStatus] = useState(null);
  // Sorteringsvalget huskes per enhet — den som vil ha pris-visning i
  // butikken skal slippe å velge det på nytt hver gang.
  const [sortMode, setSortMode] = useState(loadSortMode);
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
    rec.lang = 'no-NO';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    setMicStatus('Lytter …');

    rec.onresult = async (event) => {
      const text = event.results[0][0].transcript;
      setMicStatus(null);
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
    rec.onerror = () => setMicStatus('Fikk ikke tilgang til mikrofonen.');
    rec.onend = () => setMicStatus((s) => (s === 'Lytter …' ? null : s));
    rec.start();
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
          <input
            className="input"
            placeholder="Søk eller legg til vare …"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Søk etter vare"
          />
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
        {micStatus && <div className="text-muted" style={{ fontSize: 11, marginTop: 6 }}>{micStatus}</div>}

        {suggestions.length > 0 && (
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
          </div>
        )}
      </div>

      {/* Estimert total + sortering */}
      <div className="row-between" style={{ padding: '0 var(--space-4) var(--space-3)' }}>
        <span className="text-muted" style={{ fontSize: 12 }}>
          {open.length} igjen · {picked.length} plukket
        </span>
        <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 15 }}>
          {total.label}
        </span>
      </div>
      {open.length > 1 && (
        <div className="row" style={{ padding: '0 var(--space-4) var(--space-3)', gap: 8, alignItems: 'center' }}>
          <label className="text-muted" htmlFor="shop-sort" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 600 }}>
            Sortering
          </label>
          <select
            id="shop-sort"
            className="input"
            value={sortMode}
            onChange={(e) => changeSort(e.target.value)}
            style={{ width: 'auto', flex: 1, padding: '6px 10px', fontSize: 13 }}
          >
            {SORT_MODES.map((m) => (
              <option key={m.value} value={m.value}>{m.label} — {m.hint}</option>
            ))}
          </select>
        </div>
      )}

      {sortMode === 'plukk' && open.length > 1 && (
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
          {!hasLearnedFor(activeStore) && (
            <p className="text-muted" style={{ fontSize: 11, margin: '8px 0 0' }}>
              Ingen lært rekkefølge for {activeStore} ennå — foreløpig vises
              standard kategorirekkefølge. Fullfør en handletur her, så lærer
              lista ruta deres i denne butikken.
            </p>
          )}
        </div>
      )}
      <hr className="divider" />

      {/* Åpne varer, gruppert i lært plukk-rekkefølge */}
      {groups.map(({ key, label, rows }) => (
        <section key={key}>
          {label && (
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
            </div>
          ))}
        </section>
      ))}

      {!open.length && (
        <p className="text-muted" style={{ padding: 'var(--space-5) var(--space-4)', fontSize: 13 }}>
          Handlelisten er tom. Søk øverst, eller hent forslag fra Middag-fanen.
        </p>
      )}

      {/* Plukket */}
      {picked.length > 0 && (
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
