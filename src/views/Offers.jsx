import { lazy, Suspense, useMemo, useState } from 'react';
import { Sparkles, Plus, Search, ClipboardPaste, Tag, ScanLine } from 'lucide-react';
import { OfferCard } from '../components/OfferCard.jsx';
// Avis-skanneren (kamera/PDF + Claude) lastes først når den åpnes.
const FlyerScanDialog = lazy(() =>
  import('../components/FlyerScanDialog.jsx').then((m) => ({ default: m.FlyerScanDialog })));
import { kr } from '../lib/format.js';
import {
  rankOffers, reasonText, discountPercent,
  loadOfferPrefs, saveOfferPrefs, STORE_CODES,
} from '../lib/offers.js';
import { resolveCatalogItem } from '../lib/catalog.js';
import { OfferMeals } from '../components/OfferMeals.jsx';

/** «2 dager igjen» — gyldighet folk faktisk forstår. */
function daysLeft(validTo) {
  if (!validTo) return null;
  const diff = Math.ceil((new Date(`${validTo}T23:59:59`) - Date.now()) / 864e5);
  if (diff < 0) return null;
  if (diff === 0) return 'siste dag';
  return diff === 1 ? '1 dag igjen' : `${diff} dager igjen`;
}

/**
 * Tilbud — bygget rundt to spørsmål: «hva angår OSS?» og «hva er ekte?».
 *
 * Øverst: Utvalgt for dere — rangert etter familiens handlemønster
 * (kjøpsfrekvens fra kvitteringene, ukens middagsplan, faste varer,
 * under deres vanlige pris), med grunnene synlige på kortet.
 * Under: alle gyldige tilbud som kortgrid med butikkfilter og søk.
 * Eksempeltilbud sies fra om med én tydelig banner — aldri i det stille.
 */
