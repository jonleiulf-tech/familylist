import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProject } from '@/lib/data/projects';
import { getProjectWorkspaceData } from '@/lib/data/dashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { formatDate, formatDateTime } from '@/lib/utils/format';
import { formatHoursAndMinutes, minutesToDecimalHours } from '@/lib/time/duration';
import { computeProjectProgressPercent } from '@/lib/calculations/progress';
import { buildMilestoneSummary } from '@/lib/calculations/milestone-summary';
import { isMilestoneDelayed } from '@/lib/calculations/milestone';
import { countTasksByStatus, isDueSoon, isTaskOverdue } from '@/lib/calculations/tasks';
import { summarizeMemberHours } from '@/lib/calculations/hours';
import { computeProjectHealth, formatHealthExplanation } from '@/lib/calculations/health';
import { PROJECT_STATUS_LABELS, TASK_STATUS_LABELS } from '@/types/enums';
import { HealthBadge } from '@/features/dashboard/health-badge';
import { HoursChart } from '@/features/dashboard/hours-chart';
import { GanttChart } from '@/features/milestones/gantt-chart';

function kpiHref(projectId: string, path: string, filter?: string) {
  return filter ? `/prosjekter/${projectId}/${path}?filter=${filter}` : `/prosjekter/${projectId}/${path}`;
}

