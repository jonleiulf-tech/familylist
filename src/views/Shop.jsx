import { lazy, Suspense, useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { Mic, Check, Plus, Search, Sparkles, ScanLine, Store, Trash2, AlertTriangle, Receipt } from 'lucide-react';
import { Stepper } from '../components/Stepper.jsx';
import { ShopMode } from '../components/ShopMode.jsx';

// Skanneren (kamera + bildetolkning) lastes først når noen åpner den —
// den hører ikke hjemme i oppstartspakka alle laster i butikken.
const ListScanDialog = lazy(() =>
  import('../components/ListScanDialog.jsx').then((m) => ({ default: m.ListScanDialog })));
const ReceiptDialog = lazy(() =>
  import('../components/ReceiptDialog.jsx').then((m) => ({ default: m.ReceiptDialog })));
import { AddItemDialog } from '../components/AddItemDialog.jsx';
import { EditItemDialog } from '../components/EditItemDialog.jsx';
import { CompleteTripDialog } from '../components/CompleteTripDialog.jsx';
import { Dialog } from '../components/Dialog.jsx';
import { searchCatalog, guessUnit, isPackUnit, parseSpeech, resolveCatalogItem, guessCategory } from '../lib/catalog.js';
import { estimatedTotal, kr, stepQty, qtyDetail, estimateCost } from '../lib/format.js';
import { sortShoppingItems, SORT_MODES, loadSortMode, saveSortMode } from '../lib/sortItems.js';
import { storeLabel } from '../lib/priceDrop.js';
import { storeKey, routedStores } from '../lib/storeRoutes.js';
import { habitQty } from '../lib/priceLearning.js';
import { normalizeUnit } from '../lib/units.js';
import { lower, sameName, trimmed } from '../lib/text.js';

import { buildPriceIndex, optimizeBasket } from '../lib/basketOptimizer.js';
import { STORE_CODES } from '../lib/offers.js';
import { supabase } from '../lib/supabase.js';
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
  items: rawItems, catalog, normRules, stores, defaultStore,
  addItem, addMany, mayAdd, updateItem, toggleChecked, removeItem, restoreItem, clearAll,
  offers = [], purchases = null, shoppingSettings = null,
  positionOf, hasLearnedFor, learnFromTrip, saveTrip, toast, reportItem, onSuggestItem,
  // Mengdevaner lært av kvitteringene: «dere kjøper to av denne».
  habits = new Map(),
  // Kvitteringsopplasting hører hjemme her, der handleturen slutter.
  onReceipt, points = null,
}) {
  const [query, setQuery] = useState('');
  const [addTarget, setAddTarget] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [completing, setCompleting] = useState(false);
  const [micStatus, setMicStatus] = useState(null);
  const [micReview, setMicReview] = useState(null);  // { transcript, rows } til gjennomsyn
  const [newItem, setNewItem] = useState(null);      // ukjent vare: pris/kategori + del-valg
  const [receipting, setReceipting] = useState(false);

  /**
   * Butikknavnet slik husholdningen kjenner det.
   *
   * Kassalapp oppgir butikken som KODE («MENY_NO»), butikkvelgeren bruker
   * navnet («Meny»). Blandes de, får samme butikk to seksjoner i
   * butikkmodus — «Meny» og «MENY_NO» rett under hverandre. Her oversettes
   * alt til navnet i husholdningens butikkliste.
   */
  const toStoreName = useMemo(() => {
    // Nøklene MÅ lages med samme vask som oppslaget. Før ble de lagt inn
    // med mellomrom («meny hovenga») og slått opp med understrek
    // («meny_hovenga»), så et butikknavn med mellomrom ble aldri funnet —
    // og det var nettopp den feilen normaliseringen skulle rette.
    const byKey = new Map();
    for (const st of stores ?? []) {
      const name = String(st.name ?? '').trim();
      if (!name) continue;
      byKey.set(storeKey(name), name);
      if (st.code) byKey.set(storeKey(st.code), name);
    }
    return (value) => {
      const raw = String(value ?? '').trim();
      if (!raw) return defaultStore;
      const hit = byKey.get(storeKey(raw));
      if (hit) return hit;
      // Ikke i husholdningens butikkliste: gjør i det minste koden om til
      // et lesbart navn, og finn en kjent kjede bak et filialnavn.
      const label = storeLabel(raw);
      if (label && byKey.has(storeKey(label))) return byKey.get(storeKey(label));
      const known = routedStores().find((r) => storeKey(r) === storeKey(raw)
        || storeKey(raw).startsWith(`${storeKey(r)} `));
      return known ?? label ?? raw;
    };
  }, [stores, defaultStore]);

  // Radene vises alltid med butikkNAVN, uansett hva som står i basen.
  const items = useMemo(
    () => (rawItems ?? []).map((i) => ({ ...i, store: toStoreName(i.store) })),
    [rawItems, toStoreName],
  );

  // Hovedkategoriene slik de faktisk finnes i databasen.
  const majorCategories = useMemo(
    () => [...new Set(catalog.map((c) => c.major_category).filter(Boolean))].sort(),
    [catalog],
  );

  /** Godkjente talerader → kobles mot varedatabasen og legges til. */
  const submitMicReview = async () => {
    // trimmed(r.name): radene kommer fra tale og fra en skannet
    // handleliste — begge er tekst en maskin har tolket, og en rad uten
    // navn er fullt mulig.
    const chosen = micReview.rows.filter((r) => r.checked && trimmed(r.name));
    if (!chosen.length) { setMicReview(null); return; }
    const rows = chosen.map(({ qty, name, unit }) => {
      const { name: resolved, item } = resolveCatalogItem(trimmed(name), catalog, normRules);
      return {
        name: resolved,
        qty,
        // Skannede lister kan ha enheten skrevet («500 g kjøttdeig») —
        // da vinner den over gjettingen.
        unit: unit || guessUnit(resolved, item?.major_category, qty),
        category: item?.major_category || guessCategory(name),
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
        lower(i.name) === lower(r.name)
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

  /**
   * Rekkefølgen kategoriene ble plukket i, lest av NÅR varene ble huket av.
   *
   * Sto før i en useRef inne i denne komponenten. Handel monteres av og
   * på når man bytter fane, så ruta ble glemt hver gang — og i butikken,
   * der telefonen gjerne legges i lomma og appen startes på nytt, ble den
   * aldri lært i det hele tatt. Appen fortsatte å love «fullfør en
   * handletur her, så læres ruta» tur etter tur.
   *
   * checked_at ligger i databasen og settes av BEGGE telefonene, så nå
   * læres også det den andre plukket.
   */
  const pickedCategories = (rows) => {
    const seen = new Set();
    return [...rows]
      .filter((i) => i.checked_at)
      .sort((a, b) => new Date(a.checked_at) - new Date(b.checked_at))
      .map((i) => i.category || 'Annet')
      .filter((c) => (seen.has(c) ? false : seen.add(c)));
  };
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
  const suggestions = useMemo(
    () => (query.trim() ? searchCatalog(query, catalog, 8) : []),
    [query, catalog],
  );

  const open = items.filter((i) => !i.checked);
  const picked = items.filter((i) => i.checked);
  const total = estimatedTotal(items);

  // --- Fase 3: er det verdt å dra til en butikk til? ----------------------
  // Siste kjente pris per vare og kjede hentes i ett kall når lista endrer
  // navn. Selve regnestykket er rent (basketOptimizer.js) og testet uten
  // base.
  const [snapshot, setSnapshot] = useState([]);
  const åpneNavn = useMemo(() => [...new Set(open.map((i) => trimmed(i.name)).filter(Boolean))].sort().join('|'), [open]);
  useEffect(() => {
    let aktiv = true;
    const navn = åpneNavn ? åpneNavn.split('|') : [];
    if (!navn.length) { setSnapshot([]); return undefined; }
    supabase.rpc('price_snapshot', { p_items: navn, p_days: 60 })
      .then(({ data, error }) => { if (aktiv && !error && Array.isArray(data)) setSnapshot(data); })
      .catch(() => {});
    return () => { aktiv = false; };
  }, [åpneNavn]);
  const storeCodeOf = useCallback((name) => stores.find((s) => s.name === name)?.code ?? STORE_CODES[name] ?? name, [stores]);
  const storeNameOf = useCallback((code) => stores.find((s) => s.code === code)?.name ?? code, [stores]);
  const split = useMemo(() => {
    const idx = buildPriceIndex({ snapshot, offers, items: open, storeCode: storeCodeOf });
    return optimizeBasket({
      items: open, priceIndex: idx, defaultStore: storeCodeOf(defaultStore),
      storePref: purchases?.storePref ?? new Map(), settings: shoppingSettings ?? {}, storeName: storeNameOf,
    });
  }, [snapshot, offers, open, defaultStore, purchases, shoppingSettings, storeCodeOf, storeNameOf]);
  const [splitDismissed, setSplitDismissed] = useState(() => {
    try { return localStorage.getItem('pl.split.dismissed') ?? ''; } catch { return ''; }
  });
  const splitKey = split.moves.map((m) => m.itemId ?? m.name).sort().join('|');
  const dismissSplit = () => {
    setSplitDismissed(splitKey);
    try { localStorage.setItem('pl.split.dismissed', splitKey); } catch { /* ignorer */ }
  };
  const applySplit = async () => {
    for (const m of split.moves) {
      if (m.itemId) await updateItem(m.itemId, { store: storeNameOf(m.to) });
    }
    toast(`${split.moves.length} ${split.moves.length === 1 ? 'vare flyttet' : 'varer flyttet'} til ${[...new Set(split.moves.map((m) => storeNameOf(m.to)))].join(' og ')}`);
  };

  const groups = useMemo(
    () => sortShoppingItems(open, sortMode, { positionOf, defaultStore, currentStore: activeStore }),
    [open, sortMode, positionOf, defaultStore, activeStore],
  );

  const changeSort = (mode) => { setSortMode(mode); saveSortMode(mode); };

  // --- Handlinger -----------------------------------------------------------
  // Rekkefølgen leses av checked_at når turen avsluttes, ikke samlet opp
  // her — se pickedCategories(). Læringen ble før også tilskrevet den
  // AKTIVE butikken, så et Meny-produkt du huket av mens du sto i Coop
  // Extra lærte Coop Extra at Meny-kategorien lå der i ruta.
  const handleToggle = async (item) => { await toggleChecked(item); };

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
    // Spørsmålet stilles ØVERST, før vi vet om det blir en ny rad eller
    // en økning på en som fins. Sto det bare i addItem, slapp økningen
    // gjennom sperren — samme handling, to utfall, avhengig av noe
    // brukeren ikke kan se.
    if (mayAdd && !mayAdd()) return;
    const existing = items.find((i) => sameName(i.name, entry.name));
    if (existing) {
      const pack = Number(existing.pack_size) || 1;
      const ok = await updateItem(existing.id, { qty: Number(existing.qty) + (qty ?? pack) });
      if (ok !== false) toast(`${entry.name} økt`);
      return;
    }
    const unit = extra.unit ?? guessUnit(entry.name, entry.major_category);
    // Vanen slår standarden: legger appen til 1 av alt, blir estimatet for
    // lavt for en familie som kjøper to. Bare når enheten stemmer — en
    // vane på «3 stk» sier ingenting om hvor mange GRAM vi kjøper.
    //
    // Enhetene må vaskes før de sammenlignes. Kvitteringen skriver «l»,
    // guessUnit svarer «liter», og «l» !== «liter» gjorde vanen død for
    // melk, yoghurt, juice og fløte — de linjene som går oftest igjen.
    const habit = habits.get(String(entry.name ?? '').toLowerCase());
    const habitual = habit && normalizeUnit(habit.unit ?? 'stk') === normalizeUnit(unit)
      ? habitQty(habit) : null;
    const wanted = qty ?? habitual;
    // Pakningsstørrelsen er en EGENSKAP ved varen, ikke antallet vi vil ha.
    // Ble den satt lik mengden, delte purchases() mengden på seg selv:
    // 3 liter melk ble «1 pakning» og estimatet ganget med 1.
    const packSize = isPackUnit(unit)
      ? (Number(entry.pack_size) || (unit === 'liter' ? 1 : 400))
      : null;
    // Kassalapp-treff bærer butikkoden med seg — oversett før den lagres.
    const store = toStoreName(extra.store ?? entry.primary_store ?? defaultStore);
    const row = await addItem({
      name: entry.name,
      qty: wanted ?? (packSize ?? 1),
      unit,
      pack_size: packSize,
      category: entry.major_category || guessCategory(entry.name),
      price: entry.avg_price ?? null,
      price_source: entry.avg_price ? 'receipt' : null,
      ...extra,
      // Etter ...extra: butikken skal alltid være navnet, aldri koden.
      store,
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
      name: trimmed(newItem.name),
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

  /**
   * Ferdig i ÉN butikk, videre til neste.
   *
   * En handletur er ofte to eller tre butikker. Før måtte man vente med å
   * fullføre til alt var plukket, og da lærte appen ruta i alle butikkene
   * på én gang — eller man fullførte for tidlig og mistet resten av
   * listen. Nå avsluttes én butikk av gangen: ruta DER læres, de plukkede
   * varene der forsvinner fra listen, og resten står urørt.
   */
  const finishStore = async (store) => {
    const bought = items.filter((i) => i.checked && i.store === store);

    // Ruta læres bare for denne butikken.
    const cats = pickedCategories(bought);
    if (cats.length) await learnFromTrip({ [store]: cats });

    const snapshot = [];
    for (const it of bought) {
      const snap = await removeItem(it.id);
      if (snap) snapshot.push(snap);
    }

    // Neste butikk med noe igjen å plukke.
    const next = items.find((i) => !i.checked && i.store !== store)?.store ?? null;
    if (next) setActiveStore(next);

    toast(
      `Ferdig på ${store} — ${bought.length} ${bought.length === 1 ? 'vare' : 'varer'}`
        + (next ? ` · videre til ${next}` : ''),
      async () => { for (const row of snapshot) await restoreItem(row); },
    );
    return next;
  };

  // --- Fullfør handletur ----------------------------------------------------
  /**
   * Fullfører turen.
   *
   * FJERNER BARE DET SOM ER PLUKKET. Før slettet den HELE listen, men
   * lagret bare de avkryssede — så en vare som var utsolgt, eller som du
   * hadde tenkt å ta på Meny, forsvant sporløst uten å ligge i den lagrede
   * turen heller. Den eneste veien tilbake var en angre-knapp som forsvant
   * etter seks sekunder.
   *
   * Det som ikke er plukket, står igjen. Det er tross alt fortsatt noe
   * familien mangler.
   */
  const completeTrip = async ({ save, name }) => {
    const boughtItems = items.filter((i) => i.checked);

    // Lær plukk-rekkefølgen fra denne turen, per butikk, ut fra når hver
    // vare faktisk ble huket av.
    const byStore = {};
    for (const store of [...new Set(boughtItems.map((i) => i.store))]) {
      const cats = pickedCategories(boughtItems.filter((i) => i.store === store));
      if (cats.length) byStore[store] = cats;
    }
    if (Object.keys(byStore).length) await learnFromTrip(byStore);

    if (save && boughtItems.length) await saveTrip(name, boughtItems);

    const snapshot = [];
    for (const it of boughtItems) {
      const snap = await removeItem(it.id);
      if (snap) snapshot.push(snap);
    }
    const left = items.length - boughtItems.length;
    setCompleting(false);
    toast(
      `Handletur fullført — ${boughtItems.length} ${boughtItems.length === 1 ? 'vare' : 'varer'}`
        + (left > 0 ? ` · ${left} ${left === 1 ? 'vare' : 'varer'} står igjen på listen` : ''),
      async () => { for (const row of snapshot) await restoreItem(row); },
    );
  };

  return (
    <div>
      {/* Søk og talelegging */}
      <div style={{ padding: 'var(--space-4) var(--space-4) var(--space-2)' }}>
        {/* Søkefeltet er inngangen til hele listen og må ha hele bredden:
            med knappene på samme rad ble det så smalt at «Tørre
            stellekluter» rullet ut av syne mens man skrev. Knappene får
            sin egen rad under. */}
        <form onSubmit={handleSubmitSearch} className="stack" style={{ gap: 8 }}>
          <div style={{ position: 'relative' }}>
            <Search
              size={15}
              style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }}
              aria-hidden="true"
            />
            <input
              className="input"
              style={{ paddingLeft: 34, minHeight: 46, fontSize: 16 }}
              placeholder="Søk eller legg til vare …"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Søk etter vare"
            />
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ flex: 1, minHeight: 44 }}
              disabled={!query.trim()}
            >
              <Plus size={16} /> Legg til
            </button>
            <button
              type="button"
              className="btn btn-icon"
              style={{ minWidth: 44, minHeight: 44, flex: 'none' }}
              onClick={startMic}
              aria-label="Legg til med tale"
              title="Legg til med tale"
            >
              <Mic size={18} />
            </button>
            <button
              type="button"
              className="btn btn-icon"
              style={{ minWidth: 44, minHeight: 44, flex: 'none' }}
              onClick={() => setShowListScan(true)}
              aria-label="Skann en handleliste"
              title="Skann en handleliste (håndskrevet lapp eller utskrift)"
            >
              <ScanLine size={18} />
            </button>
          </div>
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

      {/* Anslag + fremdrift. Tallet til høyre er det som GJENSTÅR — det er
          spørsmålet man stiller seg midt i en handletur.

          «Estimert total» var en påstand om en TOTAL, men tallet var en
          delsum: varer uten pris ble filtrert bort og aldri nevnt. I
          piloten manglet 15 av 57 varer pris, og appen sa 2 326 kroner
          mens kassa sa 3 281. Nå heter det «Anslag for listen», står som
          «minst» når noe mangler, og sier hvor mange varer som ikke er
          med. */}
      <div className="row-between" style={{ padding: '4px var(--space-4) 0', alignItems: 'flex-end', gap: 12 }}>
        <div>
          <div className="card-kicker" style={{ marginBottom: 2 }}>Anslag for listen</div>
          <div className="tnum" style={{
            fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 28,
            letterSpacing: '-0.02em', lineHeight: 1, color: 'var(--color-text)',
          }}>
            {total.label}
          </div>
          {total.note && (
            <div className="text-muted" style={{ fontSize: 11, marginTop: 3 }}>{total.note}</div>
          )}
          {/* Hvor pengene går, når lista spenner over flere butikker — og
              hvor mye av anslaget som hviler på priser vi faktisk har sett. */}
          {total.byStore.length > 1 && (
            <div className="text-muted tnum" style={{ fontSize: 11, marginTop: 3 }}>
              {total.byStore.filter((s) => s.counted).map((s) => `${s.store} ${kr(s.sum)}`).join(' · ')}
            </div>
          )}
          {total.coverage != null && total.coverage < 0.995 && total.counted > 0 && (
            <div className="text-muted tnum" style={{ fontSize: 11, marginTop: 2 }}>
              Prisdekning {Math.round(total.coverage * 100)} % — resten er anslag
            </div>
          )}
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

      {/* Fase 3: én anbefaling, aldri «tre butikker for 103 kr». Vises bare
          når en ekstra butikk faktisk er verdt det etter husholdningens egne
          krav (households.min_saving_extra_store). */}
      {split.moves.length > 0 && splitDismissed !== splitKey && (
        <div className="card" style={{ margin: '10px var(--space-4) 0', padding: '12px 14px' }}>
          <div className="card-kicker" style={{ marginBottom: 4 }}>Del opp handelen?</div>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{split.message}</p>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.5 }}>
            {split.moves.slice(0, 5).map((m) => (
              <li key={m.itemId ?? m.name} className="tnum">
                {m.name} — {kr(m.cost)} hos {storeNameOf(m.to)} <span className="text-muted">({kr(m.homeCost)} hjemme{m.reason === 'tilbud' ? ', tilbud' : m.reason === 'vane' ? ', dere pleier' : ''})</span>
              </li>
            ))}
          </ul>
          {split.note && <p className="text-muted" style={{ margin: '6px 0 0', fontSize: 12 }}>{split.note}</p>}
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <button type="button" className="btn btn-primary" onClick={applySplit}>
              Flytt {split.moves.length} til {[...new Set(split.moves.map((m) => storeNameOf(m.to)))].join(' og ')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={dismissSplit}>Ikke verdt det</button>
          </div>
        </div>
      )}
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

      {/* ---------- Kvitteringer: gjør tjenesten bedre ----------
          Lå bortgjemt under Lister sammen med Keep-import. Kvitteringen
          hører hjemme HER: handleturen slutter på Handel, og kvitteringen
          ligger i lomma idet du går ut av butikken.

          Teksten sier hva DU får igjen for det, og den er sann: prisene
          rettes av kvitteringene (piloten viste 2-3 ganger for høye
          priser i basen), mengdene læres av dem, og forslagene rangeres
          etter hva dere faktisk kjøper. */}
      {onReceipt && (
        <div style={{ padding: '0 var(--space-4) var(--space-5)' }}>
          <div
            className="card"
            style={{
              background: 'var(--color-herb-100)',
              borderColor: 'var(--color-herb-200)',
            }}
          >
            <div className="card-kicker">Hjelp oss å gjøre tjenesten bedre</div>
            <div className="card-title" style={{ fontSize: 16 }}>
              Last opp kvitteringene deres
            </div>
            <p style={{ fontSize: 12.5, margin: '6px 0 0', lineHeight: 1.45 }}>
              Da lærer appen hva varene faktisk koster og hvor mye dere
              pleier å kjøpe. Anslaget blir riktigere, forslagene treffer
              bedre, og prisene justeres etter virkeligheten i stedet for
              en gjetning.
            </p>
            <p className="text-muted" style={{ fontSize: 12, margin: '8px 0 0', lineHeight: 1.45 }}>
              Du får <strong>20 Plukkepoeng</strong> per kvittering — 150 poeng
              er én måned gratis.
              {points !== null && points > 0 && ` Dere har ${points} poeng nå.`}
            </p>
            <p className="text-muted" style={{ fontSize: 11, margin: '8px 0 0', lineHeight: 1.45 }}>
              Prisene deles anonymt med de andre familiene — uten navn og
              uten husholdning. Hva DERE kjøper, blir liggende hos dere.
              Ingenting lagres før du har godkjent kvitteringen.
            </p>
            <button
              type="button"
              className="btn btn-primary btn-block"
              style={{ marginTop: 'var(--space-3)' }}
              onClick={() => setReceipting(true)}
            >
              <Receipt size={15} /> Last opp kvittering
            </button>
          </div>
        </div>
      )}

      {receipting && (
        <Suspense fallback={null}>
          <ReceiptDialog
            onClose={() => setReceipting(false)}
            onApply={onReceipt}
            toast={toast}
          />
        </Suspense>
      )}

      {addTarget && (
        <AddItemDialog
          entry={addTarget}
          stores={stores}
          defaultStore={defaultStore}
          habit={habits.get(String(addTarget.name ?? '').toLowerCase()) ?? null}
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
              disabled={!trimmed(newItem.name)}
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
        const count = micReview.rows.filter((r) => r.checked && trimmed(r.name)).length;
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
              const { name: resolved, item } = resolveCatalogItem(trimmed(row.name), catalog, normRules);
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
                      {trimmed(row.name)
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
          onResolveName={(next) => {
            const { name, item } = resolveCatalogItem(next, catalog, normRules);
            return { name, category: item?.major_category ?? null };
          }}
          otherNames={new Set(items
            .filter((i) => i.id !== editItem.id)
            .map((i) => String(i.name ?? '').toLowerCase()))}
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
          onFinishStore={finishStore}
          onUpdateItem={updateItem}
          onRemoveItem={async (item) => {
            const snapshot = await removeItem(item.id);
            if (snapshot) toast(`${snapshot.name} fjernet`, () => restoreItem(snapshot));
          }}
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
                disabled={clearing.save && !trimmed(clearing.name)}
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