export function Offers({
  offers, stores, catalog, normRules, shopItems, plannedIngredients, itemTags, defaultStore,
  meals = [], onManualImport, onAddToList, onAddRows, toast,
}) {
  const [filter, setFilter] = useState('');
  const [storeFilter, setStoreFilter] = useState(null);   // null = alle butikker
  const [showImport, setShowImport] = useState(false);
  const [showScan, setShowScan] = useState(false);
  const [text, setText] = useState('');
  const [store, setStore] = useState('JOKER');
  const [viewing, setViewing] = useState(null);
  const [prefs, setPrefs] = useState(loadOfferPrefs);

  const ctx = useMemo(() => ({
    catalog,
    shopItems,
    plannedIngredients,
    staples: itemTags.staples,
    dairyFree: itemTags.dairyFree,
    defaultStoreCode: STORE_CODES[defaultStore] ?? 'COOP_EXTRA',
  }), [catalog, shopItems, plannedIngredients, itemTags, defaultStore]);

  const relevant = useMemo(() => rankOffers(offers, ctx, prefs), [offers, ctx, prefs]);

  const today = new Date().toISOString().slice(0, 10);
  const valid = useMemo(
    () => offers.filter((o) => !o.valid_to || o.valid_to >= today),
    [offers, today],
  );
  const allSamples = valid.length > 0 && valid.every((o) => o.is_sample);
  const hasReal = valid.some((o) => !o.is_sample);

  // Butikkfilter bygges av tilbudene som faktisk finnes.
  const storeChips = useMemo(() => {
    const counts = new Map();
    valid.forEach((o) => counts.set(o.store_name, (counts.get(o.store_name) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [valid]);

  const shown = useMemo(() => {
    let rows = valid;
    if (storeFilter) rows = rows.filter((o) => o.store_name === storeFilter);
    const q = filter.trim().toLowerCase();
    if (q) {
      rows = rows.filter((o) =>
        `${o.product_name} ${o.brand ?? ''} ${o.match_name ?? ''}`.toLowerCase().includes(q));
      // Ved søk er billigst pr. liter/kilo det interessante.
      rows = [...rows].sort((a, b) => (a.unit_price ?? Infinity) - (b.unit_price ?? Infinity));
    } else {
      // Ellers: størst rabatt først — det er dét man blar etter.
      rows = [...rows].sort((a, b) => discountPercent(b) - discountPercent(a));
    }
    return rows;
  }, [valid, filter, storeFilter]);

  const hide = (offer, mode) => {
    const next = { ...prefs, [offer.id]: mode };
    setPrefs(next);
    saveOfferPrefs(next);
    toast(mode === 'not_relevant' ? 'Merket som ikke relevant' : 'Skjult til neste uke');
  };

  const importManual = async () => {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const rows = lines.map((line) => {
      // «Norvegia 1kg 89,90» — siste tall på linja er prisen.
      const m = line.match(/^(.*?)[\s]+(\d+[.,]?\d*)\s*$/);
      if (!m) return null;
      const { name: matched, item } = resolveCatalogItem(m[1].trim(), catalog, normRules);
      return {
        product_name: m[1].trim(),
        match_name: item ? matched : m[1].trim(),
        category: item?.major_category ?? null,
        price: Number(m[2].replace(',', '.')),
        store_code: store,
        store_name: stores.find((s) => s.code === store)?.name ?? store,
        source: 'Manuell import',
        source_type: 'manual_import',
        valid_to: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10),
      };
    }).filter(Boolean);

    if (!rows.length) { toast('Fant ingen linjer på formen «navn pris».'); return; }
    await onManualImport(rows);
    setText('');
    setShowImport(false);
    toast(`Importerte ${rows.length} tilbud`);
  };

  /** −%‑merket øverst i hjørnet på kortene. */
  const DiscountBadge = ({ offer }) => {
    const d = discountPercent(offer);
    if (d <= 0) return null;
    return (
      <span className="tnum" style={{
        position: 'absolute', top: 10, right: 10,
        background: 'var(--color-accent)', color: 'var(--color-text-inverse)',
        fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 12,
        borderRadius: 'var(--radius-full)', padding: '3px 9px', letterSpacing: '-0.01em',
        boxShadow: 'var(--shadow-sm)',
      }}>
        −{d} %
      </span>
    );
  };

  return (
    <div>
      {/* ---------- Topp ---------- */}
      <div style={{ padding: 'var(--space-4) var(--space-4) 0' }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Ukens tilbud</h1>
        <p className="text-muted" style={{ fontSize: 13, margin: '4px 0 0' }}>
          Plukket ut etter familiens handlemønster — kvitteringer, middagsplan og faste varer.
        </p>
      </div>

      {/* Ærlighetsbanner: alt her er eksempler til de ekte kildene er på. */}
      {allSamples && (
        <div style={{ padding: 'var(--space-3) var(--space-4) 0' }}>
          <div style={{
            border: '1px solid var(--color-divider)', borderLeft: '3px solid var(--color-honey)',
            borderRadius: 'var(--radius)',
            background: 'var(--color-honey-100)', padding: '10px 14px', fontSize: 12.5, lineHeight: 1.5,
          }}>
            <strong>Dette er eksempeltilbud.</strong> Ekte kundeaviser (Joker,
            SPAR, MENY …) kobles på så snart eTilbudsavis-nøkkelen er godkjent,
            og Kassalapp-prisskannet legger inn ekte prisfall når det står på
            timeplan. Alt under fungerer likt når de ekte tilbudene strømmer inn.
          </div>
        </div>
      )}

      {/* ---------- Billig middag akkurat nå ---------- */}
      <OfferMeals
        meals={meals}
        offers={valid}
        onPick={onAddRows ? (s) => onAddRows(s.meal) : undefined}
      />

      {/* ---------- Utvalgt for dere ---------- */}
      <div className="section-head" style={{ paddingBottom: 4 }}>
        <span className="section-title">
          <Sparkles size={13} style={{ verticalAlign: -2, color: 'var(--color-accent)' }} /> Utvalgt for dere
        </span>
        <span className="text-muted" style={{ fontSize: 11 }}>{relevant.length}</span>
      </div>

      {relevant.length === 0 && (
        <p className="text-muted" style={{ padding: '0 var(--space-4) var(--space-2)', fontSize: 13 }}>
          Ingen tilbud treffer handlemønsteret deres akkurat nå — alle tilbudene
          ligger under. Jo flere kvitteringer dere fullfører, desto bedre treffer vi.
        </p>
      )}

      <div className="stack" style={{ gap: 10, padding: '4px var(--space-4) var(--space-2)' }}>
        {relevant.slice(0, 6).map(({ offer, reasons, onList }) => (
          <div
            key={offer.id}
            style={{
              position: 'relative', background: 'var(--color-surface)',
              border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-sm)', padding: '14px 16px',
            }}
          >
            <DiscountBadge offer={offer} />
            <button
              type="button"
              onClick={() => setViewing(offer)}
              style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', color: 'inherit', width: '100%' }}
            >
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 16, letterSpacing: '-0.015em', paddingRight: 60 }}>
                {offer.product_name}
                {offer.is_sample && <span className="tag tag-outline" style={{ marginLeft: 6, fontSize: 9, verticalAlign: 2 }}>eksempel</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
                <span className="tnum" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 24, color: 'var(--color-accent)', letterSpacing: '-0.02em' }}>
                  {kr(offer.price)}
                </span>
                {offer.original_price && <s className="text-muted tnum" style={{ fontSize: 13 }}>{kr(offer.original_price)}</s>}
                <span className="text-muted" style={{ fontSize: 12, marginLeft: 'auto' }}>
                  {offer.store_name}{daysLeft(offer.valid_to) ? ` · ${daysLeft(offer.valid_to)}` : ''}
                </span>
              </div>
              {reasons.length > 0 && (
                <div style={{ fontSize: 12, marginTop: 6, color: 'var(--color-text)' }}>
                  <Sparkles size={11} style={{ verticalAlign: -1, color: 'var(--color-accent)' }} /> {reasonText(reasons)}
                </div>
              )}
              {onList && (
                <div style={{ fontSize: 12, marginTop: 4, color: 'var(--color-accent)' }}>
                  Ligger allerede på listen ({onList.qty} {onList.unit})
                </div>
              )}
            </button>
            <div className="row" style={{ gap: 6, marginTop: 10 }}>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => onAddToList(offer)}>
                <Plus size={13} /> Legg til
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => hide(offer, 'later')}>Ikke nå</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => hide(offer, 'not_relevant')}>
                Aldri denne
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ---------- Alle tilbud ---------- */}
      <hr className="divider" style={{ marginTop: 'var(--space-3)' }} />
      <div className="section-head">
        <span className="section-title">
          {filter.trim() ? `Tilbud på «${filter.trim()}»` : 'Alle tilbud'}
        </span>
        <span className="text-muted" style={{ fontSize: 11 }}>{shown.length}</span>
      </div>

      <div style={{ padding: '0 var(--space-4) var(--space-3)' }}>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input
            className="input"
            style={{ paddingLeft: 34 }}
            placeholder="Søk — f.eks. kjøttdeig, ost …"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Søk i tilbud"
          />
        </div>
        {filter.trim() && (
          <div className="text-muted" style={{ fontSize: 11, marginTop: 6 }}>
            Sortert på enhetspris — billigst først.
          </div>
        )}
        {storeChips.length > 1 && (
          <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            <button
              type="button"
              className={`tag tag-button ${storeFilter === null ? 'tag-accent' : 'tag-outline'}`}
              onClick={() => setStoreFilter(null)}
            >
              Alle butikker
            </button>
            {storeChips.map(([name, count]) => (
              <button
                key={name}
                type="button"
                className={`tag tag-button ${storeFilter === name ? 'tag-accent' : 'tag-outline'}`}
                aria-pressed={storeFilter === name}
                onClick={() => setStoreFilter(storeFilter === name ? null : name)}
              >
                {name} ({count})
              </button>
            ))}
          </div>
        )}
      </div>

      {shown.length === 0 && (
        <p className="text-muted" style={{ padding: '0 var(--space-4)', fontSize: 13 }}>
          Ingen tilbud her akkurat nå — prøv en annen butikk, eller lim inn fra
          en kundeavis under.
        </p>
      )}

      {/* Kortgrid — to i bredden, som en kundeavis */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
        padding: '0 var(--space-4) var(--space-3)',
      }}>
        {shown.map((o) => (
          <div
            key={o.id}
            style={{
              position: 'relative', background: 'var(--color-surface)',
              border: '1px solid var(--color-divider)', borderRadius: 'var(--radius)',
              boxShadow: 'var(--shadow-sm)', padding: '12px 12px 10px',
              display: 'flex', flexDirection: 'column',
            }}
          >
            <DiscountBadge offer={o} />
            <button
              type="button"
              onClick={() => setViewing(o)}
              style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', color: 'inherit', flex: 1 }}
            >
              <div style={{
                fontFamily: 'var(--font-heading)', fontSize: 14, fontWeight: 700,
                letterSpacing: '-0.01em', lineHeight: 1.25, paddingRight: 44,
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                minHeight: 34,
              }}>
                {o.product_name}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                <span className="tnum" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 19, color: 'var(--color-accent)', letterSpacing: '-0.02em' }}>
                  {kr(o.price)}
                </span>
                {o.original_price && <s className="text-muted tnum" style={{ fontSize: 11 }}>{kr(o.original_price)}</s>}
              </div>
              <div className="text-muted" style={{ fontSize: 10.5, marginTop: 2 }}>
                {o.store_name}
                {daysLeft(o.valid_to) ? ` · ${daysLeft(o.valid_to)}` : ''}
                {o.is_sample ? ' · eksempel' : ''}
              </div>
            </button>
            <button
              type="button"
              className="btn btn-sm btn-block"
              style={{ marginTop: 8 }}
              onClick={() => onAddToList(o)}
            >
              <Plus size={13} /> Legg til
            </button>
          </div>
        ))}
      </div>

      {/* ---------- Skann eller lim inn ---------- */}
      <div style={{ padding: '0 var(--space-4) var(--space-3)' }}>
        <button
          type="button"
          className="btn btn-secondary btn-block"
          style={{ marginBottom: 8 }}
          onClick={() => setShowScan(true)}
        >
          <ScanLine size={15} /> Skann en kundeavis-side (KI leser prisene)
        </button>
        <button type="button" className="btn btn-block" onClick={() => setShowImport((v) => !v)}>
          <ClipboardPaste size={15} /> {showImport ? 'Skjul import' : 'Lim inn tilbud fra en kundeavis'}
        </button>
        {showImport && (
          <div style={{ marginTop: 'var(--space-3)' }}>
            <label className="field">
              <span className="field-label">Butikk</span>
              <select className="input" value={store} onChange={(e) => setStore(e.target.value)}>
                {stores.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
              </select>
            </label>
            <label className="field" style={{ marginTop: 'var(--space-3)' }}>
              <span className="field-label">Én vare per linje: «navn pris»</span>
              <textarea
                className="input"
                rows={4}
                placeholder={'Norvegia 1kg 89\nKjøttdeig 400g 39,90'}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </label>
            <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 'var(--space-3)' }} onClick={importManual} disabled={!text.trim()}>
              Importer tilbud
            </button>
          </div>
        )}
      </div>

      {/* ---------- Kildestatus ---------- */}
      <hr className="divider" />
      <div className="section-head"><span className="section-title"><Tag size={12} style={{ verticalAlign: -1 }} /> Hvor kommer tilbudene fra?</span></div>
      <div className="stack" style={{ gap: 8, padding: '0 var(--space-4) var(--space-5)' }}>
        {[
          {
            on: valid.some((o) => o.source_type === 'web_page'),
            name: 'Butikkenes tilbudssider',
            desc: 'Kjedene viser i dag prisene bare via apper uten lesbar side — avventes til de ev. åpner opp.',
          },
          {
            on: hasReal,
            name: 'Kassalapp-prisskann',
            desc: hasReal
              ? 'Aktiv — finner varer under deres vanlige pris, daglig.'
              : 'Klar — finner varer under deres vanlige pris når skannet står på timeplan.',
          },
          {
            on: valid.some((o) => o.source_type === 'flyer_scan'),
            name: 'Kundeavis-skann (KI)',
            desc: 'Ta bilde av en avis-side med knappen over — Claude leser varene og prisene.',
          },
          {
            on: false,
            name: 'eTilbudsavis (kundeavisene)',
            desc: 'Venter på API-nøkkel — gir ekte ukesaviser fra Joker, SPAR, MENY m.fl.',
          },
          {
            on: true,
            name: 'Manuell import',
            desc: 'Lim inn fra en papiravis eller app over — kobles automatisk mot varedatabasen.',
          },
        ].map((s) => (
          <div key={s.name} className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
            <span style={{
              width: 8, height: 8, borderRadius: 'var(--radius-full)', marginTop: 5, flexShrink: 0,
              background: s.on ? 'var(--color-success)' : 'var(--color-bg-sunken)',
              border: s.on ? 'none' : '1px solid var(--color-divider-strong)',
              boxShadow: s.on ? '0 0 0 3px var(--color-herb-100)' : 'none',
            }} />
            <div style={{ fontSize: 12.5, lineHeight: 1.45 }}>
              <strong>{s.name}</strong> — <span className="text-muted">{s.desc}</span>
            </div>
          </div>
        ))}
      </div>

      {showScan && (
        <Suspense fallback={null}>
          <FlyerScanDialog
            stores={stores}
            catalog={catalog}
            normRules={normRules}
            defaultStore={defaultStore}
            onImport={onManualImport}
            onClose={() => setShowScan(false)}
            toast={toast}
          />
        </Suspense>
      )}

      {viewing && (
        <OfferCard
          offer={viewing}
          onClose={() => setViewing(null)}
          onAdd={async () => { await onAddToList(viewing); setViewing(null); }}
        />
      )}
    </div>
  );
}
