import type { ProjectHealth } from '@/types/enums';

/**
 * Transparent regelmotor for prosjekthelse. Ingen "AI"-magi – kun tydelige
 * terskler man kan lese rett fra koden, og en forklaringstekst som viser
 * NØYAKTIG hvorfor prosjektet fikk sin status.
 *
 * Kalibrering (jf. spec-eksempelet "Gul – 2 oppgaver er forfalt og én
 * milepæl ligger 1 uke etter plan"):
 *
 *   RØD   – minst én milepæl VESENTLIG forsinket (≥ 14 dager), eller
 *           timeforbruk ≥ 30 % over plan.
 *   GUL   – forfalte oppgaver, mindre forsinkede milepæler (< 14 dager),
 *           eller timeforbruk ≥ 15 % over plan.
 *   GRØNN – ingen av delene.
 */
export interface HealthInput {
  overdueTaskCount: number;
  /** Antall milepæler som ligger etter plan (uansett hvor mye). */
  milestonesBehindSchedule: number;
  /** Største forsinkelse i dager blant milepælene som ligger etter plan. */
  maxMilestoneDelayDays?: number;
  /** Signert prosentvis avvik (registrert vs. plan), f.eks. 30 for +30 %. */
  timeVariancePercent: number | null;
}

export interface HealthResult {
  health: ProjectHealth;
  reasons: string[];
}

export const HEALTH_THRESHOLDS = {
  severeDelayDays: 14,
  redTimeVariancePercent: 30,
  yellowTimeVariancePercent: 15,
} as const;

function describeDelay(count: number, maxDelayDays: number | undefined): string {
  const subject = count === 1 ? 'én milepæl ligger' : `${count} milepæler ligger`;
  if (maxDelayDays == null || maxDelayDays <= 0) return `${subject} etter plan`;
  if (maxDelayDays % 7 === 0) {
    const weeks = maxDelayDays / 7;
    return `${subject} ${weeks} ${weeks === 1 ? 'uke' : 'uker'} etter plan`;
  }
  return `${subject} ${maxDelayDays} ${maxDelayDays === 1 ? 'dag' : 'dager'} etter plan`;
}

function describeOverdue(count: number): string {
  return count === 1 ? 'én oppgave er forfalt' : `${count} oppgaver er forfalt`;
}

export function computeProjectHealth(input: HealthInput): HealthResult {
  const severeDelay =
    input.milestonesBehindSchedule > 0 &&
    (input.maxMilestoneDelayDays ?? 0) >= HEALTH_THRESHOLDS.severeDelayDays;
  const severeTimeOverrun =
    input.timeVariancePercent != null &&
    input.timeVariancePercent >= HEALTH_THRESHOLDS.redTimeVariancePercent;

  if (severeDelay || severeTimeOverrun) {
    const reasons: string[] = [];
    if (severeDelay) reasons.push(describeDelay(input.milestonesBehindSchedule, input.maxMilestoneDelayDays));
    if (severeTimeOverrun) reasons.push(`timeforbruket ligger ${input.timeVariancePercent} % over plan`);
    if (input.overdueTaskCount > 0) reasons.push(describeOverdue(input.overdueTaskCount));
    return { health: 'red', reasons };
  }

  const minorDelay = input.milestonesBehindSchedule > 0;
  const minorTimeOverrun =
    input.timeVariancePercent != null &&
    input.timeVariancePercent >= HEALTH_THRESHOLDS.yellowTimeVariancePercent;
  const overdueTasks = input.overdueTaskCount > 0;

  if (overdueTasks || minorDelay || minorTimeOverrun) {
    const reasons: string[] = [];
    if (overdueTasks) reasons.push(describeOverdue(input.overdueTaskCount));
    if (minorDelay) reasons.push(describeDelay(input.milestonesBehindSchedule, input.maxMilestoneDelayDays));
    if (minorTimeOverrun) reasons.push(`timeforbruket ligger ${input.timeVariancePercent} % over plan`);
    return { health: 'yellow', reasons };
  }

  return { health: 'green', reasons: ['ingen kritiske avvik'] };
}

/** Bygger den norske forklaringssetningen brukt på dashboardet. */
export function formatHealthExplanation(result: HealthResult): string {
  const prefix = result.health === 'green' ? 'Grønn' : result.health === 'yellow' ? 'Gul' : 'Rød';
  const [first, ...rest] = result.reasons;
  if (!first) return `${prefix}.`;
  const capitalized = first.charAt(0).toUpperCase() + first.slice(1);
  if (rest.length === 0) return `${prefix} – ${capitalized}.`;
  const last = rest[rest.length - 1]!;
  const middle = rest.slice(0, -1);
  return `${prefix} – ${[capitalized, ...middle].join(', ')} og ${last}.`;
}
