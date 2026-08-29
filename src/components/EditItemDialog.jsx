import { useEffect, useState } from 'react';
import { Dialog } from './Dialog.jsx';
import { searchProducts } from '../lib/kassal.js';
import { lookupFood } from '../lib/matvare.js';
import { kr } from '../lib/format.js';

const UNITS = ['stk', 'g', 'kg', 'ml', 'liter', 'pakke', 'boks'];

export function EditItemDialog({ item, stores, onClose, onSave, onDelete }) {
  const [qty, setQty] = useState(String(item.qty ?? 1));
  const [unit, setUnit] = useState(item.unit ?? 'stk');
  const [store, setStore] = useState(item.store ?? '');
  const [price, setPrice] = useState(item.price != null ? String(item.price) : '');
  const [variant, setVariant] = useState(item.variant ?? '');

  const [kassal, setKassal] = useState(null);
  const [kassalStatus, setKassalStatus] = useState(null);
  const [nutrition, setNutrition] = useState(null);

  // Næringsinfo fra Matvaretabellen (åpent API, kalles direkte fra klienten)
  useEffect(() => {
    let active = true;
    lookupFood(item.name).then((n) => { if (active) setNutrition(n); });
    return () => { active = false; };
  }, [item.name]);

  const findPrice = async () => {
    setKassalStatus('Søker …');
    const { products, error } = await searchProducts(item.name, store, 5);
    setKassal(products);
    setKassalStatus(error);
  };

  const save = () => {
    const parsedQty = Number(String(qty).replace(',', '.'));
    const parsedPrice = price === '' ? null : Number(String(price).replace(',', '.'));
    onSave({
      qty: Number.isFinite(parsedQty) && parsedQty > 0 ? parsedQty : 1,
      unit,
      store: store || null,
      variant: variant || null,
      price: Number.isFinite(parsedPrice) ? parsedPrice : null,
      // Manuelt redigert pris er ikke lenger en Kassalapp-pris.
      price_source: parsedPrice == null
        ? null
        : (parsedPrice === Number(item.price) ? item.price_source : 'manual'),
    });
  };

  return (
    <Dialog
      title={item.name}
      subtitle={item.kassal_name || undefined}
      onClose={onClose}
      footer={
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={save}>Lagre</button>
          <button type="button" className="btn" onClick={onDelete}>Slett</button>
        </div>
      }
    >
      <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
        <label className="field" style={{ flex: 1 }}>
          <span className="field-label">Antall</span>
          <input className="input" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
        </label>
        <label className="field" style={{ flex: 1 }}>
          <span className="field-label">Enhet</span>
          <select className="input" value={unit} onChange={(e) => setUnit(e.target.value)}>
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
      </div>

      <label className="field">
        <span className="field-label">Butikk</span>
        <select className="input" value={store} onChange={(e) => setStore(e.target.value)}>
          <option value="">Ikke valgt</option>
          {stores.map((s) => <option key={s.code} value={s.name}>{s.name}</option>)}
        </select>
      </label>

      <label className="field">
        <span className="field-label">Størrelse / variant</span>
        <input className="input" value={variant} placeholder="f.eks. 4×1,5 l"
               onChange={(e) => setVariant(e.target.value)} />
      </label>

      <label className="field">
        <span className="field-label">Pris (kr)</span>
        <input className="input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        {item.price_source && (
          <span className="text-muted" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
            Kilde: {item.price_source}
          </span>
        )}
      </label>

      <button type="button" className="btn btn-block" onClick={findPrice}>Finn pris i Kassalapp</button>
      {kassalStatus && <p className="text-muted" style={{ fontSize: 12 }}>{kassalStatus}</p>}
      {kassal?.map((p) => (
        <div key={p.kassal_product_id} className="item-row" style={{ paddingLeft: 0, paddingRight: 0 }}>
          <div className="item-mid">
            <div className="item-name">{p.name}</div>
            <div className="item-sub">{[p.brand, p.store].filter(Boolean).join(' · ')} · {kr(p.current_price)}</div>
          </div>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => { setPrice(String(p.current_price)); setKassal(null); }}
          >
            Bruk
          </button>
        </div>
      ))}

      {nutrition && (
        <div className="card" style={{ marginTop: 'var(--space-4)' }}>
          <div className="card-kicker">Næringsinnhold pr. 100 g</div>
          <div className="card-title" style={{ fontSize: 14 }}>{nutrition.name}</div>
          <table className="table" style={{ marginTop: 8 }}>
            <tbody>
              {nutrition.kcal != null && <tr><td>Energi</td><td>{nutrition.kcal} kcal</td></tr>}
              {nutrition.protein != null && <tr><td>Protein</td><td>{nutrition.protein} g</td></tr>}
              {nutrition.fat != null && <tr><td>Fett</td><td>{nutrition.fat} g</td></tr>}
              {nutrition.carbs != null && <tr><td>Karbohydrat</td><td>{nutrition.carbs} g</td></tr>}
              {nutrition.fiber != null && <tr><td>Fiber</td><td>{nutrition.fiber} g</td></tr>}
            </tbody>
          </table>
          <div className="card-meta">Kilde: {nutrition.source}</div>
        </div>
      )}
    </Dialog>
  );
}
