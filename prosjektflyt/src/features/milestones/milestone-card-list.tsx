'use client';

import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { formatDate } from '@/lib/utils/format';
import { delayDays } from '@/lib/calculations/milestone';
import type { Milestone, ProjectMember } from '@/types/database';
import { MILESTONE_STATUS_LABELS } from '@/types/enums';
import { cn } from '@/lib/utils/cn';

/**
 * Milepæler som kort – brukes på mobil der en Gantt er for bred til å gi
 * mening. Samme informasjon: plan, faktisk, fremdrift, forsinkelse.
 */
export function MilestoneCardList({
  milestones,
  members,
  onSelect,
}: {
  milestones: Milestone[];
  members: ProjectMember[];
  onSelect: (m: Milestone) => void;
}) {
  const memberName = (id: string | null) => {
    const m = members.find((mm) => mm.id === id);
    return m ? `${m.first_name} ${m.last_name}` : 'Ingen ansvarlig';
  };

  return (
    <ul className="flex flex-col gap-2">
      {milestones.map((m) => {
        const delay = delayDays(m);
        const late = delay != null && delay > 0;
        return (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => onSelect(m)}
              className="w-full rounded-xl border border-border/70 bg-card p-4 text-left shadow-card transition-shadow active:shadow-none"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-semibold leading-snug">{m.title}</span>
                <Badge variant={m.status === 'completed' ? 'success' : late ? 'destructive' : 'outline'} className="shrink-0">
                  {late && m.status !== 'completed' ? `${delay} d forsinket` : MILESTONE_STATUS_LABELS[m.status]}
                </Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{memberName(m.responsible_member_id)}</p>
              <div className="mt-3 flex items-center gap-3">
                <Progress
                  value={m.progress_percent}
                  className="h-1.5 flex-1"
                  indicatorClassName={cn(m.status === 'completed' ? 'bg-progress' : late ? 'bg-overdue' : 'bg-actual')}
                />
                <span className="text-xs font-medium tabular-nums">{m.progress_percent}%</span>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 text-xs">
                <div>
                  <dt className="text-muted-foreground">Planlagt</dt>
                  <dd>
                    {formatDate(m.planned_start_date)} – {formatDate(m.planned_end_date)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Faktisk</dt>
                  <dd>
                    {m.actual_start_date
                      ? `${formatDate(m.actual_start_date)} – ${m.actual_end_date ? formatDate(m.actual_end_date) : 'pågår'}`
                      : '–'}
                  </dd>
                </div>
              </dl>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
