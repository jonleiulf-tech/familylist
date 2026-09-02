import { describe, it, expect } from 'vitest';
import { observedRoute, routedStores, routeInfo } from './storeRoutes.js';
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

  it('ingen rute gjenbrukes for en butikk vi ikke har gått', () => {
    expect(observedRoute('REMA 1000')).toBe(null);
    expect(observedRoute('KIWI')).toBe(null);
    expect(observedRoute('')).toBe(null);
    expect(observedRoute(null)).toBe(null);
  });
});

describe('MENY Hovenga er en HELT annen butikk', () => {
  it('starter med frukt og grønt og ender i drikke', () => {
    const r = observedRoute('Meny');
    expect(r['Frukt og grønt']).toBe(0);
    expect(r.Drikke).toBeGreaterThan(0.8);
    expect(r.Fisk).toBeLessThan(r['Tørrvarer']);
  });

  it('er nesten motsatt av Coop Extra der det betyr noe', () => {
    const coop = observedRoute('Coop Extra');
    const meny = observedRoute('Meny');
    // Drikke: først på Coop, sist på MENY.
    expect(coop.Drikke).toBeLessThan(0.1);
    expect(meny.Drikke).toBeGreaterThan(0.8);
    // Frukt og grønt: sent på Coop, først på MENY.
    expect(coop['Frukt og grønt']).toBeGreaterThan(0.5);
    expect(meny['Frukt og grønt']).toBe(0);
    // Fersk fisk: sist på Coop, tidlig på MENY.
    expect(coop.Fisk).toBeGreaterThan(0.8);
    expect(meny.Fisk).toBeLessThan(0.2);
  });

  it('samme liste sorteres ulikt i de to butikkene', () => {
    const liste = ['Cola Zero', 'Agurk', 'Laksefilet', 'Dopapir'];
    const kategori = {
      'Cola Zero': 'Drikke',
      Agurk: 'Frukt og grønt',
      Laksefilet: 'Fisk',
      Dopapir: 'Hus og hjem',
    };
    const sorter = (store) => {
      const r = observedRoute(store);
      return [...liste].sort((a, b) => r[kategori[a]] - r[kategori[b]]);
    };
    expect(sorter('Coop Extra')).toEqual(['Cola Zero', 'Dopapir', 'Agurk', 'Laksefilet']);
    expect(sorter('Meny')).toEqual(['Agurk', 'Laksefilet', 'Dopapir', 'Cola Zero']);
  });

  it('skrivemåtene fra kvittering og butikkliste treffer samme rute', () => {
    expect(observedRoute('MENY Hovenga')).toEqual(observedRoute('Meny'));
    expect(observedRoute('Coop Extra Dr. Munk')).toEqual(observedRoute('Coop Extra'));
    expect(observedRoute('meny')).toEqual(observedRoute('Meny'));
  });

  it('sier hvor og når ruta ble kartlagt', () => {
    expect(routeInfo('Meny')).toEqual({ store: 'Meny', observedAt: '2026-09-02', where: 'Hovenga' });
    expect(routeInfo('KIWI')).toBe(null);
  });

  it('ingen rute for butikker vi ikke har gått', () => {
    expect(observedRoute('REMA 1000')).toBe(null);
    expect(observedRoute('KIWI')).toBe(null);
    expect(routedStores()).toEqual(['Coop Extra', 'Meny']);
  });
});
