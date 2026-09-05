import { describe, it, expect } from 'vitest';
import { passordFeil, MIN_PASSORD } from './useAdminAuth.js';

describe('passordFeil', () => {
  it('krever minst ti tegn', () => {
    expect(passordFeil('kort')).toMatch(/minst 10/);
    expect(passordFeil('')).toMatch(/minst 10/);
    expect(passordFeil(undefined)).toMatch(/minst 10/);
    expect(passordFeil('a'.repeat(MIN_PASSORD))).toBe(null);
  });
  it('krever at gjentakelsen stemmer når den er oppgitt', () => {
    expect(passordFeil('detteerlangtnok', 'noeannet')).toMatch(/ikke like/);
    expect(passordFeil('detteerlangtnok', 'detteerlangtnok')).toBe(null);
    expect(passordFeil('detteerlangtnok')).toBe(null);
  });
});
