import { describe, it, expect } from 'vitest';
import { accessFrom } from './access.js';

const sports = [{ slug: 'fotball', name: 'PSI Fotball' }, { slug: 'padel', name: 'PSI Padel' }, { slug: 'klatring', name: 'PSI Klatring' }];

describe('accessFrom', () => {
  it('admin kan alt', () => {
    const a = accessFrom({ email: 'x@usn.no', is_admin: true, leader_of: [], member_of: [] });
    expect(a.canManage('padel')).toBe(true);
    expect(a.canManage(null)).toBe(true);
    expect(a.visibleSports(sports)).toHaveLength(3);
    expect(a.scopeOptions(sports)[0]).toEqual({ value: '', label: 'Hele PSI' });
    expect(a.roleLabel).toBe('PSI-admin');
  });
  it('gruppeleder ser og styrer bare sin gruppe', () => {
    const a = accessFrom({ email: 'l@usn.no', is_admin: false, leader_of: ['fotball'], member_of: ['padel'] });
    expect(a.canManage('fotball')).toBe(true);
    expect(a.canManage('padel')).toBe(false);
    expect(a.canManage(null)).toBe(false);
    expect(a.canSee('padel')).toBe(true);
    expect(a.visibleSports(sports).map((s) => s.slug)).toEqual(['fotball', 'padel']);
    expect(a.scopeOptions(sports)).toEqual([{ value: 'fotball', label: 'PSI Fotball' }]);
    expect(a.canEdit).toBe(true);
  });
  it('medlem uten roller har ikke tilgang', () => {
    const a = accessFrom(null);
    expect(a.hasAccess).toBe(false);
    expect(a.canEdit).toBe(false);
    expect(a.roleLabel).toBe('Ingen tilgang');
  });
});
