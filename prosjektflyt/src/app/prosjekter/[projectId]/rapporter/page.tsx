import { notFound } from 'next/navigation';
import { getProject } from '@/lib/data/projects';
import { getProjectWorkspaceData } from '@/lib/data/dashboard';
import { summarizeMemberHours } from '@/lib/calculations/hours';
import { buildMilestoneSummary } from '@/lib/calculations/milestone-summary';
import { generateWeeklyReport } from '@/lib/calculations/weekly-report';
import { formatHoursAndMinutes } from '@/lib/time/duration';
import { MemberHoursSummaryTable } from '@/features/reports/member-hours-table';
import { MilestoneSummaryTable } from '@/features/reports/milestone-summary-table';
import { WeeklyReportDialog } from '@/features/reports/weekly-report-dialog';

export default async function RapporterPage({ params }: { params: { projectId: string } }) {
  const project = await getProject(params.projectId);
  if (!project) notFound();
  const data = await getProjectWorkspaceData(params.projectId);

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

  const deliverableRows = data.deliverables.map((d) => ({
    deliverable: d,
    minutes: data.timeEntries.filter((e) => e.deliverable_id === d.id).reduce((sum, e) => sum + e.duration_minutes, 0),
  }));
  const noDeliverableMinutes = data.timeEntries
    .filter((e) => !e.deliverable_id)
    .reduce((sum, e) => sum + e.duration_minutes, 0);

  const report = generateWeeklyReport({
    projectName: project.name,
    milestones: data.milestones,
    tasks: data.tasks,
    timeEntries: data.timeEntries,
    calendarEvents: data.upcomingEvents,
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Rapporter / analyse</h1>
        <WeeklyReportDialog report={report} />
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Timeoppsummering per person</h2>
        <MemberHoursSummaryTable members={data.members} summary={hoursSummary} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Timeoppsummering per milepæl</h2>
        <MilestoneSummaryTable rows={milestoneSummary} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Tid per leveranse/kategori</h2>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-2">Kategori</th>
                <th className="p-2 text-right">Timer</th>
              </tr>
            </thead>
            <tbody>
              {deliverableRows.map((row) => (
                <tr key={row.deliverable.id} className="border-t border-border">
                  <td className="p-2">{row.deliverable.name}</td>
                  <td className="p-2 text-right">{formatHoursAndMinutes(row.minutes)}</td>
                </tr>
              ))}
              <tr className="border-t border-border text-muted-foreground">
                <td className="p-2">Ikke kategorisert</td>
                <td className="p-2 text-right">{formatHoursAndMinutes(noDeliverableMinutes)}</td>
              </tr>
              {deliverableRows.length === 0 && (
                <tr>
                  <td colSpan={2} className="p-2 text-muted-foreground">
                    Ingen leveransekategorier definert ennå (se Prosjektinnstillinger).
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
