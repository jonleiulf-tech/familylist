import type { Milestone } from '@/types/database';
import { daysBetween, weeksBetween } from '@/lib/dates/iso-week';

export interface MilestoneHoursInput {
  milestone: Pick<
    Milestone,
    | 'estimated_hours'
    | 'estimated_hours_per_week'
    | 'planned_start_date'
    | 'planned_end_date'
    | 'actual_start_date'
    | 'actual_end_date'
  >;
  /** Sum av alle registrerte TimeEntry.duration_minutes koblet til milepælen. */
  loggedMinutes: number;
}

export interface VarianceResult {
  /** Avvik i minutter (loggedMinutes - referanseMinutter). */
  varianceMinutes: number;
  /** Avvik i prosent av referansen. Null hvis referansen er 0 (unngår div/0). */
  variancePercent: number | null;
}

/**
 * Planlagt estimert timeforbruk i minutter.
 *
 * Primært brukes milestone.estimated_hours direkte (den mest presise kilden).
 * Dersom denne mangler, faller vi tilbake på Excel-kompatibel modell:
 * timer/uke × planlagt varighet i uker.
 */
export function plannedEstimatedMinutes(
  m: MilestoneHoursInput['milestone'],
): number | null {
  if (m.estimated_hours != null) return Math.round(m.estimated_hours * 60);
  if (m.estimated_hours_per_week != null && m.planned_start_date && m.planned_end_date) {
    const weeks = weeksBetween(m.planned_start_date, m.planned_end_date);
    return Math.round(m.estimated_hours_per_week * weeks * 60);
  }
  return null;
}

/**
 * Referansetimer basert på FAKTISK varighet (timer/uke × faktiske uker).
 * Brukes til å måle om vi brukte mer/mindre tid enn det den faktiske
 * tidsbruken skulle tilsi – uavhengig av opprinnelig plan.
 */
export function actualReferenceMinutes(
  m: MilestoneHoursInput['milestone'],
): number | null {
  if (m.estimated_hours_per_week == null) return null;
  if (!m.actual_start_date || !m.actual_end_date) return null;
  const weeks = weeksBetween(m.actual_start_date, m.actual_end_date);
  return Math.round(m.estimated_hours_per_week * weeks * 60);
}

function variance(loggedMinutes: number, referenceMinutes: number | null): VarianceResult {
  if (referenceMinutes == null) {
    return { varianceMinutes: loggedMinutes, variancePercent: null };
  }
  const varianceMinutes = loggedMinutes - referenceMinutes;
  const variancePercent =
    referenceMinutes === 0 ? null : Math.round((varianceMinutes / referenceMinutes) * 1000) / 10;
  return { varianceMinutes, variancePercent };
}

/** Avvik mot PLANLAGT estimert timebruk. */
export function plannedVariance(input: MilestoneHoursInput): VarianceResult {
  return variance(input.loggedMinutes, plannedEstimatedMinutes(input.milestone));
}

/** Avvik mot referansetimer utledet av FAKTISK varighet. */
export function actualVariance(input: MilestoneHoursInput): VarianceResult {
  return variance(input.loggedMinutes, actualReferenceMinutes(input.milestone));
}

export function plannedDurationDays(
  m: Pick<Milestone, 'planned_start_date' | 'planned_end_date'>,
): number | null {
  if (!m.planned_start_date || !m.planned_end_date) return null;
  return daysBetween(m.planned_start_date, m.planned_end_date);
}

export function actualDurationDays(
  m: Pick<Milestone, 'actual_start_date' | 'actual_end_date'>,
): number | null {
  if (!m.actual_start_date || !m.actual_end_date) return null;
  return daysBetween(m.actual_start_date, m.actual_end_date);
}

/**
 * Forsinkelse i dager: hvor mange dager etter planlagt sluttdato milepælen
 * enten ble avsluttet (fullført), eller – hvis den ikke er avsluttet – står
 * i dag. Negativt tall betyr i forkant av plan.
 *
 * Null når det ikke kan beregnes: planlagt sluttdato mangler, eller
 * milepælen er fullført uten registrert faktisk sluttdato (da vet vi ikke
 * NÅR den ble ferdig, og skal ikke telle den som "forsinket for alltid").
 */
export function delayDays(
  m: Pick<Milestone, 'planned_end_date' | 'actual_end_date' | 'status'>,
  today: string | Date = new Date(),
): number | null {
  if (!m.planned_end_date) return null;
  if (m.status === 'completed') {
    return m.actual_end_date ? daysBetween(m.planned_end_date, m.actual_end_date) : null;
  }
  return daysBetween(m.planned_end_date, today);
}

export function isMilestoneDelayed(
  m: Pick<Milestone, 'planned_end_date' | 'actual_end_date' | 'status'>,
  today: string | Date = new Date(),
): boolean {
  const delay = delayDays(m, today);
  return delay != null && delay > 0;
}
