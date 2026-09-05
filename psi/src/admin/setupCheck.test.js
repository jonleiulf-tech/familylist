import { describe, it, expect } from 'vitest';
import { kjørSjekk, medTidsfrist } from './setupCheck.js';

const svar = (verdi) => ({ error: null, data: verdi });
const klient = ({ contentError = null, rpcError = null, rpcData = false, heng = null } = {}) => ({
  supabaseUrl: 'https://abc.supabase.co',
  from: () => ({
    select: () => ({
      limit: () => (heng === 'content' ? new Promise(() => {}) : Promise.resolve({ error: contentError })),
    }),
  }),
  rpc: () => (heng === 'rpc' ? new Promise(() => {}) : Promise.resolve({ ...svar(rpcData), error: rpcError })),
});

describe('kjørSjekk', () => {
  it('sier fra når miljøvariablene mangler', async () => {
    const r = await kjørSjekk(null);
    expect(r).toHaveLength(1);
    expect(r[0].status).toBe('feil');
    expect(r[0].fiks).toMatch(/Redeploy/);
  });

  it('peker på schema.sql når tabellen ikke finnes', async () => {
    const r = await kjørSjekk(klient({ contentError: { message: 'relation "public.content" does not exist' } }));
    expect(r.at(-1).navn).toBe('Tabellene i databasen');
    expect(r.at(-1).status).toBe('feil');
    expect(r.at(-1).fiks).toMatch(/schema\.sql/);
  });

  it('peker på nøkkelen når den ikke passer prosjektet', async () => {
    const r = await kjørSjekk(klient({ contentError: { message: 'Invalid API key' } }));
    expect(r.at(-1).fiks).toMatch(/Anon-nøkkelen/);
  });

  it('sier fra når is_admin mangler', async () => {
    const r = await kjørSjekk(klient({ rpcError: { message: 'function public.is_admin() does not exist' } }));
    expect(r.at(-1).navn).toBe('Tilgangsfunksjonen is_admin');
    expect(r.at(-1).status).toBe('feil');
  });

  it('gir fire grønne steg når alt er på plass', async () => {
    const r = await kjørSjekk(klient({ rpcData: true }), 'https://psiusn.no');
    expect(r).toHaveLength(4);
    expect(r.every((x) => x.status === 'ok')).toBe(true);
    expect(r.at(-1).forklaring).toContain('https://psiusn.no/admin');
  });

  it('henger ikke når databasen ikke svarer', async () => {
    const r = await Promise.race([
      kjørSjekk(klient({ heng: 'content' })),
      new Promise((res) => setTimeout(() => res('HANG'), 12000)),
    ]);
    expect(r).not.toBe('HANG');
    expect(r.at(-1).status).toBe('feil');
    expect(r.at(-1).fiks).toMatch(/pause/);
  }, 15000);

  it('medTidsfrist avviser etter fristen', async () => {
    await expect(medTidsfrist(new Promise(() => {}), 50)).rejects.toThrow('tidsfrist');
  });
});
