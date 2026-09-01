import { describe, it, expect } from 'vitest';
import { tidyTitle } from './title.js';

describe('tidyTitle — versaltitler settes i setningsskrift', () => {
  it('roping dempes', () => {
    expect(tidyTitle('OSTEKAKE MED RØKT LAKS, RØDLØK, DILL OG SITRON'))
      .toBe('Ostekake med røkt laks, rødløk, dill og sitron');
  });

  it('titler som allerede er riktig skrevet røres ikke', () => {
    expect(tidyTitle('Pasta carbonara')).toBe('Pasta carbonara');
    expect(tidyTitle('Kyllingsuppe med sopp og spinat')).toBe('Kyllingsuppe med sopp og spinat');
    // Egennavn midt i tittelen skal overleve.
    expect(tidyTitle('Pannekaker à la Trine')).toBe('Pannekaker à la Trine');
  });

  it('korte forkortelser er ikke roping', () => {
    expect(tidyTitle('BBQ-ribbe')).toBe('BBQ-ribbe');
  });

  it('merkenavn beholder versalene i en ropt tittel', () => {
    expect(tidyTitle('PANNEKAKER FRA TINE')).toBe('Pannekaker fra TINE');
  });

  it('flere setninger får stor forbokstav hver', () => {
    expect(tidyTitle('RASK MIDDAG. KLAR PÅ 20 MINUTTER'))
      .toBe('Rask middag. Klar på 20 minutter');
  });

  it('tomt og tull tåles', () => {
    expect(tidyTitle('')).toBe('');
    expect(tidyTitle(null)).toBe('');
    expect(tidyTitle('   ')).toBe('');
  });
});

describe('matord med norsk liten forbokstav', () => {
  it('engelsk stor forbokstav rettes', () => {
    expect(tidyTitle('Pasta Bolognese')).toBe('Pasta bolognese');
    expect(tidyTitle('Pasta Carbonara')).toBe('Pasta carbonara');
    expect(tidyTitle('Spaghetti Bolognese med Parmesan')).toBe('Spaghetti bolognese med parmesan');
    expect(tidyTitle('Pizza med Mozzarella og Pesto')).toBe('Pizza med mozzarella og pesto');
  });

  it('først i tittelen er stor forbokstav riktig', () => {
    expect(tidyTitle('Bolognese fra bunnen')).toBe('Bolognese fra bunnen');
    expect(tidyTitle('Carbonara på 20 minutter')).toBe('Carbonara på 20 minutter');
  });

  it('ordet må stå alene — sammensetninger røres ikke', () => {
    expect(tidyTitle('Bolognaskinke')).toBe('Bolognaskinke');
    expect(tidyTitle('Parmesanost fra Italia')).toBe('Parmesanost fra Italia');
  });

  it('virker sammen med versal-dempingen', () => {
    expect(tidyTitle('PASTA BOLOGNESE MED PARMESAN')).toBe('Pasta bolognese med parmesan');
  });
});
