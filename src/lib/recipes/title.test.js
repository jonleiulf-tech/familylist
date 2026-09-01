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
