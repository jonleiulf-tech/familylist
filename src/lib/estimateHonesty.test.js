import { describe, it, expect } from 'vitest';
import { estimatedTotal, purchases } from './format.js';
import { packSizeFor } from './catalog.js';

/**
 * Piloten 2. september: appen sa 2 326 kroner, kassa sa 3 281 (+41 %).
 * Avviket var tre faktorer som gikk i hver sin retning og skjulte
 * hverandre:
 *
 *   D = 0,74  — 15 av 57 varer manglet pris og ble filtrert bort i
 *               stillhet, mens tallet fortsatt het «total»
 *   P = 1,95  — prisene i basen var per KVITTERINGSLINJE, ikke per vare
 *   Q = 0,50  — appen la til 1 av alt; 93 artikler ble regnet som 46
 *
 * 0,74 × 1,95 × 0,50 = 0,71 = 2 326 / 3 281.
 *
 * Testene under holder alle tre i sjakk. Merk særlig at det å rette BARE
 * prisene ville gjort avviket verre (−29 % → −64 %) — derfor må mengden
 * og de bortfiltrerte radene rettes i samme slengen.
 */
describe('pakningsstørrelsen — prisen gjelder én pakke, ikke én bit', () => {
  const cost = (name, unit, qty, price) =>
    price * purchases(qty, unit, packSizeFor(name, unit, null));

  it('fire egg er ett brett, ikke fire brett', () => {
    // Skjermbildet Jon sendte: «4 stk Egg · ca. kr 233,16» — 58 kr per egg.
    expect(cost('Egg', 'stk', 4, 65)).toBe(65);
  });

  it('åtte pølser er én pakke', () => {
    expect(cost('Pølser', 'stk', 8, 45)).toBe(45);
  });

  it('tolv egg er to brett', () => {
    expect(cost('Egg', 'stk', 12, 65)).toBe(130);
  });

  it('tre liter melk er tre kartonger, ikke én', () => {
    // Havredrikken på piloten: 22,33 per kartong, tre kjøpt = 66,99, som
    // er nøyaktig det kvitteringen sa.
    expect(cost('Havredrikk', 'liter', 3, 22.33)).toBeCloseTo(66.99, 2);
  });

  it('to kilo poteter er to kilo, ikke fem 400-grams pakker', () => {
    expect(cost('Poteter', 'kg', 2, 48)).toBe(96);
  });

  it('hektogram finnes i enhetsvelgeren og må regnes som vekt', () => {
    // 3 hg = 300 g = én pakke. Før falt hg gjennom til «ett kjøp per
    // enhet» og ble tre pakkepriser.
    expect(cost('Kjøttdeig', 'hg', 3, 70)).toBe(70);
    expect(cost('Kjøttdeig', 'g', 600, 70)).toBe(140);
  });

  it('en oppgitt pakningsstørrelse vinner over gjetningen', () => {
    expect(packSizeFor('Pølser', 'stk', { pack_size: 10 })).toBe(10);
  });
});

describe('anslaget forteller hva det IKKE vet', () => {
  const row = (price, extra = {}) => ({ name: 'X', qty: 1, unit: 'stk', price, ...extra });

  it('sier «minst» når noe mangler pris, og hvor mange', () => {
    const t = estimatedTotal([row(20), row(0), row(null)]);
    expect(t.sum).toBe(20);
    expect(t.counted).toBe(1);
    expect(t.missing).toBe(2);
    expect(t.label.startsWith('minst')).toBe(true);
    expect(t.note).toMatch(/2 varer mangler pris/);
  });

  it('sier «ca.» når alt har pris, men prisene er anslag', () => {
    const t = estimatedTotal([row(20), row(30)]);
    expect(t.sum).toBe(50);
    expect(t.missing).toBe(0);
    expect(t.label).toMatch(/^ca\./);
    expect(t.note).toBe(null);
  });

  it('dropper «ca.» bare når ALLE radene har en ekte butikkpris', () => {
    const t = estimatedTotal([
      row(20, { price_source: 'kassalapp' }),
      row(30, { price_source: 'kassalapp' }),
    ]);
    expect(t.exact).toBe(true);
    expect(t.label).toBe('kr 50');
  });

  it('kaller seg ALDRI eksakt når noe mangler pris', () => {
    // Dette var den farligste varianten: «exact» ble regnet av de radene
    // som overlevde filteret, så den ene gangen appen skrev et eksakt
    // tall, var 20 av 22 varer utelatt.
    const t = estimatedTotal([
      row(20, { price_source: 'kassalapp' }),
      ...Array.from({ length: 20 }, () => row(0)),
    ]);
    expect(t.exact).toBe(false);
    expect(t.missing).toBe(20);
    expect(t.label).toBe('minst kr 20');
  });

  it('en urimelig dyr rad telles som manglende, ikke som gratis', () => {
    // Før ble den satt til 0 og forsvant sporløst — altså ble den dyreste
    // varen på listen gratis, i anslaget OG i hytteoppgjøret.
    const t = estimatedTotal([row(20), { name: 'Poteter', qty: 10, unit: 'kg', price: 48 }]);
    expect(t.missing).toBe(0);   // 10 kg poteter er 480 kr, helt rimelig
    const gal = estimatedTotal([row(20), { name: 'Y', qty: 1000, unit: 'stk', price: 48 }]);
    expect(gal.missing).toBe(1);
    expect(gal.sum).toBe(20);
  });

  it('tom liste gir en tankestrek, ikke kr 0', () => {
    expect(estimatedTotal([]).label).toBe('—');
    expect(estimatedTotal(null).label).toBe('—');
  });
});
