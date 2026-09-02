import { lazy, Suspense, useMemo, useRef, useState } from 'react';
import { Mic, Check, Plus, Search, Sparkles, ScanLine, Store, Trash2, AlertTriangle } from 'lucide-react';
import { Stepper } from '../components/Stepper.jsx';
import { ShopMode } from '../components/ShopMode.jsx';

// Skanneren (kamera + bildetolkning) lastes først når noen åpner den —
// den hører ikke hjemme i oppstartspakka alle laster i butikken.
const ListScanDialog = lazy(() =>
  import('../components/ListScanDialog.jsx').then((m) => ({ default: m.ListScanDialog })));
import { AddItemDialog } from '../components/AddItemDialog.jsx';
import { EditItemDialog } from '../components/EditItemDialog.jsx';
import { CompleteTripDialog } from '../components/CompleteTripDialog.jsx';
import { Dialog } from '../components/Dialog.jsx';
import { searchCatalog, guessUnit, isPackUnit, parseSpeech, resolveCatalogItem } from '../lib/catalog.js';
import { estimatedTotal, kr, stepQty, qtyDetail, estimateCost } from '../lib/format.js';
import { sortShoppingItems, SORT_MODES, loadSortMode, saveSortMode } from '../lib/sortItems.js';

/**
 * 44×44 trykkflate rundt den lille avkryssingsboksen. Boksen er 22 px av
 * hensyn til radhøyden, men fingeren i butikken treffer ikke 22 px — de
 * negative margene gjør flaten større uten å flytte boksen visuelt.
 * (Skal ikke brukes inni en annen <label>.)
 */
/** Småtekst under varenavnet: mengdeforklaring og prisanslag. */
function itemDetail(item) {
  const cost = estimateCost(item);
  return [
    qtyDetail(item.qty, item.unit, item.pack_size),
    Number(item.price) > 0 && cost > 0
      ? `${item.price_source === 'kassalapp' ? '' : 'ca. '}${kr(cost)}`
      : null,
  ].filter(Boolean).join(' · ');
}

function TapBox({ children }) {
  return (
    <label style={{
      display: 'grid', placeItems: 'center', width: 44, height: 44,
      margin: -11, flexShrink: 0, cursor: 'pointer',
    }}>
      {children}
    </label>
  );
}

