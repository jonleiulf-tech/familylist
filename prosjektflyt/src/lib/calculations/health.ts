import type { ProjectHealth } from '@/types/enums';

/**
 * Transparent regelmotor for prosjekthelse. Ingen "AI"-magi – kun tydelige
 * terskler man kan lese rett fra koden, og en forklaringstekst som viser
 * NØYAKTIG hvorfor prosjektet fikk sin status.
 */
export interface HealthInput {
  overdueTaskCount: number;
  milestonesBehindSchedule: number;
  /** Signert prosentvis avvik (registrert vs. plan), f.eks. 30 for +30 %. */
  timeVariancePercent: number | null;
}

export interface HealthResult {
  health: ProjectHealth;
  reasons: string[];
}

const RED_MILESTONES_BEHIND = 1;
const RED_TIME_VARIANCE_PERCENT = 30;
const YELLOW_OVERDUE_TASKS = 1;
const YELLOW_TIME_VARIANCE_PERCENT = 15;

export function computeProjectHealth(input: HealthInput): HealthResult {
  const reasons: string[] = [];

  const majorMilestoneDelay = input.milestonesBehindSchedule >= RED_MILESTONES_BEHIND;
  const majorTimeOverrun =
    input.timeVariancePercent != null && input.timeVariancePercent >= RED_TIME_VARIANCE_PERCENT;

  if (majorMilestoneDelay || majorTimeOverrun) {
    if (majorMilestoneDelay) {
      reasons.push(
        `${input.milestonesBehindSchedule} ${input.milestonesBehindSchedule === 1 ? 'milepæl ligger' : 'milepæler ligger'} etter plan`,
      );
    }
    if (majorTimeOverrun) {
      reasons.push(`timeforbruk ligger ${input.timeVariancePercent}% over plan`);
    }
    return { health: 'red', reasons };
  }

  const someOverdueTasks = input.overdueTaskCount >= YELLOW_OVERDUE_TASKS;
  const minorTimeOverrun =
    input.timeVariancePercent != null && input.timeVariancePercent >= YELLOW_TIME_VARIANCE_PERCENT;

  if (someOverdueTasks || minorTimeOverrun) {
    if (someOverdueTasks) {
      reasons.push(
        `${input.overdueTaskCount} ${input.overdueTaskCount === 1 ? 'oppgave er forfalt' : 'oppgaver er forfalt'}`,
      );
    }
    if (minorTimeOverrun) {
      reasons.push(`timeforbruk ligger ${input.timeVariancePercent}% over plan`);
    }
    return { health: 'yellow', reasons };
  }

  return { health: 'green', reasons: ['Ingen kritiske avvik'] };
}

/** Bygger den norske forklaringssetningen brukt på dashboardet. */
export function formatHealthExplanation(result: HealthResult): string {
  const prefix =
    result.health === 'green' ? 'Grønn' : result.health === 'yellow' ? 'Gul' : 'Rød';
  if (result.health === 'green') return `${prefix} – ${result.reasons[0]}.`;
  return `${prefix} – ${result.reasons.join(' og ')}.`;
}
