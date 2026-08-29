import { useEffect, useState } from 'react';
import { Dialog } from './Dialog.jsx';
import { searchProducts } from '../lib/kassal.js';
import { kr, unitPrice } from '../lib/format.js';
import { guessUnit, isPackUnit } from '../lib/catalog.js';

/**
 * «Legg til»-dialogen.
 * Øverst den lokale varen fra egen historikk (med størrelsesvalg der det
 * er relevant), under treff fra Kassalapp med pris, enhetspris og butikkvelger.
 */

/** Størrelsesvarianter for varer som typisk kjøpes i flere pakningsstørrelser. */
function variantsFor(name, avgPrice) {
  const n = (name || '').toLowerCase();
  if (!avgPrice) return [];
  if (/brus|cola|mineralvann|kullsyre/.test(n)) {
    return [
      { label: '1,5 l', qty: 1.5, unit: 'liter', factor: 1 },
      { label: '4×1,5 l', qty: 6, unit: 'liter', factor: 3.8 },
      { label: '0,5 l', qty: 0.5, unit: 'liter', factor: 0.45 },
    ];
  }
  if (/melk|juice|saft/.test(n)) {
    return [
      { label: '1 l', qty: 1, unit: 'liter', factor: 1 },
      { label: '1,75 l', qty: 1.75, unit: 'liter', factor: 1.6 },
    ];
  }
  if (/øl/.test(n)) {
    return [
      { label: '0,5 l', qty: 0.5, unit: 'liter', factor: 1 },
      { label: '6-pk', qty: 3, unit: 'liter', factor: 5.5 },
    ];
  }
  return [];
}

export function AddItemDialog({ entry, stores, defaultStore, onClose, onAdd }) {
  const [store, setStore] = useState('');           // tomt = alle butikker
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('Søker i Kassalapp …');
  const [busy, setBusy] = useState(false);

  const variants = variantsFor(entry.name, entry.avg_price);
  const [variant, setVariant] = useState(variants[0] ?? null);

  useEffect(() => {
    let active = true;
    setStatus('Søker i Kassalapp …');
    searchProducts(entry.name, store, 8).then(({ products, error }) => {
      if (!active) return;
      setResults(products);
      setStatus(error);
    });
    return () => { active = false; };
  }, [entry.name, store]);

  const addLocal = async () => {
    setBusy(true);
    if (variant) {
      await onAdd(variant.qty, {
        unit: variant.unit,
        pack_size: variant.qty,
        variant: variant.label,
        price: entry.avg_price ? Number((entry.avg_price * variant.factor).toFixed(2)) : null,
        price_source: entry.avg_price ? 'receipt' : null,
      });
    } else {
      const unit = guessUnit(entry.name, entry.major_category);
      await onAdd(null, { unit, pack_size: isPackUnit(unit) ? (unit === 'liter' ? 1 : 400) : null });
    }
  };

  const addKassal = async (p) => {
    setBusy(true);
    const unit = p.weight_unit || 'stk';
    await onAdd(p.weight && isPackUnit(unit) ? p.weight : 1, {
      unit,
      pack_size: p.weight && isPackUnit(unit) ? p.weight : null,
      price: p.current_price || null,
      price_source: p.current_price ? 'kassalapp' : null,
      kassal_product_id: p.kassal_product_id,
      ean: p.ean || null,
      brand: p.brand || null,
      kassal_name: p.name,
      store: p.store || store || defaultStore,
    });
  };

  return (
    <Dialog
      title={`Legg til ${entry.name}`}
      subtitle={entry.frequency_sig || undefined}
      onClose={onClose}
    >
      {/* Lokal vare fra egen historikk */}
      <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
        <div className="card-kicker">Fra din historikk</div>
        <div className="card-title">{entry.name}</div>
        <div className="card-body" style={{ marginTop: 6 }}>
          {entry.avg_price
            ? <>ca. {kr(entry.avg_price)} snitt
                {entry.price_low && entry.price_high ? ` (${kr(entry.price_low)}–${kr(entry.price_high)})` : ''}</>
            : 'Ingen pris registrert ennå'}
          {entry.primary_store && <> · oftest {entry.primary_store}</>}
        </div>

        {variants.length > 0 && (
          <label className="field" style={{ marginTop: 'var(--space-3)', marginBottom: 0 }}>
            <span className="field-label">Størrelse</span>
            <select
              className="input"
              value={variant?.label ?? ''}
              onChange={(e) => setVariant(variants.find((v) => v.label === e.target.value))}
            >
              {variants.map((v) => {
                const price = entry.avg_price * v.factor;
                return (
                  <option key={v.label} value={v.label}>
                    {v.label} – ca. {kr(price)} ({unitPrice(price, v.qty, 'l')})
                  </option>
                );
              })}
            </select>
          </label>
        )}

        <button
          type="button"
          className="btn btn-primary btn-block"
          style={{ marginTop: 'var(--space-3)' }}
          onClick={addLocal}
          disabled={busy}
        >
          Legg til
        </button>
      </div>

      {/* Kassalapp-treff */}
      <div className="row-between" style={{ marginBottom: 'var(--space-2)' }}>
        <span className="section-title">Priser fra Kassalapp</span>
      </div>
      <label className="field">
        <span className="field-label">Butikk</span>
        <select className="input" value={store} onChange={(e) => setStore(e.target.value)}>
          {/* Butikkfilter gir ofte 0 treff, derfor er «alle» forvalgt. */}
          <option value="">Alle butikker</option>
          {stores.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
        </select>
      </label>

      {status && <p className="text-muted" style={{ fontSize: 12 }}>{status}</p>}

      <div className="stack" style={{ gap: 0 }}>
        {results.map((p) => (
          <div key={p.kassal_product_id} className="item-row" style={{ paddingLeft: 0, paddingRight: 0 }}>
            <div className="item-mid">
              <div className="item-name">{p.name}</div>
              <div className="item-sub">
                {[p.brand, p.ean, p.store].filter(Boolean).join(' · ')}
              </div>
              <div className="item-sub">
                {p.current_price ? kr(p.current_price) : '—'}
                {p.current_unit_price ? ` · ${kr(p.current_unit_price)} pr. enhet` : ''}
              </div>
            </div>
            <button type="button" className="btn btn-sm" onClick={() => addKassal(p)} disabled={busy}>
              Velg
            </button>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
