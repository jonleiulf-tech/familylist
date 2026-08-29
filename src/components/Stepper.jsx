import { kr } from '../lib/format.js';

/**
 * − [antall/pris] +
 * Gram/liter-varer steppes i PAKKER: mengden varen ble lagt til med er
 * én pakke, så «800 g (2 pk)». Stk steppes med 1.
 * Minus under én pakke fjerner varen.
 */
export function Stepper({ item, onStep, onOpen }) {
  const qty = Number(item.qty) || 0;
  const pack = Number(item.pack_size) || 0;
  const usePacks = pack > 0;
  const packs = usePacks ? Math.round(qty / pack) : qty;

  const price = Number(item.price) || 0;
  const priceLabel = price > 0
    ? `${item.price_source === 'kassalapp' ? '' : 'ca. '}${kr(price * qty)}`
    : null;

  return (
    <div className="stepper">
      <button
        type="button"
        className="stepper-btn"
        onClick={() => onStep(-1)}
        aria-label={packs <= 1 ? `Fjern ${item.name}` : `Færre ${item.name}`}
      >
        −
      </button>
      <button
        type="button"
        className="stepper-val"
        onClick={onOpen}
        aria-label={`Rediger ${item.name}`}
      >
        <div>
          {usePacks
            ? <>{qty} {item.unit}{packs > 1 && <> ({packs} pk)</>}</>
            : <>{qty} {item.unit}</>}
        </div>
        {priceLabel && <div className="text-muted" style={{ fontSize: 10 }}>{priceLabel}</div>}
      </button>
      <button type="button" className="stepper-btn" onClick={() => onStep(1)} aria-label={`Flere ${item.name}`}>
        +
      </button>
    </div>
  );
}
