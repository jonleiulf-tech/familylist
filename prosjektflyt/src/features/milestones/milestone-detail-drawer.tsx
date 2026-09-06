'use client';

import { useState, useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { FormError } from '@/components/ui/form-error';
import { formatDate, formatDateTime } from '@/lib/utils/format';
import { formatHoursAndMinutes, minutesToDecimalHours } from '@/lib/time/duration';
import {
  actualDurationDays,
  actualVariance,
  delayDays,
  plannedDurationDays,
  plannedEstimatedMinutes,
  plannedVariance,
} from '@/lib/calculations/milestone';
import { cn } from '@/lib/utils/cn';
import type { ActivityLogEntry, CalendarEvent, Milestone, ProjectMember, Task, TimeEntry } from '@/types/database';
import { MILESTONE_STATUS_LABELS, TASK_STATUS_LABELS } from '@/types/enums';
import { QuickTaskDialog } from '@/features/tasks/quick-task-dialog';
import { QuickTimeDialog } from '@/features/time/quick-time-dialog';
import { MilestoneFormDialog } from './milestone-form-dialog';
import { deleteMilestone } from './actions';

interface Props {
  projectId: string;
  milestone: Milestone | null;
  members: ProjectMember[];
  currentMemberId: string | null;
  tasks: Task[];
  timeEntries: TimeEntry[];
  calendarEvents: CalendarEvent[];
  activityLog: ActivityLogEntry[];
  onClose: () => void;
}

const ACTION_LABELS: Record<string, string> = {
  created: 'opprettet',
  updated: 'oppdatert',
  deleted: 'slettet',
  completed: 'fullført',
  status_changed: 'status endret',
  invited: 'invitert',
  converted_to_milestone: 'gjort om til milepæl',
};

function signed(minutes: number): string {
  return `${minutes >= 0 ? '+' : '−'}${formatHoursAndMinutes(Math.abs(minutes))}`;
}

export function MilestoneDetailDrawer({
  projectId,
  milestone,
  members,
  currentMemberId,
  tasks,
  timeEntries,
  calendarEvents,
  activityLog,
  onClose,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!milestone) return null;

  const relatedTasks = tasks.filter((t) => t.milestone_id === milestone.id);
  const relatedEntries = timeEntries.filter((t) => t.milestone_id === milestone.id);
  const relatedEvents = calendarEvents.filter((e) => e.milestone_id === milestone.id);
  const relatedLog = activityLog.filter((a) => a.entity_id === milestone.id);
  const loggedMinutes = relatedEntries.reduce((sum, e) => sum + e.duration_minutes, 0);

  const responsible = members.find((m) => m.id === milestone.responsible_member_id);
  const plannedEstimate = plannedEstimatedMinutes(milestone);
  const pv = plannedVariance({ milestone, loggedMinutes });
  const av = actualVariance({ milestone, loggedMinutes });
  const delay = delayDays(milestone);
  const memberName = (id: string) => {
    const m = members.find((mm) => mm.id === id);
    return m ? `${m.first_name} ${m.last_name}` : '–';
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2 pr-6">
            <DialogTitle>{milestone.title}</DialogTitle>
            <div className="flex items-center gap-3">
              <MilestoneFormDialog
                projectId={projectId}
                members={members}
                milestone={milestone}
                trigger={<button type="button" className="text-xs font-medium text-primary hover:underline">Rediger</button>}
              />
              <button
                type="button"
                disabled={pending}
                className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                title="Slett milepæl"
                aria-label="Slett milepæl"
                onClick={() => {
                  if (!window.confirm(`Slette milepælen «${milestone.title}»? Tilknyttede oppgaver og timer beholdes, men mister koblingen.`)) return;
                  startTransition(async () => {
                    const result = await deleteMilestone(projectId, milestone.id);
                    if (!result.ok) setError(result.error);
                    else onClose();
                  });
                }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">{MILESTONE_STATUS_LABELS[milestone.status]}</Badge>
            <span>Ansvarlig: {responsible ? `${responsible.first_name} ${responsible.last_name}` : '–'}</span>
            <span>
              Plan: {formatDate(milestone.planned_start_date)} – {formatDate(milestone.planned_end_date)}
            </span>
            {milestone.actual_start_date && (
              <span>
                Faktisk: {formatDate(milestone.actual_start_date)} – {formatDate(milestone.actual_end_date)}
              </span>
            )}
            {delay != null && delay > 0 && <Badge variant="destructive">{delay} dager forsinket</Badge>}
            {delay != null && delay < 0 && milestone.status === 'completed' && (
              <Badge variant="success">{Math.abs(delay)} dager foran plan</Badge>
            )}
          </div>
        </DialogHeader>

        <FormError message={error} />

        {milestone.description && <p className="text-sm text-muted-foreground">{milestone.description}</p>}

        <div>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span>Fremdrift</span>
            <span className="font-medium">{milestone.progress_percent}%</span>
          </div>
          <Progress value={milestone.progress_percent} />
        </div>

        <div className="grid grid-cols-2 gap-4 rounded-md border border-border p-3 text-sm sm:grid-cols-4">
          <div>
            <div className="text-xs text-muted-foreground">Planlagt varighet</div>
            <div className="font-medium">{plannedDurationDays(milestone) ?? '–'} dager</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Faktisk varighet</div>
            <div className="font-medium">{actualDurationDays(milestone) ?? '–'} dager</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Planlagt tid</div>
            <div className="font-medium">{plannedEstimate != null ? formatHoursAndMinutes(plannedEstimate) : '–'}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Registrert tid</div>
            <div className="font-medium">
              {formatHoursAndMinutes(loggedMinutes)} ({minutesToDecimalHours(loggedMinutes)} t)
            </div>
          </div>
          <div className="col-span-2">
            <div className="text-xs text-muted-foreground">Avvik mot plan</div>
            <div className={cn('font-medium', pv.variancePercent == null ? '' : pv.varianceMinutes > 0 ? 'text-destructive' : 'text-success')}>
              {plannedEstimate == null
                ? 'Ingen plan å måle mot'
                : `${signed(pv.varianceMinutes)}${pv.variancePercent != null ? ` (${pv.variancePercent >= 0 ? '+' : ''}${pv.variancePercent} %)` : ''}`}
            </div>
          </div>
          <div className="col-span-2">
            <div className="text-xs text-muted-foreground">Avvik mot faktisk varighet</div>
            <div className={cn('font-medium', av.variancePercent == null ? '' : av.varianceMinutes > 0 ? 'text-destructive' : 'text-success')}>
              {av.variancePercent != null
                ? `${signed(av.varianceMinutes)} (${av.variancePercent >= 0 ? '+' : ''}${av.variancePercent} %)`
                : 'Krever timer/uke og faktiske datoer'}
            </div>
          </div>
        </div>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Tilknyttede TODO-er ({relatedTasks.length})</h3>
            <QuickTaskDialog
              projectId={projectId}
              members={members}
              milestones={[milestone]}
              defaultMilestoneId={milestone.id}
              trigger={<Button size="sm" variant="outline">+ Oppgave</Button>}
            />
          </div>
          <div className="flex flex-col gap-1">
            {relatedTasks.length === 0 && <p className="text-sm text-muted-foreground">Ingen tilknyttede oppgaver.</p>}
            {relatedTasks.map((t) => (
              <div key={t.id} className="flex items-center justify-between text-sm">
                <span className={cn(t.status === 'done' && 'text-muted-foreground line-through')}>{t.title}</span>
                <Badge variant="outline">{TASK_STATUS_LABELS[t.status]}</Badge>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Registrerte timer ({relatedEntries.length})</h3>
            <QuickTimeDialog
              projectId={projectId}
              members={members}
              milestones={[milestone]}
              currentMemberId={currentMemberId}
              defaultMilestoneId={milestone.id}
              trigger={<Button size="sm" variant="outline">+ Registrer tid</Button>}
            />
          </div>
          <div className="flex flex-col gap-1">
            {relatedEntries.length === 0 && <p className="text-sm text-muted-foreground">Ingen registreringer.</p>}
            {relatedEntries.slice(0, 10).map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">
                  {formatDate(e.work_date)} · {memberName(e.member_id)} – {e.description || 'Uten beskrivelse'}
                </span>
                <span className="shrink-0 font-medium">{formatHoursAndMinutes(e.duration_minutes)}</span>
              </div>
            ))}
            {relatedEntries.length > 10 && (
              <p className="text-xs text-muted-foreground">… og {relatedEntries.length - 10} til (se Timer-siden)</p>
            )}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold">Kalenderhendelser ({relatedEvents.length})</h3>
          <div className="flex flex-col gap-1">
            {relatedEvents.length === 0 && <p className="text-sm text-muted-foreground">Ingen hendelser.</p>}
            {relatedEvents.map((e) => (
              <div key={e.id} className="text-sm">
                {formatDateTime(e.start_datetime)} – {e.title}
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold">Aktivitetslogg</h3>
          <div className="flex flex-col gap-1">
            {relatedLog.length === 0 && <p className="text-sm text-muted-foreground">Ingen aktivitet ennå.</p>}
            {relatedLog.slice(0, 10).map((a) => (
              <div key={a.id} className="text-xs text-muted-foreground">
                {formatDateTime(a.created_at)} – Milepæl {ACTION_LABELS[a.action] ?? a.action}
              </div>
            ))}
          </div>
        </section>
      </DialogContent>
    </Dialog>
  );
}
