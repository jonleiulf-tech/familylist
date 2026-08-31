import { describe, it, expect } from 'vitest';
import { conceptFor, conceptMatch, conceptById, dishConceptFor, CONCEPTS } from './foodConcepts.js';

describe('conceptFor — fra rotete varenavn til én vare', () => {
  it('finner varen i et fullt butikknavn med merke og vekt', () => {
    expect(conceptFor('Gilde kjøttdeig av storfe 400 g')?.id).toBe('kjottdeig');
    expect(conceptFor('Prior kyllingfilet naturell 700 g')?.id).toBe('kylling');
  });

  it('lengste synonym vinner — hermetiske tomater er ikke tomat', () => {
    expect(conceptFor('Hermetiske tomater')?.id).toBe('hermetiske_tomater');
    expect(conceptFor('Knuste tomater 400 g')?.id).toBe('hermetiske_tomater');
    expect(conceptFor('Tomater 500 g')?.id).toBe('tomat');
  });

  it('sammensatte ord treffer forstavelsen', () => {
    expect(conceptFor('laksefilet')?.id).toBe('laks');
    expect(conceptFor('kyllinglår')?.id).toBe('kylling');
  });

  it('ord midt inne i et annet ord treffer ikke', () => {
    // Den klassiske feilen: «melk» skal ikke plukke opp melkesjokolade.
    expect(conceptFor('Melkesjokolade')?.id).not.toBe('melk');
  });

  it('rene krydder og fyllord gir ingen vare', () => {
    expect(conceptFor('salt')).toBeNull();
    expect(conceptFor('pepper')).toBeNull();
    expect(conceptFor('vann')).toBeNull();
    expect(conceptFor('')).toBeNull();
    expect(conceptFor(null)).toBeNull();
  });

  it('ukjente varer gir null i stedet for en gjetning', () => {
    expect(conceptFor('Sjokoladepudding med karamell')).toBeNull();
  });
});

describe('conceptMatch — oppskrift mot tilbud', () => {
  it('samme vare skrevet på to måter er et sikkert treff', () => {
    expect(conceptMatch('Kjøttdeig', 'First Price karbonadedeig 400 g')?.id).toBe('kjottdeig');
    expect(conceptMatch('400 g laks', 'Fersk laksefilet')?.id).toBe('laks');
  });

  it('ulike varer treffer ikke, selv om ordene ligner', () => {
    expect(conceptMatch('Melk', 'Melkesjokolade Freia')).toBeNull();
    // Sammensetninger som er en annen vare skal ikke telle som treff.
    expect(conceptMatch('Kylling', 'Kyllingpålegg')).toBeNull();
    expect(conceptMatch('Laks', 'Laksepostei')).toBeNull();
    expect(conceptMatch('Torsk', 'Laksefilet')).toBeNull();
  });

  it('ukjent på én av sidene gir ingen påstand', () => {
    expect(conceptMatch('Kjøttdeig', 'Toalettpapir 12 rull')).toBeNull();
  });
});

describe('registeret', () => {
  it('alle konsepter har unik id og komplette felt', () => {
    const ids = new Set();
    for (const c of CONCEPTS) {
      expect(ids.has(c.id), `duplikat id: ${c.id}`).toBe(false);
      ids.add(c.id);
      expect(c.label).toBeTruthy();
      expect(c.syn.length).toBeGreaterThan(0);
      expect(c.kcal).toBeGreaterThanOrEqual(0);
      expect(['bearing', 'normal', 'background']).toContain(c.role);
    }
  });

  it('conceptById slår opp', () => {
    expect(conceptById('laks').label).toBe('Laks');
    expect(conceptById('finnes-ikke')).toBeNull();
  });
});

describe('rettkonsepter', () => {
  it('kjenner igjen rettfamilien fra navnet', () => {
    expect(dishConceptFor({ name: 'Kyllingburger med bacon' }).id).toBe('burger');
    expect(dishConceptFor({ name: 'Taco fredag' }).id).toBe('taco');
    expect(dishConceptFor({ name: 'Laksewok med nudler' }).id).toBe('wok');
  });

  it('signaturingredienser fanger retter som heter noe annet', () => {
    const d = dishConceptFor({
      name: 'Fredagsfavoritten',
      ingredients: [{ n: 'Tortillalefser' }, { n: 'Tacokrydder' }, { n: 'Kjøttdeig' }],
    });
    expect(d.id).toBe('taco');
  });

  it('én signaturingrediens alene er ikke nok', () => {
    expect(dishConceptFor({ name: 'Torsdagsmiddag', ingredients: [{ n: 'Tortillalefser' }] })).toBeNull();
  });

  it('ukjent rett gir null', () => {
    expect(dishConceptFor({ name: 'Onsdagsrett', ingredients: [{ n: 'Gulrot' }] })).toBeNull();
  });
});
