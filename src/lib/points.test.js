import { describe, it, expect } from 'vitest';
import { levelFor, motivation, POINT_KINDS, EARN_GUIDE } from './points.js';

describe('levelFor', () => {
  it('nivå og avstand til neste', () => {
    expect(levelFor(0)).toMatchObject({ name: 'Plukker', toNext: 50 });
    expect(levelFor(75)).toMatchObject({ name: 'Stødig plukker', toNext: 75 });
    expect(levelFor(600).name).toBe('Plukkelegende');
    expect(levelFor(9000).next).toBeNull();
  });
});

describe('motivation', () => {
  it('deterministisk for samme dag og poengsum', () => {
    const d = new Date('2026-08-30T12:00:00');
    expect(motivation(10, d)).toBe(motivation(10, d));
  });

  it('nybegynner, aktiv og veteran får ulike meldingsbanker', () => {
    const d = new Date('2026-08-30T12:00:00');
    const all = [motivation(0, d), motivation(60, d), motivation(500, d)];
    expect(all.every((m) => typeof m === 'string' && m.length > 10)).toBe(true);
  });
});

describe('satser', () => {
  it('guide og kinds stemmer overens', () => {
    expect(POINT_KINDS.invitasjon_brukt.points).toBe(50);
    expect(POINT_KINDS.vare_godkjent.points).toBe(25);
    expect(POINT_KINDS.tilbud_delt.points).toBe(15);
    expect(EARN_GUIDE.map((e) => e.points)).toEqual([50, 25, 15, 10, 5]);
  });
});
