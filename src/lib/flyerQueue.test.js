import { describe, it, expect } from 'vitest';
import {
  guessStore, buildQueue, queueSummary, reviewRows, importable,
  MAX_FILES, MAX_PDF_BYTES,
} from './flyerQueue.js';

const STORES = [
  { code: 'KIWI', name: 'KIWI' },
  { code: 'REMA_1000', name: 'Rema 1000' },
  { code: 'COOP_EXTRA', name: 'Coop Extra' },
  { code: 'COOP_MEGA', name: 'Coop Mega' },
  { code: 'MENY_NO', name: 'Meny' },
  { code: 'BUNNPRIS', name: 'Bunnpris' },
];

const pdf = (name, size = 1000) => ({ name, size, type: 'application/pdf' });
const jpg = (name, size = 1000) => ({ name, size, type: 'image/jpeg' });

describe('guessStore — filnavnet er butikkens egen merking', () => {
  it('kjenner igjen kjeden i navnet', () => {
    expect(guessStore('kiwi-uke36.pdf', STORES)).toBe('KIWI');
    expect(guessStore('Bunnpris_uke_36.pdf', STORES)).toBe('BUNNPRIS');
    expect(guessStore('meny uke 36.pdf', STORES)).toBe('MENY_NO');
  });

  it('tar det lengste treffet, ikke det første', () => {
    // «coop» alene ville truffet Coop Extra like godt som Coop Mega.
    expect(guessStore('coop-extra-uke36.pdf', STORES)).toBe('COOP_EXTRA');
    expect(guessStore('CoopMega.pdf', STORES)).toBe('COOP_MEGA');
    expect(guessStore('rema1000.pdf', STORES)).toBe('REMA_1000');
    expect(guessStore('rema 1000 uke 36.pdf', STORES)).toBe('REMA_1000');
  });

  it('bryr seg ikke om skrivemåte, bindestreker eller store bokstaver', () => {
    expect(guessStore('REMA-1000_UKE36.PDF', STORES)).toBe('REMA_1000');
    expect(guessStore('Rema1000(1).pdf', STORES)).toBe('REMA_1000');
  });

  it('gjetter ikke når det ikke er grunnlag', () => {
    expect(guessStore('dokument (3).pdf', STORES)).toBeNull();
    expect(guessStore('', STORES)).toBeNull();
    expect(guessStore(undefined, STORES)).toBeNull();
    expect(guessStore('kiwi.pdf', [])).toBeNull();
  });
});

describe('buildQueue', () => {
  it('lager én rad per fil, med gjettet butikk', () => {
    const { items, rejected } = buildQueue([pdf('kiwi.pdf'), pdf('meny.pdf')], { stores: STORES });
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.store)).toEqual(['KIWI', 'MENY_NO']);
    expect(rejected).toHaveLength(0);
    expect(items.every((i) => i.status === 'venter')).toBe(true);
  });

  it('faller tilbake på den valgte butikken når navnet ikke sier noe', () => {
    const { items } = buildQueue([pdf('avis.pdf')], { stores: STORES, fallbackStore: 'KIWI' });
    expect(items[0].store).toBe('KIWI');
  });

  it('avviser en for stor PDF, men beholder resten', () => {
    const { items, rejected } = buildQueue(
      [pdf('kiwi.pdf'), pdf('meny.pdf', MAX_PDF_BYTES + 1)], { stores: STORES });
    expect(items).toHaveLength(1);
    expect(rejected[0]).toMatchObject({ name: 'meny.pdf' });
    expect(rejected[0].reason).toContain('9 MB');
  });

  it('store bilder slipper gjennom — de skaleres ned i nettleseren først', () => {
    const { items, rejected } = buildQueue([jpg('foto.jpg', 40 * 1024 * 1024)], { stores: STORES });
    expect(items).toHaveLength(1);
    expect(rejected).toHaveLength(0);
  });

  it('setter en grense på antall filer', () => {
    const many = Array.from({ length: MAX_FILES + 3 }, (_, i) => pdf(`avis${i}.pdf`));
    const { items, rejected } = buildQueue(many, { stores: STORES });
    expect(items).toHaveLength(MAX_FILES);
    expect(rejected).toHaveLength(3);
  });

  it('to filer med samme navn får ulik id', () => {
    const { items } = buildQueue([pdf('avis.pdf'), pdf('avis.pdf')], { stores: STORES });
    expect(items[0].id).not.toBe(items[1].id);
  });

  it('takler at ingenting ble valgt', () => {
    expect(buildQueue(null).items).toEqual([]);
    expect(buildQueue([]).items).toEqual([]);
  });
});

describe('queueSummary', () => {
  const q = [
    { status: 'klar', rows: [{}, {}, {}] },
    { status: 'klar', rows: [{}] },
    { status: 'feil', rows: [] },
  ];

  it('teller ferdige filer og varer', () => {
    const s = queueSummary(q);
    expect(s).toMatchObject({ total: 3, done: 3, finished: true, failed: 1, files: 2, rows: 4 });
  });

  it('er ikke ferdig mens noe fortsatt leses', () => {
    expect(queueSummary([...q, { status: 'leser', rows: [] }]).finished).toBe(false);
    expect(queueSummary([{ status: 'venter', rows: [] }]).finished).toBe(false);
  });

  it('en tom kø er ikke «ferdig»', () => {
    expect(queueSummary([]).finished).toBe(false);
  });
});

describe('reviewRows — butikken følger raden', () => {
  const q = [
    { id: 'a', name: 'kiwi.pdf', store: 'KIWI', status: 'klar',
      rows: [{ name: 'Laks', price: 99 }, { name: 'Brød', price: 25 }] },
    { id: 'b', name: 'meny.pdf', store: 'MENY_NO', status: 'klar',
      rows: [{ name: 'Kylling', price: 79 }] },
    { id: 'c', name: 'ødelagt.pdf', store: 'KIWI', status: 'feil', rows: [] },
  ];

  it('samler alle radene, hver med sin egen butikk', () => {
    const rows = reviewRows(q);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.store)).toEqual(['KIWI', 'KIWI', 'MENY_NO']);
    expect(rows[0].fileName).toBe('kiwi.pdf');
  });

  it('filer som feilet tar ingen rader med seg', () => {
    expect(reviewRows(q).some((r) => r.fileId === 'c')).toBe(false);
  });

  it('alt er huket av som standard, men et nei respekteres', () => {
    const rows = reviewRows([{ id: 'x', name: 'a.pdf', store: 'KIWI', status: 'klar',
      rows: [{ name: 'A', price: 1 }, { name: 'B', price: 2, checked: false }] }]);
    expect(rows[0].checked).toBe(true);
    expect(rows[1].checked).toBe(false);
  });
});

describe('importable — hva som faktisk lagres', () => {
  it('krever navn, pris over null, butikk og hake', () => {
    const rows = [
      { checked: true, name: 'Laks', price: '99', store: 'KIWI' },
      { checked: false, name: 'Brød', price: '25', store: 'KIWI' },
      { checked: true, name: '  ', price: '25', store: 'KIWI' },
      { checked: true, name: 'Melk', price: '0', store: 'KIWI' },
      { checked: true, name: 'Ost', price: '49', store: null },
    ];
    expect(importable(rows).map((r) => r.name)).toEqual(['Laks']);
  });

  it('komma som desimalskilletegn er lov — folk skriver 24,90', () => {
    expect(importable([{ checked: true, name: 'Laks', price: '24,90', store: 'KIWI' }])).toHaveLength(1);
  });
});
