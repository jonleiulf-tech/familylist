import { getProjectWorkspaceData } from '@/lib/data/dashboard';
import { getCurrentMember } from '@/lib/data/projects';
import { QuickTimeDialog } from '@/features/time/quick-time-dialog';
import { TimeEntriesTable } from '@/features/time/time-entries-table';
import { MemberHoursSummaryTable } from '@/features/reports/member-hours-table';
import { MilestoneSummaryTable } from '@/features/reports/milestone-summary-table';
import { summarizeMemberHours } from '@/lib/calculations/hours';
import { buildMilestoneSummary } from '@/lib/calculations/milestone-summary';

export default async function TimerPage({ params }: { params: { projectId: string } }) {
  const [data, currentMember] = await Promise.all([
    getProjectWorkspaceData(params.projectId),
    getCurrentMember(params.projectId),
  ]);

  const hoursSummary = summarizeMemberHours(
    data.timeEntries.map((e) => ({
      duration_minutes: e.duration_minutes,
      participant_mode: e.participant_mode,
      member_id: e.member_id,
      participantMemberIds: data.timeEntryParticipants[e.id] ?? [],
      work_date: e.work_date,
    })),
  );

  const milestoneSummary = buildMilestoneSummary(data.milestones, data.timeEntries, data.tasks);
  const activeMembers = data.members.filter((m) => m.is_active);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Timer</h1>
        <QuickTimeDialog
          projectId={params.projectId}
          members={activeMembers}
          milestones={data.milestones}
          deliverables={data.deliverables}
          currentMemberId={currentMember?.id ?? null}
        />
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Timeoppsummering per person</h2>
        <MemberHoursSummaryTable projectId={params.projectId} members={data.members} summary={hoursSummary} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Timeoppsummering per milepæl</h2>
        <MilestoneSummaryTable rows={milestoneSummary} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Siste registreringer</h2>
        <TimeEntriesTable
          projectId={params.projectId}
          entries={data.timeEntries}
          members={data.members}
          milestones={data.milestones}
          deliverables={data.deliverables}
          participants={data.timeEntryParticipants}
        />
      </section>
    </div>
  );
}
