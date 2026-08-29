import { useMemo, useState } from 'react';
import { OfferCard } from '../components/OfferCard.jsx';
import { kr } from '../lib/format.js';
import {
  rankOffers, reasonText, discountPercent,
  loadOfferPrefs, saveOfferPrefs, STORE_CODES,
} from '../lib/offers.js';
import { resolveCatalogItem } from '../lib/catalog.js';

/**
 * Tilbud.
 * Øverst: de relevante — rangert etter hvor mye tilbudet angår denne familien.
 * Under: alle gyldige tilbud, med fritekstfilter og smartfilter-chips.
 * Nederst: manuell import for aviser som ikke kan leses automatisk.
 */
export function Offers({
  offers, stores, catalog, normRules, shopItems, plannedIngredients, itemTags, defaultStore,
  onManualImport, onAddToList, toast,
}) {
  const [filter, setFilter] = useState('');
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

  const chips = useMemo(() => {
    const seen = new Map();
    valid.forEach((o) => {
      const key = o.match_name || o.category;
      if (key) seen.set(key, (seen.get(key) ?? 0) + 1);
    });
    return [...seen.keys()].slice(0, 8);
  }, [valid]);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return valid;
    const rows = valid.filter((o) =>
      `${o.product_name} ${o.brand ?? ''} ${o.match_name ?? ''}`.toLowerCase().includes(q));
    // Når man filtrerer, er billigst pr. liter/kilo det interessante.
    return [...rows].sort((a, b) => (a.unit_price ?? Infinity) - (b.unit_price ?? Infinity));
  }, [valid, filter]);

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
      // Koble mot varedatabasen, så relevans-scoringen og «på listen»-
      // merkingen virker for manuelt importerte tilbud også.
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
    toast(`Importerte ${rows.length} tilbud`);
  };

  return (
    <div>
      {/* ---------- Relevante ---------- */}
      <div className="section-head">
        <span className="section-title">Ukens relevante tilbud</span>
        <span className="text-muted" style={{ fontSize: 11 }}>{relevant.length}</span>
      </div>

      {relevant.length === 0 && (
        <p className="text-muted" style={{ padding: '0 var(--space-4) var(--space-3)', fontSize: 13 }}>
          Ingen av tilbudene treffer handlemønsteret deres denne uken.
          Alle gyldige tilbud ligger lenger ned.
        </p>
      )}

      {relevant.map(({ offer, reasons, onList, discount }) => (
        <div key={offer.id} className="item-row" style={{ alignItems: 'flex-start' }}>
          <button type="button" className="item-mid" onClick={() => setViewing(offer)}>
            <div className="item-name">
              {offer.product_name}
              {offer.is_sample && <span className="tag tag-outline" style={{ marginLeft: 6, fontSize: 9 }}>eksempel</span>}
            </div>
            <div className="item-sub">
              <strong style={{ color: 'var(--color-accent)' }}>{kr(offer.price)}</strong>
              {offer.original_price && <> <s className="text-muted">{kr(offer.original_price)}</s></>}
              {discount > 0 && <> · −{discount} %</>}
              {' · '}{offer.store_name}
            </div>
            {reasons.length > 0 && (
              <div className="item-sub" style={{ color: 'var(--color-text)' }}>
                {reasonText(reasons)}
              </div>
            )}
            {onList && (
              <div className="item-sub" style={{ color: 'var(--color-accent)' }}>
                Ligger allerede på listen ({onList.qty} {onList.unit})
              </div>
            )}
          </button>
          <div className="stack" style={{ gap: 4 }}>
            <button type="button" className="btn btn-sm" onClick={() => onAddToList(offer)}>Legg til</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => hide(offer, 'later')}>Ikke nå</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => hide(offer, 'not_relevant')}>
              Ikke relevant
            </button>
          </div>
        </div>
      ))}

      {/* ---------- Alle tilbud ---------- */}
      <hr className="divider" style={{ marginTop: 'var(--space-4)' }} />
      <div className="section-head">
        <span className="section-title">
          {filter.trim() ? `Tilbud på «${filter.trim()}»` : 'Alle relevante tilbud denne uken'}
        </span>
        <span className="text-muted" style={{ fontSize: 11 }}>{shown.length}</span>
      </div>

      <div style={{ padding: '0 var(--space-4) var(--space-3)' }}>
        <input
          className="input"
          placeholder="Filtrer tilbud …"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Filtrer tilbud"
        />
        {filter.trim() && (
          <div className="text-muted" style={{ fontSize: 11, marginTop: 6 }}>
            Sortert på enhetspris — billigst først.
          </div>
        )}
        {chips.length > 0 && (
          <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {chips.map((c) => (
              <button
                key={c}
                type="button"
                className={`tag tag-button ${filter === c ? 'tag-accent' : 'tag-outline'}`}
                onClick={() => setFilter(filter === c ? '' : c)}
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      {shown.length === 0 && (
        <p className="text-muted" style={{ padding: '0 var(--space-4)', fontSize: 13 }}>
          Ingen gyldige tilbud. Lim inn fra en kundeavis nederst.
        </p>
      )}

      {shown.map((o, idx) => (
        <div key={o.id} className="item-row">
          <button type="button" className="item-mid" onClick={() => setViewing(o)}>
            <div className="item-name">
              {o.product_name}
              {filter.trim() && idx === 0 && (
                <span className="tag tag-accent" style={{ marginLeft: 6, fontSize: 9 }}>Billigst</span>
              )}
            </div>
            <div className="item-sub">
              {o.store_name}
              {o.valid_to ? ` · til ${o.valid_to}` : ''}
              {o.unit_price ? ` · ${kr(o.unit_price)} pr. ${o.unit ?? 'enhet'}` : ''}
            </div>
            <div className="item-sub">
              <strong style={{ color: 'var(--color-accent)' }}>{kr(o.price)}</strong>
              {o.original_price && <> <s className="text-muted">{kr(o.original_price)}</s></>}
            </div>
          </button>
          <button type="button" className="btn btn-sm" onClick={() => onAddToList(o)}>Legg til</button>
        </div>
      ))}

      {/* ---------- Manuell import ---------- */}
      <hr className="divider" style={{ marginTop: 'var(--space-4)' }} />
      <div className="section-head"><span className="section-title">Manuell import</span></div>
      <div style={{ padding: '0 var(--space-4) var(--space-4)' }}>
        <label className="field">
          <span className="field-label">Butikk</span>
          <select className="input" value={store} onChange={(e) => setStore(e.target.value)}>
            {stores.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Én vare per linje: «navn pris»</span>
          <textarea
            className="input"
            rows={4}
            placeholder={'Norvegia 1kg 89\nKjøttdeig 400g 39,90'}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <button type="button" className="btn btn-block" onClick={importManual} disabled={!text.trim()}>
          Importer tilbud
        </button>
      </div>

      {/* ---------- Kilder ---------- */}
      <hr className="divider" />
      <div className="section-head"><span className="section-title">Tilbudskilder</span></div>
      <div style={{ padding: '0 var(--space-4) var(--space-5)' }}>
        <table className="table">
          <tbody>
            <tr><td>Kassalapp API</td><td className="text-muted">prisfall mot deres snittpriser — daglig scan</td></tr>
            <tr><td>eTilbudsavis</td><td className="text-muted">Joker, Spar, Meny m.fl. — venter på API-nøkkel</td></tr>
            <tr><td>Manuell import</td><td className="text-muted">lim inn fra kundeaviser over</td></tr>
          </tbody>
        </table>
      </div>

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
