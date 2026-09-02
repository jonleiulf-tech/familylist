import { describe, it, expect } from 'vitest';
import { observedRoute, routedStores } from './storeRoutes.js';
import { DEFAULT_ORDER } from '../hooks/usePickOrder.js';

describe('observedRoute', () => {
  it('Coop Extra går inn i drikke og ender i frys', () => {
    const r = observedRoute('Coop Extra');
    expect(r.Drikke).toBe(0);
    expect(r['Hus og hjem']).toBeLessThan(r['Frukt og grønt']);
    expect(r['Tørrvarer']).toBeLessThan(r['Brød og korn']);
    expect(r.Meieri).toBeLessThan(r.Frysevarer);
  });

  it('er stikk motsatt av standardrekkefølgen for non-food', () => {
    // Standarden setter «Hus og hjem» nest sist og «Frukt og grønt»
    // først. I denne butikken er det omvendt — det var hele poenget.
    const r = observedRoute('Coop Extra');
    expect(DEFAULT_ORDER.indexOf('Hus og hjem'))
      .toBeGreaterThan(DEFAULT_ORDER.indexOf('Frukt og grønt'));
    expect(r['Hus og hjem']).toBeLessThan(r['Frukt og grønt']);
  });

  it('gir posisjoner mellom 0 og 1', () => {
    const r = observedRoute('Coop Extra');
    for (const p of Object.values(r)) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it('bruker bare kategorier appen kjenner', () => {
    const kjente = new Set(DEFAULT_ORDER);
    for (const cat of Object.keys(observedRoute('Coop Extra'))) {
      expect(kjente.has(cat)).toBe(true);
    }
  });

  it('ingen rute gjenbrukes for en annen kjede', () => {
    expect(observedRoute('Meny')).toBe(null);
    expect(observedRoute('REMA 1000')).toBe(null);
    expect(observedRoute('KIWI')).toBe(null);
    expect(observedRoute('')).toBe(null);
    expect(observedRoute(null)).toBe(null);
    expect(routedStores()).toEqual(['Coop Extra']);
  });
});
