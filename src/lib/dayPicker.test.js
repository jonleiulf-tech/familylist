import { describe, it, expect } from 'vitest';
import {
  pickerDays, weekGroups, weekStart, isoWeek, dayNote, moveRows, HORIZON_DAYS,
} from './dayPicker.js';

const PLAN = [
  { plan_date: '2026-09-04', meal_name: 'Taco' },
  { plan_date: '2026-09-05', meal_name: 'Pizza', locked: true },
  { plan_date: '2026-09-06', skipped: true },
  { plan_date: '2026-09-07', meal_name: 'Lasagne', sent_to_list_at: '2026-09-01T10:00:00Z' },
];
const days = (opts) => pickerDays(PLAN, { today: '2026-09-02', days: 10, ...opts });

describe('weekStart — uken starter på mandag', () => {
  it('finner mandagen, også fra en søndag', () => {
    expect(weekStart('2026-09-02')).toBe('2026-08-31');   // onsdag → mandag
    expect(weekStart('2026-08-31')).toBe('2026-08-31');   // mandag → seg selv
    expect(weekStart('2026-09-06')).toBe('2026-08-31');   // søndag hører til uken før
  });
});

describe('isoWeek', () => {
  it('gir ukenummeret folk mener når de sier «uke 36»', () => {
    expect(isoWeek('2026-09-02')).toBe(36);
    expect(isoWeek('2026-01-01')).toBe(1);
  });

  it('nyttårsuken havner i riktig år', () => {
    // 3. januar 2027 er en søndag og hører til uke 53 av 2026.
    expect(isoWeek('2027-01-03')).toBe(53);
    expect(isoWeek('2027-01-04')).toBe(1);
  });
});

describe('pickerDays', () => {
  it('starter i dag og går sammenhengende framover', () => {
    const d = days();
    expect(d[0].date).toBe('2026-09-02');
    expect(d[0].isToday).toBe(true);
    expect(d[9].date).toBe('2026-09-11');
    expect(d).toHaveLength(10);
  });

  it('viser retten som ligger der', () => {
    const d = days();
    expect(d.find((x) => x.date === '2026-09-04')).toMatchObject({ status: 'opptatt', mealName: 'Taco' });
  });

  it('en låst dag er låst, ikke bare opptatt', () => {
    // Låsen er satt med vilje av noen. Den skal ikke kunne overkjøres i farten.
    expect(days().find((x) => x.date === '2026-09-05')).toMatchObject({ status: 'låst', locked: true });
  });

  it('en hoppet dag er ledig å bruke, men ikke «ledig»', () => {
    const d = days().find((x) => x.date === '2026-09-06');
    expect(d.status).toBe('hoppet');
    expect(d.mealName).toBeNull();
  });

  it('dager som ikke finnes i planen tas med som ledige', () => {
    // Databasen oppretter raden når middagen settes, så det er ingen grunn
    // til å nekte noen å planlegge to uker fram.
    const d = days().find((x) => x.date === '2026-09-10');
    expect(d).toMatchObject({ inPlan: false, status: 'ledig' });
  });

  it('husker at dagen er sendt til handlelisten', () => {
    expect(days().find((x) => x.date === '2026-09-07').sent).toBe(true);
  });

  it('takler tidsstempler i plan_date', () => {
    const d = pickerDays([{ plan_date: '2026-09-03T00:00:00+00:00', meal_name: 'Fisk' }],
      { today: '2026-09-02', days: 3 });
    expect(d[1]).toMatchObject({ mealName: 'Fisk', status: 'opptatt' });
  });

  it('tom plan gir bare ledige dager', () => {
    const d = pickerDays([], { today: '2026-09-02', days: 5 });
    expect(d.every((x) => x.status === 'ledig')).toBe(true);
  });

  it('standard horisont er fire uker', () => {
    expect(HORIZON_DAYS).toBe(28);
    expect(pickerDays([], { today: '2026-09-02' })).toHaveLength(28);
  });
});

