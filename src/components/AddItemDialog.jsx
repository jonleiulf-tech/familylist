import { useEffect, useState } from 'react';
import { Dialog } from './Dialog.jsx';
import { searchProducts } from '../lib/kassal.js';
import { kr, unitPrice } from '../lib/format.js';
import { guessUnit, isPackUnit, packSizeFor } from '../lib/catalog.js';
import { UnitSelect } from './UnitSelect.jsx';
import { convertQty, parseQty } from '../lib/units.js';
import { habitQty } from '../lib/priceLearning.js';
import { Minus, Plus } from 'lucide-react';

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

export function AddItemDialog({ entry, stores, defaultStore, habit = null, onClose, onAdd }) {
  const [store, setStore] = useState('');           // tomt = alle butikker
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('Søker i Kassalapp …');
  const [busy, setBusy] = useState(false);

  const variants = variantsFor(entry.name, entry.avg_price);
  const [variant, setVariant] = useState(variants[0] ?? null);

  // Vanen fra kvitteringene: hvor mye DERE pleier å kjøpe. Piloten la til
  // 1 av alt og traff 46 linjer mot 93 artikler i kassa.
  //
  // Bare varer UTEN størrelsesvalg får vanen. For brus og melk beskriver
  // varianten pakningen — «1-literen» — og en vane på tre liter er noe
  // annet enn en pakningsstørrelse. Å blande de to ville gitt 3 × 1-literen
  // priset som én.
  const habitual = variants.length === 0 ? habitQty(habit) : null;

  // Antall og enhet settes FØR «Legg til». Standarden er den appen ville
  // gjettet selv, så et kjapt trykk gir samme resultat som før — men
  // «2 pakker» eller «1 kg» krever ikke lenger en tur innom redigering
  // etterpå.
  const startUnit = variants[0]?.unit
    ?? (habitual !== null && habit?.unit ? habit.unit : guessUnit(entry.name, entry.major_category));
  const startQty = variants[0]?.qty
    ?? habitual
    ?? (isPackUnit(startUnit) ? (startUnit === 'liter' ? 1 : 400) : 1);
  const [qty, setQty] = useState(String(startQty));
  const [unit, setUnit] = useState(startUnit);

  // Bytter man størrelse, følger antall og enhet med varianten.
  useEffect(() => {
    if (!variant) return;
    setQty(String(variant.qty));
    setUnit(variant.unit);
  }, [variant]);

  const qtyNum = parseQty(qty) ?? 0;
  // Gram og milliliter steppes i grovere hopp enn stykker og pakker.
  const stepBy = qtyNum >= 200 ? 100 : qtyNum >= 20 ? 10 : 1;
  const bump = (dir) => setQty(String(Math.max(
    unit === 'g' || unit === 'ml' ? 10 : 0.25,
    Math.round((qtyNum + dir * stepBy) * 100) / 100,
  )));
  // Varianten gjelder bare så lenge mengden er den varianten beskriver —
  // endrer man tallet, ville variantprisen vært et anslag på noe annet.
  const variantIntact = variant && parseQty(qty) === variant.qty && unit === variant.unit;

  useEffect(() => {
    let active = true;
    setStatus('Søker i Kassalapp …');
    searchProducts(entry.name, store, 8, entry.avg_price).then(({ products, error }) => {
      if (!active) return;
      setResults(products);
      setStatus(error);
    });
    return () => { active = false; };
  }, [entry.name, store, entry.avg_price]);

  const addLocal = async () => {
    setBusy(true);
    const n = parseQty(qty) ?? 1;
    await onAdd(n, {
      unit,
      // Pakningen er en EGENSKAP ved varen, ikke antallet du vil ha. Satt
      // lik mengden delte purchases() mengden på seg selv: «3 liter
      // fløte» ble ett innkjøp og priset som én kartong, «2 kg poteter»
      // ble tolket som 2 GRAM per pakke og ga fem innkjøp.
      pack_size: packSizeFor(entry.name, unit, entry),
      ...(variantIntact ? {
        variant: variant.label,
        price: entry.avg_price ? Number((entry.avg_price * variant.factor).toFixed(2)) : null,
        price_source: entry.avg_price ? 'receipt' : null,
      } : {}),
    });
  };

  const addKassal = async (p) => {
    setBusy(true);
    const unit = p.weight_unit || 'stk';
    // Kassalapp oppgir vekten i gram/liter for pakningen. Den er en ekte
    // pakningsstørrelse og skal brukes som det.
    const packed = p.weight && isPackUnit(unit) ? Number(p.weight) : null;
    await onAdd(packed ?? 1, {
      unit,
      pack_size: packed ?? packSizeFor(p.name, unit, null),
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
        {/* Prisen er det man faktisk sammenligner på — den får tallvekt. */}
        <div className="tnum" style={{ marginTop: 4 }}>
          <span style={{
            fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20,
            letterSpacing: '-0.01em', lineHeight: 1.1,
          }}>
            {entry.avg_price ? kr(entry.avg_price) : '—'}
          </span>
          <span className="text-muted" style={{ fontSize: 12, marginLeft: 6 }}>
            {entry.avg_price ? 'snitt' : 'ingen pris registrert ennå'}
          </span>
        </div>
        {Boolean(entry.primary_store || (entry.avg_price && entry.price_low && entry.price_high)) && (
          <div className="card-meta tnum" style={{ marginTop: 3 }}>
            {[
              entry.avg_price && entry.price_low && entry.price_high
                ? `${kr(entry.price_low)}–${kr(entry.price_high)}` : null,
              entry.primary_store ? `oftest ${entry.primary_store}` : null,
            ].filter(Boolean).join(' · ')}
          </div>
        )}

        {variants.length > 0 && (
          <label className="field" style={{ marginTop: 'var(--space-3)', marginBottom: 0 }}>
            <span className="field-label">Størrelse</span>
            <select
              className="input"
              style={{ minHeight: 44 }}
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

        <div style={{ marginTop: 'var(--space-3)' }}>
          <span className="field-label">Antall og enhet</span>
          <div className="row" style={{ gap: 6, marginTop: 4 }}>
            <button
              type="button"
              className="btn btn-icon"
              aria-label="Mindre"
              onClick={() => bump(-1)}
              style={{ flex: 'none' }}
            >
              <Minus size={15} />
            </button>
            <input
              className="input"
              style={{ width: 66, flex: 'none', textAlign: 'center', padding: '8px 4px' }}
              inputMode="decimal"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              aria-label="Antall"
            />
            <button
              type="button"
              className="btn btn-icon"
              aria-label="Mer"
              onClick={() => bump(1)}
              style={{ flex: 'none' }}
            >
              <Plus size={15} />
            </button>
            <UnitSelect
              value={unit}
              onChange={(u) => {
                const { qty: next } = convertQty(qty, unit, u);
                setUnit(u);
                if (next !== null) setQty(String(next));
              }}
              style={{ flex: 1, width: 'auto' }}
            />
          </div>
          {/* Sier HVOR tallet kommer fra. Et forvalg uten forklaring ser ut
              som en påstand om hva du bør kjøpe; dette er en observasjon av
              hva dere har kjøpt. */}
          {habitual !== null && (
            <p className="text-muted tnum" style={{ fontSize: 11.5, marginTop: 6, marginBottom: 0 }}>
              Slik dere pleier: {habitual} {habit.unit ?? 'stk'} — fra{' '}
              {habit.times_bought ?? 1} {habit.times_bought === 1 ? 'kvittering' : 'kvitteringer'}
            </p>
          )}
        </div>

        <button
          type="button"
          className="btn btn-primary btn-block"
          style={{ marginTop: 'var(--space-3)', minHeight: 50 }}
          onClick={addLocal}
          disabled={busy || !parseQty(qty)}
        >
          Legg til {parseQty(qty) ? `${parseQty(qty)} ${unit}` : ''}
        </button>
      </div>

      {/* Kassalapp-treff */}
      <div className="row-between" style={{ marginBottom: 'var(--space-2)' }}>
        <span className="section-title" style={{ fontSize: 16 }}>Priser fra Kassalapp</span>
        {results.length > 0 && (
          <span className="text-muted tnum" style={{ fontSize: 11.5 }}>
            {results.length} treff
          </span>
        )}
      </div>
      <label className="field">
        <span className="field-label">Butikk</span>
        <select
          className="input"
          style={{ minHeight: 44 }}
          value={store}
          onChange={(e) => setStore(e.target.value)}
        >
          {/* Butikkfilter gir ofte 0 treff, derfor er «alle» forvalgt. */}
          <option value="">Alle butikker</option>
          {stores.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
        </select>
      </label>

      {status && (
        <p className="text-muted" style={{ fontSize: 12.5, padding: 'var(--space-2) 0' }}>{status}</p>
      )}

      <div className="stack" style={{ gap: 0 }}>
        {results.map((p) => (
          <div
            key={p.kassal_product_id}
            className="item-row"
            style={{ paddingLeft: 0, paddingRight: 0, minHeight: 60, alignItems: 'center' }}
          >
            <div className="item-mid">
              <div className="item-name">{p.name}</div>
              {/* Pris rett under navnet: det er den man skanner nedover. */}
              <div className="tnum" style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>
                {p.current_price ? kr(p.current_price) : '—'}
                {p.current_unit_price ? (
                  <span className="text-muted" style={{ fontWeight: 500 }}>
                    {' · '}{kr(p.current_unit_price)} pr. enhet
                  </span>
                ) : null}
              </div>
              <div className="item-sub">
                {[p.brand, p.store, p.ean].filter(Boolean).join(' · ')}
              </div>
            </div>
            <button
              type="button"
              className="btn"
              style={{ minHeight: 44, minWidth: 64, flexShrink: 0 }}
              onClick={() => addKassal(p)}
              disabled={busy}
            >
              Velg
            </button>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
