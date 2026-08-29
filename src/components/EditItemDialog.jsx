import { useEffect, useState } from 'react';
import { Flag } from 'lucide-react';
import { Dialog } from './Dialog.jsx';
import { searchProducts } from '../lib/kassal.js';
import { lookupFood } from '../lib/matvare.js';
import { kr } from '../lib/format.js';

const UNITS = ['stk', 'g', 'kg', 'ml', 'liter', 'pakke', 'boks'];

const REPORT_TYPES = [
  { value: 'navn', label: 'Feil eller kryptisk navn' },
  { value: 'pris', label: 'Feil pris' },
  { value: 'kategori', label: 'Feil kategori' },
  { value: 'duplikat', label: 'Duplikat av annen vare' },
  { value: 'annet', label: 'Annet' },
];

export function EditItemDialog({ item, stores, onClose, onSave, onDelete, onReport }) {
  const [qty, setQty] = useState(String(item.qty ?? 1));
  const [unit, setUnit] = useState(item.unit ?? 'stk');
  const [store, setStore] = useState(item.store ?? '');
  const [price, setPrice] = useState(item.price != null ? String(item.price) : '');
  const [variant, setVariant] = useState(item.variant ?? '');

  const [kassal, setKassal] = useState(null);
  const [kassalStatus, setKassalStatus] = useState(null);
  const [nutrition, setNutrition] = useState(null);

  // «Meld feil»: null = lukket, ellers { type, suggestion, comment }
  const [report, setReport] = useState(null);
  const [reportState, setReportState] = useState(null);   // 'busy' | 'sent' | feilmelding

  const sendReport = async (e) => {
    e.preventDefault();
    setReportState('busy');
    const err = await onReport({
      item_name: item.name,
      report_type: report.type,
      suggestion: report.suggestion.trim() || null,
      comment: report.comment.trim() || null,
    });
    if (err) setReportState(err);
    else { setReportState('sent'); setReport(null); }
  };

  // Næringsinfo fra Matvaretabellen (åpent API, kalles direkte fra klienten)
  useEffect(() => {
    let active = true;
    lookupFood(item.name).then((n) => { if (active) setNutrition(n); });
    return () => { active = false; };
  }, [item.name]);

  const findPrice = async () => {
    setKassalStatus('Søker …');
    const { products, error } = await searchProducts(item.name, store, 5, item.price);
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

      {/* ---- Meld feil på varen ---- */}
      {onReport && (
        <div style={{ marginTop: 'var(--space-4)' }}>
          {reportState === 'sent' ? (
            <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>
              Takk! Feilen er meldt inn og gjennomgås automatisk i natt.
            </p>
          ) : report === null ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ paddingLeft: 0, color: 'var(--color-text-muted)' }}
              onClick={() => setReport({ type: 'navn', suggestion: '', comment: '' })}
            >
              <Flag size={13} /> Meld feil på denne varen
            </button>
          ) : (
            <form onSubmit={sendReport} className="card" style={{ padding: 'var(--space-3)' }}>
              <div className="card-kicker">Meld feil på «{item.name}»</div>
              <label className="field" style={{ marginTop: 8 }}>
                <span className="field-label">Hva er feil?</span>
                <select
                  className="input"
                  value={report.type}
                  onChange={(e) => setReport({ ...report, type: e.target.value })}
                >
                  {REPORT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </label>
              <label className="field">
                <span className="field-label">
                  {report.type === 'pris' ? 'Riktig pris (kr)'
                    : report.type === 'duplikat' ? 'Hvilken vare er den lik?'
                    : 'Forslag til riktig verdi'}
                </span>
                <input
                  className="input"
                  value={report.suggestion}
                  placeholder={report.type === 'navn' ? 'f.eks. Hakkede tomater med urter' : ''}
                  onChange={(e) => setReport({ ...report, suggestion: e.target.value })}
                />
              </label>
              <label className="field">
                <span className="field-label">Kommentar (valgfritt)</span>
                <input
                  className="input"
                  value={report.comment}
                  onChange={(e) => setReport({ ...report, comment: e.target.value })}
                />
              </label>
              <div className="row" style={{ gap: 6 }}>
                <button type="submit" className="btn btn-primary btn-sm" style={{ flex: 1 }} disabled={reportState === 'busy'}>
                  {reportState === 'busy' ? 'Sender …' : 'Send inn'}
                </button>
                <button type="button" className="btn btn-sm" onClick={() => { setReport(null); setReportState(null); }}>
                  Avbryt
                </button>
              </div>
              {reportState && reportState !== 'busy' && reportState !== 'sent' && (
                <p style={{ fontSize: 11, color: 'var(--color-accent)', margin: '6px 0 0' }}>{reportState}</p>
              )}
              <p className="text-muted" style={{ fontSize: 11, margin: '8px 0 0' }}>
                Meldingen gjennomgås automatisk hver natt — navn, pris eller
                kategori rettes, duplikater slås sammen.
              </p>
            </form>
          )}
        </div>
      )}

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
