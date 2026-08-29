import { useMemo, useState } from 'react';
import { kr } from '../lib/format.js';

/**
 * Tilbud. Fylles normalt av bakgrunnsjobben weeklyOfferScan(); inntil den
 * finnes kan tilbud limes inn manuelt («navn pris» pr. linje).
 */
export function Offers({ offers, stores, onManualImport, onAddToList, toast }) {
  const [filter, setFilter] = useState('');
  const [text, setText] = useState('');
  const [store, setStore] = useState(stores[0]?.code ?? '');

  // Smartfilter-chips fra de vanligste varegruppene i tilbudene
  const chips = useMemo(() => {
    const seen = new Map();
    offers.forEach((o) => {
      const key = o.match_name || o.category;
      if (key) seen.set(key, (seen.get(key) ?? 0) + 1);
    });
    return [...seen.keys()].slice(0, 8);
  }, [offers]);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const rows = q
      ? offers.filter((o) => `${o.product_name} ${o.brand ?? ''} ${o.match_name ?? ''}`.toLowerCase().includes(q))
      : offers;
    // Ved filtrering sorteres det på enhetspris — billigst per liter/kilo øverst.
    return q
      ? [...rows].sort((a, b) => (a.unit_price ?? Infinity) - (b.unit_price ?? Infinity))
      : rows;
  }, [offers, filter]);

  const importManual = async () => {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const rows = lines.map((line) => {
      // «Norvegia 1kg 89,90» — siste tall på linja er prisen.
      const m = line.match(/^(.*?)[\s]+(\d+[.,]?\d*)\s*$/);
      if (!m) return null;
      return {
        product_name: m[1].trim(),
        price: Number(m[2].replace(',', '.')),
        store_code: store,
        store_name: stores.find((s) => s.code === store)?.name ?? store,
        source: 'Manuell import',
        source_type: 'manual_import',
      };
    }).filter(Boolean);

    if (!rows.length) { toast('Fant ingen linjer på formen «navn pris».'); return; }
    await onManualImport(rows);
    setText('');
    toast(`Importerte ${rows.length} tilbud`);
  };

  return (
    <div>
      <div className="section-head"><span className="section-title">Ukens tilbud</span></div>

      <div style={{ padding: '0 var(--space-4) var(--space-3)' }}>
        <input
          className="input"
          placeholder="Filtrer tilbud …"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
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
          Ingen tilbud registrert. Lim inn fra en kundeavis nederst.
        </p>
      )}

      {shown.map((o) => (
        <div key={o.id} className="item-row">
          <div className="item-mid">
            <div className="item-name">{o.product_name}</div>
            <div className="item-sub">
              {o.store_name}
              {o.valid_to ? ` · til ${o.valid_to}` : ''}
              {o.unit_price ? ` · ${kr(o.unit_price)} pr. ${o.unit ?? 'enhet'}` : ''}
            </div>
            <div className="item-sub">
              <strong style={{ color: 'var(--color-accent)' }}>{kr(o.price)}</strong>
              {o.original_price && <> <s className="text-muted">{kr(o.original_price)}</s></>}
              {o.discount_percentage && <> · −{Math.round(o.discount_percentage)} %</>}
            </div>
          </div>
          <div className="stack" style={{ gap: 4 }}>
            <button type="button" className="btn btn-sm" onClick={() => onAddToList(o)}>Legg til</button>
            {o.source_url && (
              <a className="btn btn-ghost btn-sm" href={o.source_url} target="_blank" rel="noreferrer noopener">
                Se tilbudet ↗
              </a>
            )}
          </div>
        </div>
      ))}

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
    </div>
  );
}
