import { describe, it, expect } from 'vitest';
import { normalizeIngredients } from './recipe.js';

describe('normalizeIngredients', () => {
  it('trimmer navn og dropper tomme rader', () => {
    expect(normalizeIngredients([{ n: '  Kjøttdeig ', qty: 1 }, { n: '   ', qty: 2 }, { n: '', qty: 3 }]))
      .toEqual([{ n: 'Kjøttdeig', qty: 1 }]);
  });
  it('tvinger ugyldig antall til 1', () => {
    expect(normalizeIngredients([{ n: 'Mais', qty: 0 }, { n: 'Agurk', qty: -2 }, { n: 'Løk', qty: 'abc' }]))
      .toEqual([{ n: 'Mais', qty: 1 }, { n: 'Agurk', qty: 1 }, { n: 'Løk', qty: 1 }]);
  });
  it('godtar norsk komma', () => {
    expect(normalizeIngredients([{ n: 'Fløte', qty: '1,5' }])).toEqual([{ n: 'Fløte', qty: 1.5 }]);
  });
  it('slår sammen duplikater og summerer', () => {
    expect(normalizeIngredients([{ n: 'Egg', qty: 4 }, { n: 'egg', qty: 2 }]))
      .toEqual([{ n: 'Egg', qty: 6 }]);
  });
  it('tåler tom og manglende input', () => {
    expect(normalizeIngredients([])).toEqual([]);
    expect(normalizeIngredients(null)).toEqual([]);
  });
});
