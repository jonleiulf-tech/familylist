import { describe, it, expect } from 'vitest';
import { normalizeUrl, lenketypeFra } from './supabase.js';

/* En skrivefeil i Vercel skal aldri kunne ta ned siden. */
describe('normalizeUrl', () => {
  const ok = 'https://gfoqscjwcatbvxdbynbr.supabase.co';
  it('godtar adressen slik Supabase viser den', () => {
    expect(normalizeUrl(ok)).toBe(ok);
    expect(normalizeUrl(`${ok}/rest/v1/`)).toBe(ok);
    expect(normalizeUrl(`${ok}/auth/v1`)).toBe(ok);
    expect(normalizeUrl(`  ${ok}/  `)).toBe(ok);
  });
  it('legger på https når det mangler', () => {
    expect(normalizeUrl('gfoqscjwcatbvxdbynbr.supabase.co')).toBe(ok);
  });
  it('gir null i stedet for å kaste på søppel', () => {
    for (const v of ['', '   ', null, undefined, 42, 'ikke en adresse med mellomrom']) {
      expect(normalizeUrl(v)).toBe(null);
    }
  });
});

describe('lenketypeFra', () => {
  it('finner type i hash, som ved implicit flow', () => {
    expect(lenketypeFra('#access_token=abc&type=recovery&expires_in=3600', '')).toBe('recovery');
    expect(lenketypeFra('#access_token=abc&type=magiclink', '')).toBe('magiclink');
  });
  it('finner type i query, som ved PKCE', () => {
    expect(lenketypeFra('', '?type=recovery&code=xyz')).toBe('recovery');
  });
  it('gir null når det ikke er noen lenketype', () => {
    expect(lenketypeFra('', '')).toBe(null);
    expect(lenketypeFra('#', '?')).toBe(null);
    expect(lenketypeFra('#noe=annet', '?og=annet')).toBe(null);
  });
});
