import { describe, it, expect } from 'vitest';
import {
  parseListText, addItem, stepItem, toggleItem, removeItem,
  splitItems, copyList, resetChecks, progressLabel,
} from './customLists.js';

describe('parseListText', () => {
  it('deler på linjer', () => {
    expect(parseListText('Sovepose\nHodelykt')).toEqual([
      { n: 'Sovepose', chk: false, qty: 1 }, { n: 'Hodelykt', chk: false, qty: 1 },
    ]);
  });
  it('fjerner punkttegn', () => {
    expect(parseListText('- Sovepose\n* Hodelykt\n• Kniv').map((i) => i.n))
      .toEqual(['Sovepose', 'Hodelykt', 'Kniv']);
  });
  it('fjerner avkryssingsbokser fra andre apper', () => {
    expect(parseListText('[ ] Sovepose\n[x] Hodelykt').map((i) => i.n))
      .toEqual(['Sovepose', 'Hodelykt']);
  });
  it('fjerner nummerering', () => {
    expect(parseListText('1. Sovepose\n2) Hodelykt').map((i) => i.n))
      .toEqual(['Sovepose', 'Hodelykt']);
  });
  it('hopper over tomme linjer', () => {
    expect(parseListText('Sovepose\n\n\nHodelykt')).toHaveLength(2);
  });
  it('takler tom input', () => {
    expect(parseListText('')).toEqual([]);
    expect(parseListText(null)).toEqual([]);
  });
});

describe('addItem', () => {
  it('legger til', () => {
    expect(addItem([], 'Sovepose')).toEqual([{ n: 'Sovepose', chk: false, qty: 1 }]);
  });
  it('duplikat øker antallet i stedet for å avvises', () => {
    const items = [{ n: 'Sovepose', chk: false, qty: 2 }];
    expect(addItem(items, 'sovepose')).toEqual([{ n: 'Sovepose', chk: false, qty: 3 }]);
  });
  it('avviser tomt', () => {
    expect(addItem([], '   ')).toEqual([]);
  });
  it('trimmer', () => {
    expect(addItem([], '  Kniv  ')[0].n).toBe('Kniv');
  });
});

describe('avhuking', () => {
  const items = [{ n: 'A', chk: false }, { n: 'B', chk: true }];
  it('slår av og på', () => {
    expect(toggleItem(items, 0)[0].chk).toBe(true);
    expect(toggleItem(items, 1)[1].chk).toBe(false);
  });
  it('rører ikke de andre', () => {
    expect(toggleItem(items, 0)[1]).toEqual(items[1]);
  });
  it('fjerner riktig element', () => {
    expect(removeItem(items, 0)).toEqual([items[1]]);
  });
  it('deler i uplukket og plukket', () => {
    const { open, picked } = splitItems(items);
    expect(open.map((i) => i.n)).toEqual(['A']);
    expect(picked.map((i) => i.n)).toEqual(['B']);
  });
});

describe('copyList', () => {
  const list = { name: 'Hyttetur', type: 'pakking', shared: true,
    items: [{ n: 'Sovepose', chk: true }, { n: 'Kniv', chk: false }] };

  it('legger på «(kopi)»', () => {
    expect(copyList(list).name).toBe('Hyttetur (kopi)');
  });
  it('nullstiller all avhuking', () => {
    expect(copyList(list).items.every((i) => i.chk === false)).toBe(true);
  });
  it('beholder elementene og typen', () => {
    expect(copyList(list).items.map((i) => i.n)).toEqual(['Sovepose', 'Kniv']);
    expect(copyList(list).type).toBe('pakking');
  });
  it('endrer ikke originalen', () => {
    copyList(list);
    expect(list.items[0].chk).toBe(true);
  });
});

describe('resetChecks og progressLabel', () => {
  it('nullstiller', () => {
    expect(resetChecks([{ n: 'A', chk: true }])[0].chk).toBe(false);
  });
  it('viser fremdrift', () => {
    expect(progressLabel([])).toBe('Tom');
    expect(progressLabel([{ n: 'A', chk: true }])).toBe('Ferdig');
    expect(progressLabel([{ n: 'A', chk: true }, { n: 'B', chk: false }])).toBe('1 av 2');
  });
});


describe('antall', () => {
  it('parser «2 Sovepose» og «Hodelykt x3»', () => {
    expect(parseListText('2 Sovepose\nHodelykt x3')).toEqual([
      { n: 'Sovepose', chk: false, qty: 2 },
      { n: 'Hodelykt', chk: false, qty: 3 },
    ]);
  });
  it('nummerert liste er ikke antall: «1. Sovepose» gir qty 1', () => {
    expect(parseListText('1. Sovepose')).toEqual([{ n: 'Sovepose', chk: false, qty: 1 }]);
  });
  it('stepItem justerer opp og ned, aldri under 1', () => {
    const items = [{ n: 'A', chk: false, qty: 2 }];
    expect(stepItem(items, 0, 1)[0].qty).toBe(3);
    expect(stepItem(items, 0, -1)[0].qty).toBe(1);
    expect(stepItem(stepItem(items, 0, -1), 0, -1)[0].qty).toBe(1);
  });
  it('gamle rader uten qty behandles som 1', () => {
    expect(stepItem([{ n: 'A', chk: false }], 0, 1)[0].qty).toBe(2);
  });
  it('kopiering bevarer antallet', () => {
    const c = copyList({ name: 'X', items: [{ n: 'A', chk: true, qty: 4 }] });
    expect(c.items[0].qty).toBe(4);
  });
});