export function Shop({
  items, catalog, normRules, stores, defaultStore,
  addItem, addMany, updateItem, toggleChecked, removeItem, restoreItem, clearAll,
  positionOf, hasLearnedFor, learnFromTrip, saveTrip, toast, reportItem, onSuggestItem,
}) {
  const [query, setQuery] = useState('');
  const [addTarget, setAddTarget] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [completing, setCompleting] = useState(false);
  const [micStatus, setMicStatus] = useState(null);
  const [micReview, setMicReview] = useState(null);  // { transcript, rows } til gjennomsyn
  const [newItem, setNewItem] = useState(null);      // ukjent vare: pris/kategori + del-valg

  // Hovedkategoriene slik de faktisk finnes i databasen.
  const majorCategories = useMemo(
    () => [...new Set(catalog.map((c) => c.major_category).filter(Boolean))].sort(),
    [catalog],
  );

  /** Godkjente talerader → kobles mot varedatabasen og legges til. */
  const submitMicReview = async () => {
    const chosen = micReview.rows.filter((r) => r.checked && r.name.trim());
    if (!chosen.length) { setMicReview(null); return; }
    const rows = chosen.map(({ qty, name, unit }) => {
      const { name: resolved, item } = resolveCatalogItem(name.trim(), catalog, normRules);
      return {
        name: resolved,
        qty,
        // Skannede lister kan ha enheten skrevet («500 g kjøttdeig») —
        // da vinner den over gjettingen.
        unit: unit || guessUnit(resolved, item?.major_category, qty),
        category: item?.major_category || 'Annet',
        store: item?.primary_store || defaultStore,
        price: item?.avg_price ?? null,
        price_source: item?.avg_price ? 'receipt' : null,
      };
    });
    setMicReview(null);
    // Slå sammen mot det som alt ligger på listen (samme navn + enhet) i
    // stedet for å lage duplikatrader — som søk-tillegg og «send til liste».
    const fresh = [];
    let merged = 0;
    const mergedNames = [];
    for (const r of rows) {
      const existing = items.find((i) =>
        i.name.toLowerCase() === r.name.toLowerCase()
        && (i.unit || 'stk') === (r.unit || 'stk'));
      if (existing) {
        const pack = Number(existing.pack_size) || 0;
        const ok = await updateItem(existing.id, {
          qty: Number(existing.qty) + (Number(r.qty) || (pack || 1)),
        });
        if (ok !== false) { merged += 1; mergedNames.push(r.name); }
      } else {
        fresh.push(r);
      }
    }
    const added = fresh.length ? (await addMany(fresh)) ?? [] : [];
    // Tell det som faktisk ble lagret. Før sto «La til 7 varer» også når
    // sperren eller nettet hadde stoppet alle sju.
    const n = merged + added.length;
    if (!n) { toast('Ingen varer ble lagt til — prøv igjen.'); return; }
    toast(`La til ${n} ${n === 1 ? 'vare' : 'varer'}: ${[...mergedNames, ...added.map((r) => r.name)].join(', ')}`);
  };
  const [micActive, setMicActive] = useState(false);
  const [showListScan, setShowListScan] = useState(false);
  const [shopMode, setShopMode] = useState(false);   // fullskjerm i butikken
  const [clearing, setClearing] = useState(null);    // { save, name } — tøm-listen-dialogen
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
    // Snapper til hele trinn, så «3,5 stk» blir 4 (ikke 4,5) med ett trykk.
    const next = stepQty(item.qty, dir, stepBy);

    if (next < stepBy) {
      // Minus under én pakke fjerner varen — med angremulighet.
      const snapshot = await removeItem(item.id);
      // Feilet slettingen ligger varen der fortsatt, og en angreknapp ville
      // laget en kopi av den i stedet for å hente den tilbake.
      if (snapshot) toast(`${item.name} fjernet`, () => restoreItem(snapshot));
      return;
    }
    await updateItem(item.id, { qty: next });
  };

  const addFromCatalog = async (entry, qty, extra = {}) => {
    const existing = items.find((i) => i.name.toLowerCase() === entry.name.toLowerCase());
    if (existing) {
      const pack = Number(existing.pack_size) || 1;
      const ok = await updateItem(existing.id, { qty: Number(existing.qty) + (qty ?? pack) });
      if (ok !== false) toast(`${entry.name} økt`);
      return;
    }
    const unit = extra.unit ?? guessUnit(entry.name, entry.major_category);
    const packSize = isPackUnit(unit) ? (qty ?? (unit === 'liter' ? 1 : 400)) : null;
    const row = await addItem({
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
    if (row) toast(`${entry.name} lagt til`);
  };

  const handleSubmitSearch = async (e) => {
    e.preventDefault();
    const raw = query.trim();
    if (!raw) return;
    const { name, item } = resolveCatalogItem(raw, catalog, normRules);
    if (item) {
      await addFromCatalog(item, null);
    } else {
      // Ukjent vare: brukeren setter prisestimat og kategori selv, og kan
      // foreslå varen til fellesdatabasen (godkjennes av admin først).
      setNewItem({ name, price: '', category: 'Annet', store: defaultStore, share: true });
    }
    setQuery('');
  };

  const submitNewItem = async () => {
    const price = newItem.price === '' ? null : Number(String(newItem.price).replace(',', '.'));
    const entry = {
      name: newItem.name.trim(),
      major_category: newItem.category,
      primary_store: newItem.store || defaultStore,
      avg_price: Number.isFinite(price) && price > 0 ? price : null,
    };
    setNewItem(null);
    await addFromCatalog(entry, null, entry.avg_price ? { price: entry.avg_price, price_source: 'manual' } : {});
    if (newItem.share && onSuggestItem) {
      const err = await onSuggestItem({
        name: entry.name,
        category: entry.major_category,
        price_estimate: entry.avg_price,
        store: entry.primary_store,
      });
      toast(err ?? 'Foreslått til fellesdatabasen — publiseres når admin har godkjent');
    }
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

    rec.onresult = (event) => {
      const text = event.results[0][0].transcript;
      setMicActive(false);
      const parsed = parseSpeech(text);
      if (!parsed.length) { toast('Fikk ikke tak i noen varer'); return; }
      // Ingenting legges til ennå — tolkningen vises til gjennomsyn først,
      // så feilhøringer kan rettes manuelt.
      setMicReview({
        transcript: text,
        rows: parsed.map(({ qty, name }) => ({ checked: true, name, qty })),
      });
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
          <button type="submit" className="btn btn-primary" style={{ minHeight: 44 }} disabled={!query.trim()}>
            <Plus size={16} /> Legg til
          </button>
          <button
            type="button"
            className="btn btn-icon"
            style={{ minWidth: 44, minHeight: 44 }}
            onClick={startMic}
            aria-label="Legg til med tale"
            title="Legg til med tale"
          >
            <Mic size={18} />
          </button>
          <button
            type="button"
            className="btn btn-icon"
            style={{ minWidth: 44, minHeight: 44 }}
            onClick={() => setShowListScan(true)}
            aria-label="Skann en handleliste"
            title="Skann en handleliste (håndskrevet lapp eller utskrift)"
          >
            <ScanLine size={18} />
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

      {/* Estimert total + fremdrift. Tallet til høyre er det som GJENSTÅR —
          det er spørsmålet man stiller seg midt i en handletur. */}
      <div className="row-between" style={{ padding: '4px var(--space-4) 0', alignItems: 'flex-end', gap: 12 }}>
        <div>
          <div className="card-kicker" style={{ marginBottom: 2 }}>Estimert total</div>
          <div className="tnum" style={{
            fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28,
            letterSpacing: '-0.02em', lineHeight: 1, color: 'var(--color-text)',
          }}>
            {total.label}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          {items.length > 0 && open.length === 0 ? (
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-herb-ink, var(--color-herb))' }}>
              Alt er plukket
            </div>
          ) : (
            <div className="tnum" style={{
              fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 18,
              letterSpacing: '-0.01em', lineHeight: 1.1,
            }}>
              {open.length} igjen
            </div>
          )}
          <div className="text-muted tnum" style={{ fontSize: 11.5, marginTop: 2 }}>
            {picked.length} av {items.length} kjøpt
            {items.length ? ` · ${Math.round((picked.length / items.length) * 100)} %` : ''}
          </div>
        </div>
      </div>
      <div style={{
        margin: '10px var(--space-4) 12px', height: 10, background: 'var(--color-bg-sunken)',
        borderRadius: 'var(--radius-full)', overflow: 'hidden',
        boxShadow: 'inset 0 1px 2px rgba(74, 54, 38, 0.10)',
      }}>
        <div style={{
          width: `${items.length ? Math.round((picked.length / items.length) * 100) : 0}%`,
          height: '100%',
          background: 'var(--color-herb)',
          borderRadius: 'var(--radius-full)',
          transition: 'width 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
        }} />
      </div>

      {/* I butikken? Fullskjerm med store trykkflater og våken skjerm. */}
      {open.length > 0 && (
        <div style={{ padding: '0 var(--space-4) var(--space-3)' }}>
          <button
            type="button"
            className="btn btn-primary btn-block"
            style={{ minHeight: 52, fontSize: 16 }}
            onClick={() => setShopMode(true)}
          >
            <Store size={18} /> Start butikkmodus
          </button>
        </div>
      )}

      {items.length > 0 && (
        <div style={{ padding: '0 var(--space-4) var(--space-3)' }}>
          <div className="seg">
            {[['alle', 'Alle'], ['open', 'Ikke kjøpt'], ['picked', 'Kjøpt']].map(([v, l]) => (
              <button
                key={v}
                type="button"
                className="seg-opt"
                style={{ minHeight: 40 }}
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
            style={{ width: 'auto', flex: 1, minWidth: 0, maxWidth: '100%', minHeight: 40, padding: '6px 10px', fontSize: 13 }}
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
                style={{ minHeight: 38, padding: '0 14px', fontSize: 12.5 }}
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
          {/* Butikkoverskrift. Er ruta lært, holder et lite merke ved siden av
              navnet — da slipper vi å bruke en hel linje på å si det. */}
          {label && kind === 'store' && (
            <>
              <hr className="divider" />
              <div className="section-head" style={{ paddingBottom: 2, alignItems: 'center' }}>
                <span className="row" style={{ gap: 6, minWidth: 0 }}>
                  <span className="section-title">{label}</span>
                  {hasLearnedFor(label) && (
                    <span className="tag tag-herb" style={{ flexShrink: 0 }} title="Sortert i din plukk-rekkefølge">
                      <Sparkles size={11} aria-hidden="true" /> Din rute
                    </span>
                  )}
                </span>
                <span className="text-muted tnum" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>
                  {rows.length} {rows.length === 1 ? 'vare' : 'varer'}{sum > 0 ? ` · ca. ${kr(Math.round(sum))}` : ''}
                </span>
              </div>
              {!hasLearnedFor(label) && (
                <div className="row" style={{ gap: 5, padding: '0 var(--space-4) 6px' }}>
                  <Sparkles size={11} color="var(--color-honey)" aria-hidden="true" style={{ flexShrink: 0 }} />
                  <span className="text-muted" style={{ fontSize: 11 }}>
                    Standard rekkefølge — fullfør en handletur her, så læres ruta
                  </span>
                </div>
              )}
            </>
          )}
          {label && kind !== 'store' && (
            <div className="section-head" style={{ paddingBottom: 4, alignItems: 'center' }}>
              <span className="section-title" style={{ fontSize: 15 }}>{label}</span>
              <span className="text-muted tnum" style={{ fontSize: 11.5 }}>{rows.length}</span>
            </div>
          )}
          {rows.map((item) => (
            <div key={item.id} className="item-row" style={{ minHeight: 58 }}>
              <TapBox>
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={false}
                  onChange={() => handleToggle(item)}
                  aria-label={`Plukk ${item.name}`}
                />
              </TapBox>
              <button type="button" className="item-mid" onClick={() => setEditItem(item)}>
                <div className="item-name">{item.name}</div>
                <div className="item-sub">
                  {Boolean(item.is_offer) && (
                    <span style={{ fontWeight: 700, color: 'var(--color-accent-ink, var(--color-accent))' }}>
                      TILBUD{' · '}
                    </span>
                  )}
                  {item.store || defaultStore}
                  {item.variant ? ` · ${item.variant}` : ''}
                </div>
                {/* Mengdeforklaring og prisanslag på full bredde her, ikke
                    inni den smale antallsruta — der presset de stepperen ut
                    over halve raden og klemte varenavnet i flere linjer. */}
                {itemDetail(item) && (
                  <div className="item-sub tnum">{itemDetail(item)}</div>
                )}
              </button>
              {/* Stepperen strekkes til 44 px høyde — ± er den knappen man
                  bommer mest på når mobilen holdes i én hånd. */}
              <div style={{ display: 'flex', alignItems: 'stretch', minHeight: 44, flexShrink: 0 }}>
                <Stepper item={item} onStep={(d) => handleStep(item, d)} onOpen={() => setEditItem(item)} />
              </div>
            </div>
          ))}
        </section>
      ))}

      {/* Tom liste — og det lille seiersøyeblikket når siste vare er huket av. */}
      {viewFilter !== 'picked' && !open.length && (
        picked.length > 0 ? (
          <div style={{ padding: 'var(--space-5) var(--space-4)', textAlign: 'center' }}>
            <span
              aria-hidden="true"
              style={{
                display: 'grid', placeItems: 'center', width: 56, height: 56, margin: '0 auto',
                borderRadius: '50%', background: 'var(--color-herb)',
                boxShadow: '0 6px 18px rgba(47, 112, 72, 0.26)',
              }}
            >
              <Check size={30} color="var(--color-text-inverse)" strokeWidth={2.6} />
            </span>
            <h2 style={{ fontSize: 22, marginTop: 'var(--space-3)' }}>Alt er plukket!</h2>
            <p className="text-muted tnum" style={{ fontSize: 13, marginTop: 6, marginBottom: 0 }}>
              {picked.length} {picked.length === 1 ? 'vare' : 'varer'} i kurven
              {total.sum > 0 ? ` · ${total.label}` : ''}. Fullfør handleturen nederst.
            </p>
          </div>
        ) : (
          <div style={{ padding: 'var(--space-5) var(--space-4)', textAlign: 'center' }}>
            <h2 style={{ fontSize: 20 }}>Handlelisten er tom</h2>
            <p className="text-muted" style={{ fontSize: 13, marginTop: 6, marginBottom: 0 }}>
              Søk etter en vare øverst, snakk den inn med mikrofonen,
              eller hent ingrediensene fra Middag-fanen.
            </p>
          </div>
        )
      )}

      {/* Plukket */}
      {viewFilter !== 'open' && picked.length > 0 && (
        <section style={{ marginTop: 'var(--space-4)' }}>
          <hr className="divider" />
          <div className="section-head" style={{ alignItems: 'center' }}>
            <span className="section-title" style={{ fontSize: 15, color: 'var(--color-text-muted)' }}>Plukket</span>
            <span className="text-muted tnum" style={{ fontSize: 11.5 }}>{picked.length}</span>
          </div>
          {picked.map((item) => (
            <div key={item.id} className="item-row is-checked" style={{ minHeight: 52 }}>
              <TapBox>
                <input
                  type="checkbox"
                  className="checkbox"
                  checked
                  onChange={() => handleToggle(item)}
                  aria-label={`Angre plukk av ${item.name}`}
                />
              </TapBox>
              <div className="item-mid">
                <div className="item-name">{item.name}</div>
                <div className="item-sub tnum">{item.qty} {item.unit}</div>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ minHeight: 44, justifyContent: 'center', flexShrink: 0 }}
                onClick={() => handleToggle(item)}
              >
                Angre
              </button>
            </div>
          ))}
        </section>
      )}

      {/* Fullfør handletur + tøm lista */}
      {items.length > 0 && (
        <div className="row" style={{ padding: 'var(--space-4)', gap: 8 }}>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ flex: 1, minHeight: 48 }}
            onClick={() => setCompleting(true)}
          >
            <Check size={16} /> Fullfør handletur
          </button>
          <button
            type="button"
            className="btn btn-icon"
            style={{ minWidth: 48, minHeight: 48 }}
            aria-label="Tøm handlelisten"
            title="Tøm hele handlelisten"
            onClick={() => setClearing({
              save: true,
              name: `Handleliste ${new Date().toLocaleDateString('nb-NO', { day: 'numeric', month: 'long' })}`,
            })}
          >
            <Trash2 size={16} />
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
      {/* Ny, ukjent vare: eget prisestimat + forslag til fellesdatabasen */}
      {newItem && (
        <Dialog
          title="Ny vare"
          subtitle="Denne finnes ikke i varedatabasen ennå"
          onClose={() => setNewItem(null)}
          footer={
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={!newItem.name.trim()}
              onClick={submitNewItem}
            >
              <Plus size={15} /> Legg til på listen
            </button>
          }
        >
          <label className="field">
            <span className="field-label">Navn</span>
            <input
              className="input"
              value={newItem.name}
              onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
            />
          </label>
          <div className="row" style={{ gap: 8 }}>
            <label className="field" style={{ flex: 1 }}>
              <span className="field-label">Prisestimat (kr, valgfritt)</span>
              <input
                className="input"
                inputMode="decimal"
                placeholder="f.eks. 32,90"
                value={newItem.price}
                onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
              />
            </label>
            <label className="field" style={{ flex: 1 }}>
              <span className="field-label">Kategori</span>
              <select
                className="input"
                value={newItem.category}
                onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
              >
                {majorCategories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          </div>
          <label className="field">
            <span className="field-label">Butikk</span>
            <select
              className="input"
              value={newItem.store}
              onChange={(e) => setNewItem({ ...newItem, store: e.target.value })}
            >
              {stores.map((s) => <option key={s.code} value={s.name}>{s.name}</option>)}
            </select>
          </label>
          <label className="row" style={{ gap: 10, cursor: 'pointer', alignItems: 'flex-start' }}>
            <input
              type="checkbox"
              className="checkbox"
              checked={newItem.share}
              onChange={(e) => setNewItem({ ...newItem, share: e.target.checked })}
            />
            <span style={{ fontSize: 13 }}>
              Foreslå varen til fellesdatabasen
              <span className="text-muted" style={{ display: 'block', fontSize: 11, marginTop: 2 }}>
                Publiseres for alle først når administratoren har godkjent.
                Uansett valg havner varen på din liste nå.
              </span>
            </span>
          </label>
        </Dialog>
      )}

      {/* Talegjennomsyn: rett feilhøringer før noe legges på listen */}
      {/* Skann en handleliste: lapp/notat/utskrift → samme gjennomsyn som tale */}
      {showListScan && (
        <Suspense fallback={null}>
        <ListScanDialog
          onClose={() => setShowListScan(false)}
          onRows={(rows) => setMicReview({
            title: 'Leste jeg riktig?',
            subtitle: `${rows.length} varer fra den skannede listen — rett og godkjenn`,
            rows: rows.map((r) => ({
              checked: true,
              name: r.name,
              qty: r.qty ?? 1,
              unit: r.unit ?? null,
            })),
          })}
        />
        </Suspense>
      )}

      {micReview && (() => {
        const patchRow = (idx, patch) => setMicReview({
          ...micReview,
          rows: micReview.rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
        });
        const count = micReview.rows.filter((r) => r.checked && r.name.trim()).length;
        return (
          <Dialog
            title={micReview.title ?? 'Hørte jeg riktig?'}
            subtitle={micReview.transcript != null
              ? `Du sa: «${micReview.transcript}»`
              : micReview.subtitle}
            onClose={() => setMicReview(null)}
            footer={
              <div className="row" style={{ gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  disabled={!count}
                  onClick={submitMicReview}
                >
                  <Plus size={15} /> Legg til ({count})
                </button>
                <button type="button" className="btn" onClick={() => setMicReview(null)}>
                  Avbryt
                </button>
              </div>
            }
          >
            {micReview.rows.map((row, idx) => {
              const { name: resolved, item } = resolveCatalogItem(row.name.trim(), catalog, normRules);
              const known = Boolean(item);
              return (
                <div key={idx} className="item-row" style={{ paddingLeft: 0, paddingRight: 0, alignItems: 'flex-start' }}>
                  <label style={{
                    display: 'grid', placeItems: 'center', width: 44, height: 44,
                    margin: '-3px -11px -11px -11px', flexShrink: 0, cursor: 'pointer',
                  }}>
                    <input
                      type="checkbox"
                      className="checkbox"
                      checked={row.checked}
                      onChange={(e) => patchRow(idx, { checked: e.target.checked })}
                      aria-label={`Ta med ${row.name}`}
                    />
                  </label>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <input
                      className="input"
                      value={row.name}
                      onChange={(e) => patchRow(idx, { name: e.target.value })}
                      aria-label="Rett varenavnet"
                      style={{ padding: '8px 10px', fontSize: 14 }}
                    />
                    <div className="item-sub" style={{ marginTop: 3 }}>
                      {row.name.trim()
                        ? (known
                          ? <>→ {resolved} · {item.major_category}{item.avg_price ? ` · ca. ${kr(item.avg_price)}` : ''}</>
                          : `→ «${resolved}» (ny vare)`)
                        : 'Skriv et varenavn'}
                    </div>
                  </div>
                  <div className="row" style={{ gap: 2, flexShrink: 0, marginTop: 0 }}>
                    <button
                      type="button"
                      className="btn btn-icon"
                      style={{ minWidth: 44, minHeight: 44, fontSize: 18 }}
                      aria-label="Færre"
                      onClick={() => patchRow(idx, { qty: Math.max(1, row.qty - 1) })}
                    >
                      −
                    </button>
                    <span className="tnum" style={{ minWidth: 26, textAlign: 'center', fontSize: 15, fontWeight: 700, lineHeight: '44px' }}>
                      {row.qty}
                    </span>
                    <button
                      type="button"
                      className="btn btn-icon"
                      style={{ minWidth: 44, minHeight: 44, fontSize: 18 }}
                      aria-label="Flere"
                      onClick={() => patchRow(idx, { qty: row.qty + 1 })}
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </Dialog>
        );
      })()}

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
      {shopMode && (
        <ShopMode
          items={items}
          stores={stores}
          activeStore={activeStore}
          onPickStore={pickStore}
          positionOf={positionOf}
          hasLearnedFor={hasLearnedFor}
          defaultStore={defaultStore}
          onToggle={handleToggle}
          onComplete={() => { setShopMode(false); setCompleting(true); }}
          onClose={() => setShopMode(false)}
        />
      )}
      {/* Tøm hele lista — med tydelig varsel og mulighet for kopi først */}
      {clearing && (
        <Dialog
          title="Tømme hele handlelisten?"
          subtitle="Gjelder alle i husholdningen — ikke bare deg"
          onClose={() => setClearing(null)}
          footer={
            <div className="row" style={{ gap: 8 }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1 }}
                disabled={clearing.save && !clearing.name.trim()}
                onClick={async () => {
                  const { save, name } = clearing;
                  setClearing(null);
                  if (save) await saveTrip(name.trim(), items);
                  const snapshot = await clearAll();
                  toast(
                    `Handlelisten tømt — ${snapshot.length} ${snapshot.length === 1 ? 'vare' : 'varer'}${save ? ` (kopi lagret som «${name.trim()}»)` : ''}`,
                    async () => { for (const row of snapshot) await restoreItem(row); },
                  );
                }}
              >
                <Trash2 size={15} /> Tøm listen ({items.length})
              </button>
              <button type="button" className="btn" onClick={() => setClearing(null)}>
                Avbryt
              </button>
            </div>
          }
        >
          <div className="row" style={{
            gap: 10, alignItems: 'flex-start', padding: '10px 12px',
            border: '1px solid var(--color-accent)', borderRadius: 'var(--radius)',
            background: 'var(--color-accent-100)', marginBottom: 'var(--space-4)',
          }}>
            <AlertTriangle size={16} color="var(--color-accent)" style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
            <span style={{ fontSize: 13, lineHeight: 1.5 }}>
              <strong>{items.length} {items.length === 1 ? 'vare' : 'varer'}</strong>
              {total.sum > 0 ? <> til {total.label}</> : null} forsvinner fra listen.
              Angreknappen i varselet nederst gjelder bare et lite øyeblikk —
              etterpå kan det ikke gjøres om.
            </span>
          </div>

          <label className="row" style={{ gap: 10, cursor: 'pointer', alignItems: 'flex-start' }}>
            <input
              type="checkbox"
              className="checkbox"
              checked={clearing.save}
              onChange={(e) => setClearing({ ...clearing, save: e.target.checked })}
            />
            <span style={{ fontSize: 13 }}>
              Lagre en kopi som handletur først
              <span className="text-muted" style={{ display: 'block', fontSize: 11, marginTop: 2 }}>
                Anbefalt — kopien havner under Forslag og kan hentes tilbake
                med ett trykk.
              </span>
            </span>
          </label>
          {clearing.save && (
            <label className="field" style={{ marginTop: 'var(--space-3)' }}>
              <span className="field-label">Navn på kopien</span>
              <input
                className="input"
                value={clearing.name}
                onChange={(e) => setClearing({ ...clearing, name: e.target.value })}
              />
            </label>
          )}
        </Dialog>
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
