import { describe, it, expect } from 'vitest';
import { manglerMigrasjon, slugify, toLocalInput, fromLocalInput } from './api.jsx';

describe('manglerMigrasjon', () => {
  it('kjenner igjen at en funksjon eller tabell ikke finnes ennå', () => {
    expect(manglerMigrasjon({ message: 'Could not find the function public.my_access without parameters in the schema cache' })).toBe(true);
    expect(manglerMigrasjon({ message: 'relation "public.members" does not exist' })).toBe(true);
    expect(manglerMigrasjon({ code: 'PGRST202', message: 'noe annet' })).toBe(true);
    expect(manglerMigrasjon({ code: '42P01', message: '' })).toBe(true);
  });
  it('lar ekte feil være ekte feil', () => {
    expect(manglerMigrasjon({ message: 'JWT expired' })).toBe(false);
    expect(manglerMigrasjon({ message: 'permission denied for table members' })).toBe(false);
    expect(manglerMigrasjon({ message: 'Failed to fetch' })).toBe(false);
    expect(manglerMigrasjon(null)).toBe(false);
    expect(manglerMigrasjon(undefined)).toBe(false);
  });
});

describe('slugify', () => {
  it('gjør en tittel om til en adresse', () => {
    expect(slugify('Kamp mot Bø!')).toBe('kamp-mot-bo');
    expect(slugify('Æ, Ø og Å')).toBe('ae-o-og-a');
    expect(slugify('  flere   mellomrom  ')).toBe('flere-mellomrom');
    expect(slugify('')).toBe('');
  });
});

describe('datetime-local', () => {
  it('går til Oslo-tid og tilbake igjen', () => {
    // Sommertid: UTC+2
    expect(toLocalInput('2026-07-01T10:00:00Z')).toBe('2026-07-01T12:00');
    expect(fromLocalInput('2026-07-01T12:00')).toBe('2026-07-01T10:00:00.000Z');
    // Vintertid: UTC+1
    expect(toLocalInput('2026-01-15T11:00:00Z')).toBe('2026-01-15T12:00');
    expect(fromLocalInput('2026-01-15T12:00')).toBe('2026-01-15T11:00:00.000Z');
  });
  it('tåler tomme verdier', () => {
    expect(toLocalInput(null)).toBe('');
    expect(fromLocalInput('')).toBe(null);
  });
});
