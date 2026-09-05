import { describe, it, expect } from 'vitest';
import { manglerMigrasjon, slugify, toLocalInput, fromLocalInput, loadAdminData } from './api.jsx';

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

/* Falsk Supabase-klient. Bare det loadAdminData faktisk kaller. */
function fakeClient({ rpc = {}, tableErrors = {}, sports = [], content = [] } = {}) {
  const svar = (data, error = null) => Promise.resolve({ data, error });
  const kjede = (data, error) => {
    const p = svar(data, error);
    p.order = () => kjede(data, error);
    p.eq = () => kjede(data, error);
    p.neq = () => kjede(data, error);
    p.limit = () => kjede(data, error);
    p.or = () => kjede(data, error);
    return p;
  };
  return {
    kalt: [],
    from(tabell) {
      const error = tableErrors[tabell] || null;
      const data = tabell === 'sports' ? sports : tabell === 'content' ? content : [];
      return { select: () => kjede(error ? null : data, error) };
    },
    rpc(navn) {
      this.kalt.push(navn);
      const r = rpc[navn];
      if (!r) return svar(null, { message: `Could not find the function public.${navn} in the schema cache` });
      return svar(r.data ?? null, r.error ?? null);
    },
  };
}

const SPORTS = [{ slug: 'fotball', active: true, sort_order: 10, data: { name: 'PSI Fotball' } }];

describe('loadAdminData', () => {
  it('bruker my_access når migrasjonene er kjørt', async () => {
    const client = fakeClient({ sports: SPORTS, rpc: { my_access: { data: { email: 'a@b.no', is_admin: false, leader_of: ['fotball'], member_of: [] } } } });
    const d = await loadAdminData(client);
    expect(d.v2Missing).toBe(false);
    expect(d.access.canManage('fotball')).toBe(true);
    expect(d.access.isAdmin).toBe(false);
    expect(client.kalt).toEqual(['my_access']);      // trenger ikke reserven
    expect(d.sports[0].name).toBe('PSI Fotball');
  });

  it('faller tilbake på is_admin når my_access ikke finnes ennå', async () => {
    // Dette er tilstanden når bare migrasjon 0001 er kjørt.
    const client = fakeClient({ sports: SPORTS, rpc: { is_admin: { data: true } } });
    const d = await loadAdminData(client);
    expect(client.kalt).toEqual(['my_access', 'is_admin']);
    expect(d.v2Missing).toBe(true);
    expect(d.access.isAdmin).toBe(true);
    expect(d.access.hasAccess).toBe(true);           // slipper styret inn
    expect(d.access.canEdit).toBe(true);
    expect(d.access.visibleSports(d.sports)).toHaveLength(1);
  });

  it('slipper ingen inn når verken my_access eller is_admin sier ja', async () => {
    const client = fakeClient({ sports: SPORTS, rpc: { is_admin: { data: false } } });
    const d = await loadAdminData(client);
    expect(d.access.hasAccess).toBe(false);
    expect(d.v2Missing).toBe(true);
  });

  it('lar ekte feil boble opp i stedet for å skjule dem', async () => {
    const client = fakeClient({ sports: SPORTS, rpc: { my_access: { error: { message: 'JWT expired' } } } });
    await expect(loadAdminData(client)).rejects.toMatchObject({ message: 'JWT expired' });
  });

  it('kaster når grunntabellene ikke svarer', async () => {
    const client = fakeClient({ sports: SPORTS, tableErrors: { content: { message: 'permission denied' } }, rpc: { my_access: { data: { is_admin: true } } } });
    await expect(loadAdminData(client)).rejects.toMatchObject({ message: 'permission denied' });
  });

  it('merker Spond-synken som ikke satt opp når sync_runs mangler', async () => {
    const client = fakeClient({ sports: SPORTS, tableErrors: { sync_runs: { message: 'relation "public.sync_runs" does not exist' } }, rpc: { my_access: { data: { is_admin: true } } } });
    const d = await loadAdminData(client);
    expect(d.syncReady).toBe(false);
    expect(d.lastSync).toBe(null);
  });
});

describe('manglerMigrasjon', () => {
  it('kjenner igjen at en kolonne mangler', () => {
    expect(manglerMigrasjon({ code: 'PGRST204', message: "Could not find the 'focus_x' column of 'media' in the schema cache" })).toBe(true);
    expect(manglerMigrasjon({ code: '42703', message: 'column media.focus_x does not exist' })).toBe(true);
  });

  it('kjenner igjen at en tabell eller funksjon mangler', () => {
    expect(manglerMigrasjon({ code: 'PGRST202', message: 'Could not find the function public.my_access' })).toBe(true);
    expect(manglerMigrasjon({ code: '42P01', message: 'relation "public.members" does not exist' })).toBe(true);
  });

  it('lar ekte feil være ekte feil', () => {
    expect(manglerMigrasjon({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBe(false);
    expect(manglerMigrasjon(null)).toBe(false);
  });
});
