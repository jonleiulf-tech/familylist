import { describe, it, expect } from 'vitest';
import { normalizeServings, scaleFactor } from './servings.js';

describe('normalizeServings', () => {
  it.each([
    ['4 porsjoner', 4],
    ['4 personer', 4],
    ['4 servings', 4],
    ['serverer 4', 4],
    ['Serves 4', 4],
    ['6 personer', 6],
    ['4', 4],
  ])('«%s» → %i (high)', (raw, expected) => {
    const r = normalizeServings(raw);
    expect(r.base_servings).toBe(expected);
    expect(r.servings_confidence).toBe('high');
    expect(r.servings_raw).toBe(raw);
  });

  it('intervall «4-6 personer»: min/maks lagres, midtpunkt foreslås som medium', () => {
    const r = normalizeServings('4-6 personer');
    expect(r.base_servings_min).toBe(4);
    expect(r.base_servings_max).toBe(6);
    expect(r.base_servings).toBe(5);
    expect(r.servings_confidence).toBe('medium');
  });

  it('«4 til 6» og tankestrek fungerer også', () => {
    expect(normalizeServings('4 til 6').base_servings_max).toBe(6);
    expect(normalizeServings('4–6 porsjoner').base_servings_max).toBe(6);
  });

  it('ANTAR ALDRI 4: tom kilde gir null og unknown', () => {
    for (const raw of [null, undefined, '', '   ']) {
      const r = normalizeServings(raw);
      expect(r.base_servings).toBeNull();
      expect(r.servings_confidence).toBe('unknown');
    }
  });

  it('tekst uten tall gir unknown, med råteksten bevart', () => {
    const r = normalizeServings('en god porsjon til hele gjengen?');
    // «en» er tallord -> 1 medium. Test med ekte talløs tekst:
    const r2 = normalizeServings('passer til middag');
    expect(r2.base_servings).toBeNull();
    expect(r2.servings_confidence).toBe('unknown');
    expect(r2.servings_raw).toBe('passer til middag');
    expect(r.base_servings).toBe(1);
  });

  it('tallord «fire porsjoner» gir 4 med medium', () => {
    const r = normalizeServings('fire porsjoner');
    expect(r.base_servings).toBe(4);
    expect(r.servings_confidence).toBe('medium');
  });

  it('numerisk yield_count brukes direkte (Recipe API)', () => {
    const r = normalizeServings(4, { source: 'recipe_api' });
    expect(r.base_servings).toBe(4);
    expect(r.servings_source).toBe('recipe_api');
    expect(r.servings_confidence).toBe('high');
  });

  it('recipeYield som array: beste treff vinner', () => {
    expect(normalizeServings(['', '4 porsjoner']).base_servings).toBe(4);
  });

  it('urimelige tall blir ikke porsjoner', () => {
    expect(normalizeServings('oppskrift nr. 2483').base_servings).toBeNull();
  });
});

describe('scaleFactor', () => {
  it('6 ønsket av 4 basis = 1.5', () => {
    expect(scaleFactor(4, 6)).toBe(1.5);
  });
  it('null basis gir null — aldri gjett', () => {
    expect(scaleFactor(null, 6)).toBeNull();
    expect(scaleFactor(0, 6)).toBeNull();
  });
});
