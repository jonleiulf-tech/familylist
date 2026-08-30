import { describe, it, expect } from 'vitest';
import {
  householdPortions, portionLabel, formatPortions, mealScaleFactor, scaleQty,
} from './portions.js';

// Jons familie: 2 voksne + storebror som spiser som voksen = 3 «voksne»,
// og lillebror som spiser mindre = 1 barn → 3,5 porsjoner.
const FAMILIE = { adults: 3, children: 1 };

describe('householdPortions', () => {
  it('voksne teller 1, barn en halv', () => {
    expect(householdPortions(FAMILIE)).toBe(3.5);
    expect(householdPortions({ adults: 2, children: 2 })).toBe(3);
  });

  it('standard er 2 voksne når profilen mangler (gamle husholdninger)', () => {
    expect(householdPortions({})).toBe(2);
    expect(householdPortions(null)).toBe(2);
  });

  it('aldri under 1 porsjon', () => {
    expect(householdPortions({ adults: 0, children: 0 })).toBe(1);
  });
});

describe('mealScaleFactor', () => {
  it('Gilde-oppskrift til 4 personer for familien på 3,5 porsjoner', () => {
    expect(mealScaleFactor(4, FAMILIE)).toBe(3.5 / 4);
  });

  it('bestemor på søndagsbesøk: +1 gjesteporsjon på akkurat den middagen', () => {
    expect(mealScaleFactor(4, FAMILIE, 1)).toBe(4.5 / 4);
  });

  it('ukjent basis skalerer ALDRI — faktor 1', () => {
    expect(mealScaleFactor(null, FAMILIE, 2)).toBe(1);
    expect(mealScaleFactor(0, FAMILIE)).toBe(1);
    expect(mealScaleFactor(undefined, FAMILIE)).toBe(1);
  });
});

describe('scaleQty — pen avrunding', () => {
  it('500 g til 4 personer → 440 g til 3,5 porsjoner (nærmeste 10)', () => {
    expect(scaleQty(500, 3.5 / 4)).toBe(440);
  });

  it('mellomstore tall rundes til hele, små til kvarte', () => {
    expect(scaleQty(12, 3.5 / 4)).toBe(11);        // 10,5 → 11
    expect(scaleQty(2, 3.5 / 4)).toBe(1.75);       // ts/dl kan ha kvarte
    expect(scaleQty(1, 1.25)).toBe(1.25);
  });

  it('faktor 1 og ukjente mengder røres ikke', () => {
    expect(scaleQty(3, 1)).toBe(3);
    expect(scaleQty(null, 2)).toBeNull();
  });
});

describe('visning', () => {
  it('portionLabel og formatPortions med norsk komma', () => {
    expect(portionLabel(FAMILIE)).toBe('3 voksne + 1 barn · 3,5 porsjoner');
    expect(portionLabel({ adults: 1, children: 0 })).toBe('1 voksen · 1 porsjon');
    expect(formatPortions(4)).toBe('4');
  });
});
