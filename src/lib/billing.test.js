import { describe, it, expect } from 'vitest';
import {
  billingState, needsAttention, canWrite, daysUntil, today,
  PRICE_ORE, TRIAL_DAYS, GRACE_DAYS,
} from './billing.js';

const NOW = '2026-09-01';

describe('daysUntil', () => {
  it('teller hele dager, uten tidssoner å gå seg vill i', () => {
    expect(daysUntil('2026-09-08', NOW)).toBe(7);
    expect(daysUntil('2026-09-01', NOW)).toBe(0);
    expect(daysUntil('2026-08-30', NOW)).toBe(-2);
  });

  it('takler tidsstempler og søppel', () => {
    expect(daysUntil('2026-09-08T22:00:00Z', NOW)).toBe(7);
    expect(daysUntil(null, NOW)).toBeNull();
    expect(daysUntil('snart', NOW)).toBeNull();
  });

  it('dagens dato følger norsk tid, ikke UTC', () => {
    // 22:30 UTC er allerede neste dag i Norge om sommeren. Bommer vi her,
    // utløper abonnementer en dag for tidlig hver kveld.
    expect(today(new Date('2026-09-01T22:30:00Z'))).toBe('2026-09-02');
    expect(today(new Date('2026-09-01T09:00:00Z'))).toBe('2026-09-01');
  });
});

describe('billingState — hvem har tilgang', () => {
  it('grunnleggerne betaler aldri', () => {
    const s = billingState({ status: 'grunnlegger', paid_until: '2020-01-01' }, NOW);
    expect(s.access).toBe(true);
    expect(s.canSubscribe).toBe(false);
    expect(needsAttention(s)).toBe(false);
  });

  it('prøveperioden gjelder til og med siste dag', () => {
    expect(billingState({ status: 'prøve', paid_until: NOW }, NOW).access).toBe(true);
    expect(billingState({ status: 'prøve', paid_until: '2026-08-31' }, NOW).access).toBe(false);
  });

  it('maser først den siste uka av prøven', () => {
    expect(needsAttention(billingState({ status: 'prøve', paid_until: '2026-09-20' }, NOW))).toBe(false);
    expect(needsAttention(billingState({ status: 'prøve', paid_until: '2026-09-06' }, NOW))).toBe(true);
  });

  it('et aktivt abonnement som bare løper videre er ingen nyhet', () => {
    const s = billingState({ status: 'aktiv', paid_until: '2026-09-28' }, NOW);
    expect(needsAttention(s)).toBe(false);
    expect(s.detail).toContain('15 kr');
  });

  it('sagt opp: de har appen ut perioden, og vi sier det pent', () => {
    const s = billingState(
      { status: 'aktiv', paid_until: '2026-09-28', cancel_at_period_end: true }, NOW);
    expect(s.access).toBe(true);
    expect(s.title).toBe('Sagt opp');
    expect(needsAttention(s)).toBe(true);
  });

  it('forfalt kort gir fem nådedager, ikke stengt dør', () => {
    const grace = billingState({ status: 'forfalt', paid_until: '2026-08-28' }, NOW);
    expect(grace.access).toBe(true);     // 4 dager siden
    expect(grace.tone).toBe('snart');

    const over = billingState({ status: 'forfalt', paid_until: '2026-08-25' }, NOW);
    expect(over.access).toBe(false);     // 7 dager siden
    expect(over.tone).toBe('stengt');
  });

  it('nådeperioden er nøyaktig den samme som i databasen', () => {
    // household_has_access(): paid_until >= current_date - 5
    const edge = billingState({ status: 'forfalt', paid_until: '2026-08-27' }, NOW);
    expect(GRACE_DAYS).toBe(5);
    expect(edge.access).toBe(true);      // presis 5 dager
    expect(billingState({ status: 'forfalt', paid_until: '2026-08-26' }, NOW).access).toBe(false);
  });

  it('utløpt stenger, men truer ikke med å slette noe', () => {
    const s = billingState({ status: 'utløpt', paid_until: '2026-07-01' }, NOW);
    expect(s.access).toBe(false);
    expect(s.detail).toContain('ligger trygt');
    expect(s.canSubscribe).toBe(true);
  });

  it('poeng dekker som et abonnement gjør', () => {
    const s = billingState({ status: 'poeng', paid_until: '2026-10-01' }, NOW);
    expect(s.access).toBe(true);
    expect(s.detail).toContain('1. oktober');
  });

  it('mangler raden, stenger vi ingen ute på tvil', () => {
    // Samme valg som coalesce(..., true) i household_has_access().
    const s = billingState(null, NOW);
    expect(s.access).toBe(true);
    expect(needsAttention(s)).toBe(false);
  });

  it('en ukjent status låser ikke folk ute ved et uhell — den stenger bevisst', () => {
    // Faller til default. Vi vil heller se en tydelig feil enn en stille en.
    expect(billingState({ status: 'noe_nytt', paid_until: '2027-01-01' }, NOW).access).toBe(false);
  });
});

describe('den myke sperren', () => {
  it('avkryssing og lesing er alltid lov', () => {
    expect(canWrite(billingState({ status: 'prøve', paid_until: NOW }, NOW))).toBe(true);
  });

  it('men nye varer stopper når abonnementet er ute', () => {
    expect(canWrite(billingState({ status: 'utløpt', paid_until: '2026-01-01' }, NOW))).toBe(false);
  });
});

describe('prisen', () => {
  it('15 kr, oppgitt i øre slik Stripe vil ha det', () => {
    expect(PRICE_ORE).toBe(1500);
    expect(TRIAL_DAYS).toBe(30);
  });

  it('en husholdning med gammel pris beholder sin', () => {
    // Løftet i lanseringsposten: de som var med fra start taper ikke på
    // en senere prisøkning. Da må prisen leses fra raden, ikke fra koden.
    const s = billingState({ status: 'aktiv', paid_until: '2026-09-28', price_ore: 1500 }, NOW);
    expect(s.detail).toContain('15 kr');
    const dyr = billingState({ status: 'aktiv', paid_until: '2026-09-28', price_ore: 2900 }, NOW);
    expect(dyr.detail).toContain('29 kr');
  });
});
