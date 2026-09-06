import { describe, expect, it } from 'vitest';
import { computeProjectProgressPercent } from './progress';

describe('computeProjectProgressPercent', () => {
  it('snitt av alle milepælers prosent fullført', () => {
    expect(
      computeProjectProgressPercent([{ progress_percent: 100 }, { progress_percent: 0 }]),
    ).toBe(50);
  });

  it('0 uten milepæler', () => {
    expect(computeProjectProgressPercent([])).toBe(0);
  });
});
