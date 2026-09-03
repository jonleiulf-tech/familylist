// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, cleanup } from '@testing-library/react';

/**
 * «Fikk ikke kontakt» må ikke se ut som «du har ingen liste».
 *
 * Stresstesten kjørte en profil der nettet dør rett etter oppstart. Appen
 * krasjet ikke — den viste noe verre: «Velkommen. Hva skal du bruke
 * Plukkelisten til?» til en familie som har brukt den i månedsvis.
 *
 * Årsaken var at loadLists() ved en hentefeil bare satte `error` og gikk
 * ut. `stage` sto igjen på 'ready' og `lists` på [], så App tok
 * `!household`-grenen og tegnet Onboarding. Fyller brukeren inn det
 * skjemaet, får de i tillegg en ekstra husholdning.
 *
 * Derfor: en hentefeil setter stage='failed', og App har en egen skjerm
 * for den med «Prøv igjen».
 */

const svar = { data: null, error: null };

vi.mock('../lib/supabase.js', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          // members-spørringen avsluttes med .eq(...) og await'es direkte
          then: (res) => res(svar),
          order: () => ({ then: (res) => res({ data: [], error: null }) }),
        }),
      }),
    }),
    rpc: () => Promise.resolve({ data: null, error: null }),
  },
}));

const { useSharedLists } = await import('./useSharedLists.js');

const bruker = { id: 'u1' };

beforeEach(() => {
  svar.data = null;
  svar.error = null;
  localStorage.clear();
});
afterEach(cleanup);

describe('useSharedLists — hentefeil vs. ingen liste', () => {
  it('hentefeil gir stage=failed, ikke needs-name', async () => {
    svar.error = { message: 'Failed to fetch' };
    const { result } = renderHook(() => useSharedLists(bruker));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.stage).toBe('failed');
    expect(result.current.error).toBe('Failed to fetch');
    expect(result.current.activeList).toBe(null);
  });

  it('tomt svar UTEN feil gir needs-name — det er en ekte ny bruker', async () => {
    svar.data = [];
    const { result } = renderHook(() => useSharedLists(bruker));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.stage).toBe('needs-name');
    expect(result.current.error).toBe(null);
  });

  it('vellykket henting gir ready og listen tilbake', async () => {
    svar.data = [{ household_id: 'h1', role: 'owner', display_name: 'Jon', households: { id: 'h1', name: 'Familien' } }];
    const { result } = renderHook(() => useSharedLists(bruker));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.stage).toBe('ready');
    expect(result.current.activeList?.name).toBe('Familien');
  });
});
