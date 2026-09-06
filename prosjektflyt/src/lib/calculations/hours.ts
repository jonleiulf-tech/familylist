/**
 * Individuell vs. gruppetid.
 *
 * Excel-malen blander disse begrepene og bruker et "Student"-navnprefiks som
 * workaround for gruppetelling. Her skiller vi eksplisitt mellom:
 *
 * - SESSION HOURS: varigheten til selve TimeEntry-registreringen (hvor lenge
 *   møtet/aktiviteten varte, uavhengig av hvor mange som deltok).
 * - PERSON HOURS / arbeidsinnsats: session hours multiplisert med antall
 *   deltagere – dette er den reelle arbeidsinnsatsen lagt ned i aktiviteten.
 *
 * Eksempel: et møte på 1 time med 3 deltagere gir session hours = 1 t, men
 * person-hours (arbeidsinnsats) = 3 t, og hver deltager får 1 t gruppetid.
 */

export interface TimeEntryForHours {
  duration_minutes: number;
  participant_mode: 'single' | 'selected' | 'all';
  member_id: string;
  /** member_id-er for øvrige deltagere (participant_mode = 'selected'/'all'). */
  participantMemberIds: string[];
}

export interface MemberHoursSummary {
  memberId: string;
  individualMinutes: number;
  groupMinutes: number;
  totalMinutes: number;
  lastEntryDate: string | null;
}

function resolveParticipants(entry: TimeEntryForHours): string[] {
  if (entry.participant_mode === 'single') return [entry.member_id];
  // 'selected' og 'all' er begge eksplisitte deltagerlister på database-nivå;
  // "Alle" er IKKE et eget medlem, kun en UI-snarvei for å velge alle aktive.
  const ids = new Set(entry.participantMemberIds);
  ids.add(entry.member_id);
  return Array.from(ids);
}

export function sessionHoursMinutes(entry: Pick<TimeEntryForHours, 'duration_minutes'>): number {
  return entry.duration_minutes;
}

export function personHoursMinutes(entry: TimeEntryForHours): number {
  return entry.duration_minutes * resolveParticipants(entry).length;
}

export function summarizeMemberHours(
  entries: Array<TimeEntryForHours & { work_date: string }>,
): MemberHoursSummary[] {
  const byMember = new Map<string, MemberHoursSummary>();

  for (const entry of entries) {
    const participants = resolveParticipants(entry);
    const isGroup = participants.length > 1;

    for (const memberId of participants) {
      const existing = byMember.get(memberId) ?? {
        memberId,
        individualMinutes: 0,
        groupMinutes: 0,
        totalMinutes: 0,
        lastEntryDate: null,
      };
      if (isGroup) {
        existing.groupMinutes += entry.duration_minutes;
      } else {
        existing.individualMinutes += entry.duration_minutes;
      }
      existing.totalMinutes += entry.duration_minutes;
      if (!existing.lastEntryDate || entry.work_date > existing.lastEntryDate) {
        existing.lastEntryDate = entry.work_date;
      }
      byMember.set(memberId, existing);
    }
  }

  return Array.from(byMember.values());
}
