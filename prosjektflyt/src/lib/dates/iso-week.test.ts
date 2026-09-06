import { describe, expect, it } from 'vitest';
import { daysBetween, formatIsoWeek, toIsoWeek, weeksBetween } from './iso-week';

describe('toIsoWeek rundt nyttår', () => {
  it('2024-12-30 er ISO-uke 1, 2025 (mandag i uken med årets første torsdag)', () => {
    expect(toIsoWeek('2024-12-30')).toEqual({ isoYear: 2025, isoWeek: 1 });
  });

  it('2023-01-01 er ISO-uke 52, 2022 (søndag hører til forrige år)', () => {
    expect(toIsoWeek('2023-01-01')).toEqual({ isoYear: 2022, isoWeek: 52 });
  });

  it('2026-01-01 er ISO-uke 1, 2026', () => {
    expect(toIsoWeek('2026-01-01')).toEqual({ isoYear: 2026, isoWeek: 1 });
  });

  it('formatIsoWeek gir norsk visningstekst', () => {
    expect(formatIsoWeek('2026-01-01')).toBe('Uke 1, 2026');
  });
});

describe('daysBetween / weeksBetween', () => {
  it('regner dager mellom to datoer', () => {
    expect(daysBetween('2026-01-01', '2026-01-15')).toBe(14);
  });

  it('regner uker mellom to datoer (minimum 1)', () => {
    expect(weeksBetween('2026-01-05', '2026-01-05')).toBe(1);
    expect(weeksBetween('2026-01-05', '2026-01-19')).toBe(3);
  });
});
