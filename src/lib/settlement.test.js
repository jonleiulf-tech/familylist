import { describe, it, expect } from 'vitest';
import { spendByPerson, calculateSettlement, settleUp } from './settlement.js';

const MEMBERS = [
  { user_id: 'pal', display_name: 'Pål' },
  { user_id: 'jon', display_name: 'Jon' },
  { user_id: 'kari', display_name: 'Kari' },
];

const item = (price, qty, checked_by, checked = true) =>
  ({ price, qty, checked_by, checked });

describe('spendByPerson', () => {
  it('summerer per person', () => {
    const { totals } = spendByPerson([
      item(100, 2, 'pal'), item(50, 1, 'pal'), item(300, 1, 'jon'),
    ], MEMBERS);
    expect(totals.get('pal')).toBe(250);
    expect(totals.get('jon')).toBe(300);
    expect(totals.get('kari')).toBe(0);
  });

  it('teller ikke uplukkede varer', () => {
    const { totals } = spendByPerson([item(100, 1, 'pal', false)], MEMBERS);
    expect(totals.get('pal')).toBe(0);
  });

  it('samler varer uten kjent kjøper for seg', () => {
    const { unassigned } = spendByPerson([item(100, 1, null)], MEMBERS);
    expect(unassigned).toBe(100);
  });

  it('regner varer fra en som har forlatt listen som ufordelt', () => {
    const { unassigned } = spendByPerson([item(100, 1, 'borte')], MEMBERS);
    expect(unassigned).toBe(100);
  });

  it('hopper over varer uten pris', () => {
    const { totals } = spendByPerson([item(null, 1, 'pal'), item(0, 1, 'pal')], MEMBERS);
    expect(totals.get('pal')).toBe(0);
  });
});

describe('calculateSettlement — hyttetur-eksempelet', () => {
  // Tre stykker, lista kommer på 1500. Rettferdig andel er 500 hver.
  const items = [
    item(500, 1, 'pal'),
    item(1000, 1, 'jon'),
  ];

  it('regner ut total og andel', () => {
    const s = calculateSettlement(items, MEMBERS);
    expect(s.total).toBe(1500);
    expect(s.share).toBe(500);
  });

  it('Pål som handlet for 500 går i null', () => {
    const s = calculateSettlement(items, MEMBERS);
    const pal = s.balances.find((b) => b.user_id === 'pal');
    expect(pal.spent).toBe(500);
    expect(pal.balance).toBe(0);
  });

  it('Jon har lagt ut 500 for mye', () => {
    const s = calculateSettlement(items, MEMBERS);
    expect(s.balances.find((b) => b.user_id === 'jon').balance).toBe(500);
  });

  it('Kari som ikke handlet skylder sin andel', () => {
    const s = calculateSettlement(items, MEMBERS);
    expect(s.balances.find((b) => b.user_id === 'kari').balance).toBe(-500);
  });

  it('foreslår én overføring: Kari betaler Jon 500', () => {
    const s = calculateSettlement(items, MEMBERS);
    expect(s.transfers).toHaveLength(1);
    expect(s.transfers[0]).toMatchObject({ from: 'Kari', to: 'Jon', amount: 500 });
  });
});

describe('calculateSettlement — andre tilfeller', () => {
  it('alle har handlet like mye: ingen overføringer', () => {
    const s = calculateSettlement([
      item(300, 1, 'pal'), item(300, 1, 'jon'), item(300, 1, 'kari'),
    ], MEMBERS);
    expect(s.transfers).toHaveLength(0);
    expect(s.balances.every((b) => b.balance === 0)).toBe(true);
  });

  it('kan begrense hvem som deler regningen', () => {
    // Kari er med på listen, men skal ikke være med på spleisen.
    const s = calculateSettlement([item(1000, 1, 'jon')], MEMBERS, {
      splitAmong: ['pal', 'jon'],
    });
    expect(s.share).toBe(500);
    expect(s.balances.find((b) => b.user_id === 'kari').balance).toBe(0);
    expect(s.balances.find((b) => b.user_id === 'pal').balance).toBe(-500);
  });

  it('tar med ufordelte beløp i totalen', () => {
    const s = calculateSettlement([item(300, 1, null)], MEMBERS);
    expect(s.total).toBe(300);
    expect(s.unassigned).toBe(300);
    expect(s.share).toBe(100);
  });

  it('takler tom liste', () => {
    const s = calculateSettlement([], MEMBERS);
    expect(s.total).toBe(0);
    expect(s.transfers).toEqual([]);
  });

  it('takler én person alene', () => {
    const s = calculateSettlement([item(500, 1, 'pal')], [MEMBERS[0]]);
    expect(s.balances[0].balance).toBe(0);
    expect(s.transfers).toEqual([]);
  });

  it('runder til to desimaler', () => {
    const s = calculateSettlement([item(100, 1, 'pal')], MEMBERS);
    expect(s.share).toBe(33.33);
  });
});

describe('settleUp', () => {
  it('holder antall overføringer nede', () => {
    // To skylder, én har til gode -> to overføringer, ikke flere.
    const transfers = settleUp([
      { user_id: 'a', display_name: 'A', balance: -100 },
      { user_id: 'b', display_name: 'B', balance: -50 },
      { user_id: 'c', display_name: 'C', balance: 150 },
    ]);
    expect(transfers).toHaveLength(2);
    expect(transfers.every((t) => t.to === 'C')).toBe(true);
  });

  it('summen av overføringer dekker gjelden', () => {
    const transfers = settleUp([
      { user_id: 'a', display_name: 'A', balance: -200 },
      { user_id: 'b', display_name: 'B', balance: 120 },
      { user_id: 'c', display_name: 'C', balance: 80 },
    ]);
    expect(transfers.reduce((s, t) => s + t.amount, 0)).toBe(200);
  });

  it('ignorerer øresmå avvik', () => {
    expect(settleUp([
      { user_id: 'a', display_name: 'A', balance: -0.005 },
      { user_id: 'b', display_name: 'B', balance: 0.005 },
    ])).toEqual([]);
  });

  it('returnerer tomt når alle står i null', () => {
    expect(settleUp([{ user_id: 'a', display_name: 'A', balance: 0 }])).toEqual([]);
  });
});
