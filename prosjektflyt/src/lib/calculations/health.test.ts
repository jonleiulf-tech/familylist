import { describe, expect, it } from 'vitest';
import { computeProjectHealth, formatHealthExplanation } from './health';

describe('computeProjectHealth', () => {
  it('grønn uten avvik', () => {
    const result = computeProjectHealth({
      overdueTaskCount: 0,
      milestonesBehindSchedule: 0,
      timeVariancePercent: 5,
    });
    expect(result.health).toBe('green');
    expect(formatHealthExplanation(result)).toBe('Grønn – Ingen kritiske avvik.');
  });

  it('gul ved forfalte oppgaver', () => {
    const result = computeProjectHealth({
      overdueTaskCount: 2,
      milestonesBehindSchedule: 0,
      timeVariancePercent: 0,
    });
    expect(result.health).toBe('yellow');
    expect(formatHealthExplanation(result)).toBe('Gul – 2 oppgaver er forfalt.');
  });

  it('matcher spec-eksempelet: "Gul – 2 oppgaver er forfalt og én milepæl ligger 1 uke etter plan."', () => {
    const result = computeProjectHealth({
      overdueTaskCount: 2,
      milestonesBehindSchedule: 1,
      maxMilestoneDelayDays: 7,
      timeVariancePercent: 10,
    });
    expect(result.health).toBe('yellow');
    expect(formatHealthExplanation(result)).toBe(
      'Gul – 2 oppgaver er forfalt og én milepæl ligger 1 uke etter plan.',
    );
  });

  it('rød ved vesentlig forsinket milepæl (≥ 14 dager)', () => {
    const result = computeProjectHealth({
      overdueTaskCount: 0,
      milestonesBehindSchedule: 1,
      maxMilestoneDelayDays: 21,
      timeVariancePercent: 0,
    });
    expect(result.health).toBe('red');
    expect(formatHealthExplanation(result)).toBe('Rød – Én milepæl ligger 3 uker etter plan.');
  });

  it('rød ved stort timeavvik selv uten forsinkede milepæler', () => {
    const result = computeProjectHealth({
      overdueTaskCount: 0,
      milestonesBehindSchedule: 0,
      timeVariancePercent: 35,
    });
    expect(result.health).toBe('red');
    expect(formatHealthExplanation(result)).toBe('Rød – Timeforbruket ligger 35 % over plan.');
  });

  it('gul ved moderat timeavvik (15–30 %)', () => {
    const result = computeProjectHealth({
      overdueTaskCount: 0,
      milestonesBehindSchedule: 0,
      timeVariancePercent: 20,
    });
    expect(result.health).toBe('yellow');
  });

  it('lister flere årsaker med komma og "og"', () => {
    const result = computeProjectHealth({
      overdueTaskCount: 1,
      milestonesBehindSchedule: 2,
      maxMilestoneDelayDays: 3,
      timeVariancePercent: 18,
    });
    expect(result.health).toBe('yellow');
    expect(formatHealthExplanation(result)).toBe(
      'Gul – Én oppgave er forfalt, 2 milepæler ligger 3 dager etter plan og timeforbruket ligger 18 % over plan.',
    );
  });
});
