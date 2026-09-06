import { describe, it, expect } from 'vitest';
import { filFeil, trygtNavn, mappe, hentØkonomi, koblingAv, db } from './okonomi.js';

describe('filFeil', () => {
  it('slipper gjennom bilder og PDF', () => {
    expect(filFeil({ name: 'kvittering.jpg', type: 'image/jpeg', size: 1000 })).toBe(null);
    expect(filFeil({ name: 'kvittering.pdf', type: 'application/pdf', size: 1000 })).toBe(null);
    // iPhone sender av og til HEIC uten mimetype.
    expect(filFeil({ name: 'IMG_1234.HEIC', type: '', size: 1000 })).toBe(null);
  });

  it('stopper for store filer', () => {
    expect(filFeil({ name: 'a.jpg', type: 'image/jpeg', size: 30 * 1048576 })).toMatch(/30 MB/);
  });

  it('stopper filtyper vi ikke kan legge i et utlegg', () => {
    expect(filFeil({ name: 'regneark.xlsx', type: 'application/vnd.ms-excel', size: 100 })).toMatch(/Bare bilder/);
    expect(filFeil(null)).toBe('Ingen fil.');
  });
});

describe('trygtNavn', () => {
  it('fjerner æ, ø og å', () => {
    // Norske tegn i en storage-sti gir vondt vondt senere.
    expect(trygtNavn('Kvittering høyt under taket.pdf')).toBe('Kvittering-hoyt-under-taket.pdf');
    expect(trygtNavn('Måltid ÆØÅ.jpg')).toBe('Maltid-AEOA.jpg');
  });

  it('fjerner skråstreker og annet som ville laget nye mapper', () => {
    expect(trygtNavn('../../hemmelig.pdf')).toBe('hemmelig.pdf');
    expect(trygtNavn('a/b/c.jpg')).toBe('a-b-c.jpg');
  });

  it('gir alltid et navn', () => {
    expect(trygtNavn('')).toBe('bilag');
    expect(trygtNavn('???')).toBe('bilag');
    expect(trygtNavn(null)).toBe('bilag');
  });

  it('holder navnet kort nok', () => {
    expect(trygtNavn('a'.repeat(300)).length).toBeLessThanOrEqual(80);
  });
});

describe('mappe', () => {
  it('legger Felles PSI under «psi»', () => {
    // Samme mappenavn som bildene bruker, og tilgangsregelen i 0012
    // kjenner det igjen.
    expect(mappe(null)).toBe('psi');
    expect(mappe('fotball')).toBe('fotball');
  });
});

/* En liten stubb av supabase-klienten. Nok til å se at spørringene går
   dit de skal, og at opprydding skjer når noe feiler. */
function stubb({ feilPå = null, insertFeil = null } = {}) {
  const kall = [];
  const fjernet = [];
  const svar = (navn) => ({
    select: () => svar(navn), order: () => svar(navn), eq: () => svar(navn), in: () => svar(navn), limit: () => svar(navn),
    single: () => svar(navn), insert: () => svar(navn), update: () => svar(navn), upsert: () => svar(navn), delete: () => svar(navn),
    then: (f) => f({ data: [], error: feilPå === navn ? { code: '42P01', message: 'relation does not exist' } : null }),
  });
  return {
    kall, fjernet,
    from: (navn) => { kall.push(navn); return svar(navn); },
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        remove: async (p) => { fjernet.push(...p); return { error: null }; },
      }),
    },
  };
}

describe('hentØkonomi', () => {
  it('sier fra når migrasjonen mangler, i stedet for å kaste', async () => {
    // Uten 0012 finnes ingen av tabellene. Admin skal si «kjør
    // migrasjonen», ikke framstå som nede.
    const r = await hentØkonomi(stubb({ feilPå: 'bilag' }));
    expect(r.mangler).toBe(true);
    expect(r.bilag).toEqual([]);
  });

  it('henter alle tabellene, hovedboken inkludert', async () => {
    const s = stubb();
    await hentØkonomi(s);
    expect(s.kall.sort()).toEqual([
      'bilag', 'budsjett_perioder', 'budsjett_poster', 'budsjett_tildeling',
      'hovedbok_avdeling', 'hovedbok_import', 'hovedbok_linjer', 'utlegg',
    ]);
  });

  it('lar resten virke når bare hovedbokmigrasjonen mangler', async () => {
    // 0013 kan mangle selv om 0012 er kjørt. Budsjett og bilag skal ikke
    // slutte å virke av den grunn.
    const r = await hentØkonomi(stubb({ feilPå: 'hovedbok_linjer' }));
    expect(r.mangler).toBe(false);
    expect(r.utenHovedbok).toBe(true);
    expect(r.hovedbok).toEqual([]);
  });
});

describe('koblingAv', () => {
  it('lager oppslag fra avdeling til gruppe', () => {
    expect(koblingAv([{ avdeling: '10', sport_slug: 'fotball' }, { avdeling: '9', sport_slug: null }]))
      .toEqual({ 10: 'fotball', 9: null });
  });

  it('skiller «koblet til Felles PSI» fra «ikke koblet»', () => {
    // Felles PSI har sport_slug null. Det er en kobling, ikke fraværet
    // av en – og importen må ikke spørre om den.
    const k = koblingAv([{ avdeling: '9', sport_slug: null }]);
    expect('9' in k).toBe(true);
    expect(k['9']).toBe(null);
    expect('11' in k).toBe(false);
  });
});

describe('lastOppBilag', () => {
  it('avviser fila før den lastes opp', async () => {
    const s = stubb();
    const r = await db.lastOppBilag({ name: 'a.xlsx', type: 'x', size: 10 }, { sportSlug: 'fotball', rad: {}, client: s });
    expect(r.error.message).toMatch(/Bare bilder/);
    expect(s.kall).toEqual([]);
  });
});
