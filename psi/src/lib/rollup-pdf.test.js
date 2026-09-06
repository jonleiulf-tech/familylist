import { describe, it, expect } from 'vitest';
import { brytTekst, dekk, typografi, erPng, rundetRekt } from './rollup-pdf.js';

const mål = (t) => t.length * 10;

describe('tekstbryting', () => {
  it('bryter på ordgrenser', () => {
    expect(brytTekst(mål, 'ett to tre fire fem', 100)).toEqual(['ett to tre', 'fire fem']);
  });

  it('markerer at teksten er kuttet', () => {
    const linjer = brytTekst(mål, 'ett to tre fire fem seks sju åtte', 100, 2);
    expect(linjer).toHaveLength(2);
    expect(linjer[1].endsWith('…')).toBe(true);
  });

  it('lar teksten være når den får plass', () => {
    expect(brytTekst(mål, 'kort', 100, 2)).toEqual(['kort']);
  });
});

describe('utsnitt', () => {
  it('dekker boksen og flytter mot fokuspunktet', () => {
    const d = dekk(1000, 500, 800, 800, 50, 50);
    expect(d.h).toBeCloseTo(800, 5);
    expect(d.dx).toBeCloseTo(-400, 5);
  });
});

describe('typografi', () => {
  it('skalerer med bredden', () => {
    expect(typografi(850).tittel).toBe(130);
    expect(typografi(800).tittel).toBeCloseTo(130 * 800 / 850, 5);
  });
});

describe('bildetype', () => {
  it('kjenner PNG på de fire første bytene', () => {
    expect(erPng(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2]))).toBe(true);
    expect(erPng(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(false);
    expect(erPng(null)).toBe(false);
  });
});

describe('avrundet rektangel', () => {
  it('lukker banen', () => {
    expect(rundetRekt(100, 50, 10).trim().endsWith('Z')).toBe(true);
  });

  it('tåler en radius større enn boksen', () => {
    expect(rundetRekt(20, 10, 999)).toContain('A 5 5');
  });
});
