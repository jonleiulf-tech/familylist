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
import { addDays, parseISO } from 'date-fns';
import { delayDays, isMilestoneDelayed } from '@/lib/calculations/milestone';
import { todayIsoDate } from '@/lib/dates/today';
import { countTasksByStatus, isDueSoon, isTaskOverdue } from '@/lib/calculations/tasks';
import { summarizeMemberHours } from '@/lib/calculations/hours';
import { computeProjectHealth, formatHealthExplanation } from '@/lib/calculations/health';
import { PROJECT_STATUS_LABELS, TASK_STATUS_LABELS } from '@/types/enums';
import { HealthBadge } from '@/features/dashboard/health-badge';
import { HoursChart } from '@/features/dashboard/hours-chart';
import { CompactGantt } from '@/features/dashboard/compact-gantt';
import { DEMO_PROJECT_NUMBER } from '@/features/demo/demo-project';
import { cn } from '@/lib/utils/cn';
import { KpiCard } from '@/features/dashboard/kpi-card';
import { ListChecks, AlertTriangle, GanttChartSquare, TimerOff, Clock, Scale } from 'lucide-react';

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

  const maxMilestoneDelayDays = delayedMilestones.reduce((max, m) => Math.max(max, delayDays(m) ?? 0), 0);
  const health = computeProjectHealth({
    overdueTaskCount: overdueTasks.length,
    milestonesBehindSchedule: delayedMilestones.length,
    maxMilestoneDelayDays,
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
  const todayIso = todayIsoDate(now);
  const in14DaysIso = todayIsoDate(addDays(now, 14));
  const upcomingTasks = data.tasks.filter(
    (t) => t.status !== 'done' && t.due_date && t.due_date >= todayIso && t.due_date <= in14DaysIso,
  );
  const upcomingEvents = data.upcomingEvents.filter((e) => {
    const start = parseISO(e.start_datetime);
    return start >= now && start <= addDays(now, 14);
  });
  const upcomingMilestones = data.milestones.filter(
    (m) =>
      m.status !== 'completed' &&
      m.planned_end_date &&
      m.planned_end_date >= todayIso &&
      m.planned_end_date <= in14DaysIso,
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
      {project.project_number === DEMO_PROJECT_NUMBER && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          <span>
            <strong>Eksempelprosjekt.</strong> Alt her er fiktivt – Ola og Kari Nordmann, timer, møter og forsinkelser
            er lagt inn for å vise hvordan sidene henger sammen. Klikk deg rundt, endre ting, registrer tid.
          </span>
          <Link href={`/prosjekter/${params.projectId}/innstillinger`} className="font-medium text-primary hover:underline">
            Slett når du er ferdig →
          </Link>
        </div>
      )}
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
          icon={ListChecks}
        />
        <KpiCard
          label="Forfalte oppgaver"
          value={overdueTasks.length}
          tone={overdueTasks.length > 0 ? 'destructive' : 'success'}
          href={kpiHref(params.projectId, 'oppgaver', 'overdue')}
          icon={AlertTriangle}
        />
        <KpiCard
          label="Milepæler i gang"
          value={inProgressMilestones.length}
          href={kpiHref(params.projectId, 'fremdrift', 'in_progress')}
          icon={GanttChartSquare}
        />
        <KpiCard
          label="Forsinkede milepæler"
          value={delayedMilestones.length}
          tone={delayedMilestones.length > 0 ? 'destructive' : 'success'}
          href={kpiHref(params.projectId, 'fremdrift', 'delayed')}
          icon={TimerOff}
        />
        <KpiCard
          label="Registrerte timer"
          value={formatHoursAndMinutes(totalLoggedMinutes)}
          href={kpiHref(params.projectId, 'timer')}
          icon={Clock}
        />
        <KpiCard
          label="Avvik mot estimat"
          value={timeVariancePercent != null ? `${timeVariancePercent >= 0 ? '+' : ''}${timeVariancePercent} %` : '–'}
          tone={
            timeVariancePercent == null
              ? undefined
              : timeVariancePercent >= 20
                ? 'destructive'
                : timeVariancePercent >= 10
                  ? 'warning'
                  : 'success'
          }
          href={kpiHref(params.projectId, 'timer')}
          icon={Scale}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Dette skjer nå</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {inProgressMilestones.length === 0 && <p className="text-sm text-muted-foreground">Ingen aktive milepæler.</p>}
            {inProgressMilestones.map((m) => {
              const late = isMilestoneDelayed(m);
              return (
                <Link
                  key={m.id}
                  href={`/prosjekter/${params.projectId}/fremdrift?milestone=${m.id}`}
                  className="group flex flex-col gap-1.5 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted/60"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{m.title}</span>
                    <span className={cn('shrink-0 text-xs tabular-nums', late ? 'text-destructive' : 'text-muted-foreground')}>
                      {late ? `${delayDays(m)} d forsinket` : `${m.progress_percent}%`}
                    </span>
                  </div>
                  <Progress value={m.progress_percent} className="h-1.5" indicatorClassName={late ? 'bg-overdue' : 'bg-actual'} />
                </Link>
              );
            })}
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
            <CompactGantt projectId={params.projectId} milestones={data.milestones.slice(0, 8)} members={data.members} />
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