export default async function OversiktPage({ params }: { params: { projectId: string } }) {
  const project = await getProject(params.projectId);
  if (!project) notFound();
  const data = await getProjectWorkspaceData(params.projectId);

  const progressPercent = computeProjectProgressPercent(data.milestones);
  const taskCounts = countTasksByStatus(data.tasks);
  const overdueTasks = data.tasks.filter((t) => isTaskOverdue(t));
  const dueSoonTasks = data.tasks.filter((t) => isDueSoon(t));
  const inProgressMilestones = data.milestones.filter((m) => m.status === 'in_progress');
  const delayedMilestones = data.milestones.filter((m) => isMilestoneDelayed(m));

  const milestoneSummary = buildMilestoneSummary(data.milestones, data.timeEntries, data.tasks);
  const totalLoggedMinutes = data.timeEntries.reduce((sum, e) => sum + e.duration_minutes, 0);
  const totalPlannedMinutes = milestoneSummary.reduce((sum, r) => sum + (r.plannedEstimatedMinutes ?? 0), 0);
  const timeVariancePercent =
    totalPlannedMinutes > 0 ? Math.round(((totalLoggedMinutes - totalPlannedMinutes) / totalPlannedMinutes) * 1000) / 10 : null;

  const health = computeProjectHealth({
    overdueTaskCount: overdueTasks.length,
    milestonesBehindSchedule: delayedMilestones.length,
    timeVariancePercent,
  });

  const hoursSummary = summarizeMemberHours(
    data.timeEntries.map((e) => ({
      duration_minutes: e.duration_minutes,
      participant_mode: e.participant_mode,
      member_id: e.member_id,
      participantMemberIds: data.timeEntryParticipants[e.id] ?? [],
      work_date: e.work_date,
    })),
  );

  const now = new Date();
  const in14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const upcomingTasks = data.tasks.filter((t) => t.due_date && t.due_date >= now.toISOString().slice(0, 10) && t.due_date <= in14Days.toISOString().slice(0, 10));
  const upcomingEvents = data.upcomingEvents.filter((e) => e.start_datetime >= now.toISOString() && e.start_datetime <= in14Days.toISOString());
  const upcomingMilestones = data.milestones.filter(
    (m) => m.planned_end_date && m.planned_end_date >= now.toISOString().slice(0, 10) && m.planned_end_date <= in14Days.toISOString().slice(0, 10),
  );

  const bigVarianceMilestones = milestoneSummary.filter(
    (r) => r.plannedVariancePercent != null && r.plannedVariancePercent >= 20,
  );

  const chartData = milestoneSummary
    .filter((r) => r.plannedEstimatedMinutes != null)
    .slice(0, 8)
    .map((r) => ({
      name: r.milestone.title.length > 14 ? `${r.milestone.title.slice(0, 14)}…` : r.milestone.title,
      planlagt: minutesToDecimalHours(r.plannedEstimatedMinutes ?? 0),
      registrert: minutesToDecimalHours(r.loggedMinutes),
    }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-border bg-card p-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{project.name}</h1>
            <Badge variant="outline">{PROJECT_STATUS_LABELS[project.status]}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Prosjektleder:{' '}
            {data.members.find((m) => m.user_id === project.project_manager_id)?.first_name ?? '–'} ·{' '}
            {formatDate(project.start_date)} – {formatDate(project.planned_end_date)}
          </p>
          <div className="mt-3 w-64">
            <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>Fremdrift</span>
              <span>{progressPercent}%</span>
            </div>
            <Progress value={progressPercent} />
          </div>
        </div>
        <HealthBadge health={health.health} explanation={formatHealthExplanation(health)} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard
          label="Åpne oppgaver"
          value={data.tasks.length - taskCounts.done}
          href={kpiHref(params.projectId, 'oppgaver')}
        />
        <KpiCard
          label="Forfalte oppgaver"
          value={overdueTasks.length}
          tone={overdueTasks.length > 0 ? 'destructive' : undefined}
          href={kpiHref(params.projectId, 'oppgaver', 'overdue')}
        />
        <KpiCard
          label="Milepæler i gang"
          value={inProgressMilestones.length}
          href={kpiHref(params.projectId, 'fremdrift', 'in_progress')}
        />
        <KpiCard
          label="Forsinkede milepæler"
          value={delayedMilestones.length}
          tone={delayedMilestones.length > 0 ? 'destructive' : undefined}
          href={kpiHref(params.projectId, 'fremdrift', 'delayed')}
        />
        <KpiCard
          label="Registrerte timer"
          value={formatHoursAndMinutes(totalLoggedMinutes)}
          href={kpiHref(params.projectId, 'timer')}
        />
        <KpiCard
          label="Avvik mot estimat"
          value={timeVariancePercent != null ? `${timeVariancePercent >= 0 ? '+' : ''}${timeVariancePercent}%` : '–'}
          tone={timeVariancePercent != null && timeVariancePercent >= 20 ? 'destructive' : undefined}
          href={kpiHref(params.projectId, 'timer')}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Dette skjer nå</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {inProgressMilestones.length === 0 && <p className="text-sm text-muted-foreground">Ingen aktive milepæler.</p>}
            {inProgressMilestones.map((m) => (
              <Link
                key={m.id}
                href={`/prosjekter/${params.projectId}/fremdrift`}
                className="flex items-center justify-between text-sm hover:underline"
              >
                <span>{m.title}</span>
                <span className="text-muted-foreground">{m.progress_percent}%</span>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Neste 14 dager</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Milepæler</p>
              {upcomingMilestones.length === 0 && <p className="text-muted-foreground">Ingen.</p>}
              {upcomingMilestones.map((m) => (
                <div key={m.id}>{m.title} – {formatDate(m.planned_end_date)}</div>
              ))}
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Oppgaver</p>
              {upcomingTasks.length === 0 && <p className="text-muted-foreground">Ingen.</p>}
              {upcomingTasks.map((t) => (
                <div key={t.id}>{t.title} – {formatDate(t.due_date)}</div>
              ))}
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Møter/hendelser</p>
              {upcomingEvents.length === 0 && <p className="text-muted-foreground">Ingen.</p>}
              {upcomingEvents.map((e) => (
                <div key={e.id}>{e.title} – {formatDateTime(e.start_datetime)}</div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Prosjektrisiko</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <Link href={kpiHref(params.projectId, 'fremdrift', 'delayed')} className="flex justify-between hover:underline">
              <span>Forsinkede milepæler</span>
              <span className="font-medium text-destructive">{delayedMilestones.length}</span>
            </Link>
            <Link href={kpiHref(params.projectId, 'oppgaver', 'overdue')} className="flex justify-between hover:underline">
              <span>Forfalte TODO-er</span>
              <span className="font-medium text-destructive">{overdueTasks.length}</span>
            </Link>
            <Link href={kpiHref(params.projectId, 'timer')} className="flex justify-between hover:underline">
              <span>Milepæler med stort timeavvik ({'>'}20%)</span>
              <span className="font-medium text-destructive">{bigVarianceMilestones.length}</span>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Team</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {hoursSummary
              .sort((a, b) => b.totalMinutes - a.totalMinutes)
              .slice(0, 6)
              .map((h) => {
                const member = data.members.find((m) => m.id === h.memberId);
                if (!member) return null;
                return (
                  <Link
                    key={h.memberId}
                    href={`/prosjekter/${params.projectId}/team/${h.memberId}`}
                    className="flex items-center justify-between text-sm hover:underline"
                  >
                    <span>{member.first_name} {member.last_name}</span>
                    <span className="text-muted-foreground">{formatHoursAndMinutes(h.totalMinutes)}</span>
                  </Link>
                );
              })}
            {hoursSummary.length === 0 && <p className="text-sm text-muted-foreground">Ingen timer registrert ennå.</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fremdrift (kompakt)</CardTitle>
        </CardHeader>
        <CardContent>
          {data.milestones.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ingen milepæler ennå.</p>
          ) : (
            <GanttChart milestones={data.milestones.slice(0, 8)} members={data.members} resolution="week" onSelectMilestone={() => {}} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Timer: planlagt vs. registrert</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ingen estimater å sammenligne med ennå.</p>
          ) : (
            <HoursChart data={chartData} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone,
  href,
}: {
  label: string;
  value: number | string;
  tone?: 'destructive';
  href: string;
}) {
  return (
    <Link href={href}>
      <Card className="transition-shadow hover:shadow-md">
        <CardContent className="py-4">
          <div className={`text-2xl font-semibold ${tone === 'destructive' ? 'text-destructive' : ''}`}>{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </CardContent>
      </Card>
    </Link>
  );
}