describe('weekGroups', () => {
  it('deler i uker og navngir de to første', () => {
    const g = weekGroups(days());
    expect(g[0].label).toBe('Denne uken');
    expect(g[1].label).toBe('Neste uke');
    expect(g[0].days).toHaveLength(5);   // ons–søn
  });

  it('senere uker får ukenummer', () => {
    const g = weekGroups(pickerDays([], { today: '2026-09-02', days: 28 }));
    expect(g[2].label).toMatch(/^Uke \d+$/);
  });

  it('teller ledige dager per uke', () => {
    const g = weekGroups(days());
    expect(g[0].free).toBe(2);           // ons og tor; fre/lør/søn er tatt
  });

  it('tom liste gir ingen uker', () => {
    expect(weekGroups([])).toEqual([]);
  });
});

describe('dayNote — teksten på dagen', () => {
  it('«Ledig» er et tilbud, et navn er en advarsel', () => {
    expect(dayNote({ status: 'ledig' })).toBe('Ledig');
    expect(dayNote({ status: 'opptatt', mealName: 'Taco' })).toBe('Taco');
    expect(dayNote({ status: 'hoppet' })).toBe('Ingen middag denne dagen');
    expect(dayNote({ status: 'låst', mealName: 'Pizza' })).toBe('Låst · Pizza');
    expect(dayNote({ status: 'låst' })).toBe('Låst');
    expect(dayNote(null)).toBe('');
  });
});

describe('moveRows — flytting og bytte', () => {
  const H = 'hh';
  const pannekaker = { plan_date: '2026-09-01', meal_id: 'm1', meal_name: 'Pannekaker' };
  const fisk = { plan_date: '2026-09-03', meal_id: 'm2', meal_name: 'Fisk' };

  it('ledig måldag: middagen flytter, utgangsdagen tømmes', () => {
    const rows = moveRows({ householdId: H, fromDate: '2026-09-01', toDate: '2026-09-03',
      from: pannekaker, to: null });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ plan_date: '2026-09-03', meal_name: 'Pannekaker', meal_id: 'm1' });
    expect(rows[1]).toMatchObject({ plan_date: '2026-09-01', meal_name: null, meal_id: null });
  });

  it('opptatt måldag: de bytter plass', () => {
    // Fisken skal til tirsdag, ikke i søpla.
    const rows = moveRows({ householdId: H, fromDate: '2026-09-01', toDate: '2026-09-03',
      from: pannekaker, to: fisk });
    expect(rows[0]).toMatchObject({ plan_date: '2026-09-03', meal_name: 'Pannekaker' });
    expect(rows[1]).toMatchObject({ plan_date: '2026-09-01', meal_name: 'Fisk', meal_id: 'm2' });
  });

  it('en hoppet måldag er ledig, ikke en middag å bytte med', () => {
    const rows = moveRows({ householdId: H, fromDate: '2026-09-01', toDate: '2026-09-03',
      from: pannekaker, to: { plan_date: '2026-09-03', skipped: true, meal_name: null } });
    expect(rows[1].meal_name).toBeNull();
    expect(rows[0].skipped).toBe(false);   // måldagen er ikke hoppet lenger
  });

  it('«sendt til handlelisten» og gjester følger middagen', () => {
    const rows = moveRows({
      householdId: H, fromDate: '2026-09-01', toDate: '2026-09-03',
      from: { ...pannekaker, sent_to_list_at: '2026-08-30T10:00:00Z', guest_portions: 2 },
      to: { ...fisk, sent_to_list_at: null, guest_portions: 0 },
    });
    expect(rows[0]).toMatchObject({ sent_to_list_at: '2026-08-30T10:00:00Z', guest_portions: 2 });
    expect(rows[1]).toMatchObject({ sent_to_list_at: null, guest_portions: 0 });
  });

  it('gjør ingenting når det ikke er noe å flytte', () => {
    const base = { householdId: H, fromDate: '2026-09-01', toDate: '2026-09-03' };
    expect(moveRows({ ...base, from: null })).toBeNull();
    expect(moveRows({ ...base, from: { plan_date: '2026-09-01' } })).toBeNull();
    expect(moveRows({ ...base, toDate: '2026-09-01', from: pannekaker })).toBeNull();
    expect(moveRows({ ...base, householdId: null, from: pannekaker })).toBeNull();
  });

  it('samme dag begge veier er ikke en flytting', () => {
    expect(moveRows({ householdId: H, fromDate: '2026-09-01', toDate: '2026-09-01',
      from: pannekaker, to: pannekaker })).toBeNull();
  });
});
