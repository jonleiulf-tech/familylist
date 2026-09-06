'use client';

import { useEffect, useMemo, useRef } from 'react';
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { nb } from 'date-fns/locale';
import { computeMilestoneGanttSegments } from '@/lib/calculations/gantt';
import { formatDate } from '@/lib/utils/format';
import type { Milestone, ProjectMember } from '@/types/database';
import type { GanttResolution } from '@/types/enums';
import { cn } from '@/lib/utils/cn';

const PX_PER_DAY: Record<GanttResolution, number> = { day: 36, week: 14, month: 4 };

interface Props {
  milestones: Milestone[];
  members: ProjectMember[];
  resolution: GanttResolution;
  onSelectMilestone: (milestone: Milestone) => void;
}

function resolveTimeline(milestones: Milestone[]): { start: Date; end: Date } {
  const dates = milestones
    .flatMap((m) => [m.planned_start_date, m.planned_end_date, m.actual_start_date, m.actual_end_date])
    .filter((d): d is string => Boolean(d))
    .map((d) => parseISO(d));

  const today = new Date();
  if (dates.length === 0) return { start: addDays(today, -14), end: addDays(today, 60) };

  const min = new Date(Math.min(...dates.map((d) => d.getTime())));
  const max = new Date(Math.max(...dates.map((d) => d.getTime())));
  return { start: addDays(min, -7), end: addDays(max, 14) };
}

export function GanttChart({ milestones, members, resolution, onSelectMilestone }: Props) {
  const { start, end } = useMemo(() => resolveTimeline(milestones), [milestones]);
  const totalDays = Math.max(1, differenceInCalendarDays(end, start));
  const pxPerDay = PX_PER_DAY[resolution];
  const timelineWidth = totalDays * pxPerDay;

  const markers = useMemo(() => {
    const list: { offsetDays: number; label: string }[] = [];
    if (resolution === 'day') {
      for (let i = 0; i <= totalDays; i++) {
        list.push({ offsetDays: i, label: format(addDays(start, i), 'd. MMM', { locale: nb }) });
      }
    } else if (resolution === 'week') {
      for (let i = 0; i <= totalDays; i += 7) {
        list.push({ offsetDays: i, label: format(addDays(start, i), "'uke' I", { locale: nb }) });
      }
    } else {
      let currentMonth = start.getMonth();
      for (let i = 0; i <= totalDays; i++) {
        const d = addDays(start, i);
        if (d.getMonth() !== currentMonth || i === 0) {
          list.push({ offsetDays: i, label: format(d, 'MMM yyyy', { locale: nb }) });
          currentMonth = d.getMonth();
        }
      }
    }
    return list;
  }, [resolution, start, totalDays]);

  const memberName = (id: string | null) => {
    const m = members.find((mm) => mm.id === id);
    return m ? `${m.first_name} ${m.last_name}` : '–';
  };

  /**
   * Skroll til «i dag» ved lasting. Uten dette starter tidslinjen ved
   * prosjektets første dato, og på en mobilskjerm ser man bare gammel
   * historikk – eller helt tomt – i stedet for det som er aktuelt nå.
   */
  const scrollRef = useRef<HTMLDivElement>(null);
  const todayOffsetDays = differenceInCalendarDays(new Date(), start);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = todayOffsetDays * pxPerDay - el.clientWidth / 3;
    el.scrollLeft = Math.max(0, Math.min(target, el.scrollWidth - el.clientWidth));
  }, [todayOffsetDays, pxPerDay]);

  return (
    <div className="flex overflow-hidden rounded-lg border border-border bg-card">
      {/* Venstre kolonne – smalere på mobil, ligger i ro mens tidslinjen skroller */}
      <div className="w-36 shrink-0 border-r border-border sm:w-56 md:w-72">
        <div className="flex h-10 items-center border-b border-border bg-muted/50 px-2 text-xs font-medium text-muted-foreground sm:px-3">
          Milepæl
        </div>
        {milestones.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onSelectMilestone(m)}
            className="flex h-14 w-full flex-col justify-center border-b border-border px-2 text-left hover:bg-accent sm:px-3"
          >
            <span className="truncate text-xs font-medium sm:text-sm">{m.title}</span>
            <span className="truncate text-[11px] text-muted-foreground sm:text-xs">
              {memberName(m.responsible_member_id)} · {m.progress_percent}%
            </span>
          </button>
        ))}
      </div>

      {/*
        min-w-0 er avgjørende: uten den nekter flex-elementet å krympe under
        innholdsbredden (tidslinjen kan være flere tusen piksler), og HELE
        siden blir bredere enn mobilskjermen.
      */}
      <div ref={scrollRef} className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain">
        <div style={{ width: timelineWidth }}>
          <div className="relative flex h-10 items-center border-b border-border bg-muted/50 text-xs text-muted-foreground">
            {markers.map((mk) => (
              <span key={mk.offsetDays} className="absolute whitespace-nowrap" style={{ left: mk.offsetDays * pxPerDay + 4 }}>
                {mk.label}
              </span>
            ))}
          </div>
          {milestones.map((m) => {
            const segments = computeMilestoneGanttSegments(m, start, end);
            return (
              <div key={m.id} className="relative h-14 border-b border-border">
                {segments.todayOffsetDays != null && (
                  <div
                    className="absolute top-0 z-10 h-full w-0.5 bg-today"
                    style={{ left: segments.todayOffsetDays * pxPerDay }}
                    title="I dag"
                  />
                )}
                {segments.planned && (
                  <div
                    className="absolute top-3 h-3 rounded-sm bg-plan"
                    style={{
                      left: segments.planned.offsetDays * pxPerDay,
                      width: segments.planned.widthDays * pxPerDay,
                    }}
                    title={`Planlagt: ${formatDate(m.planned_start_date)} – ${formatDate(m.planned_end_date)}`}
                  />
                )}
                {segments.actualWithinPlan && (
                  <div
                    className="absolute top-8 h-3 rounded-sm bg-actual"
                    style={{
                      left: segments.actualWithinPlan.offsetDays * pxPerDay,
                      width: segments.actualWithinPlan.widthDays * pxPerDay,
                    }}
                    title="Faktisk (innenfor plan)"
                  />
                )}
                {segments.actualOverdue && (
                  <div
                    className="absolute top-8 h-3 rounded-sm bg-overdue"
                    style={{
                      left: segments.actualOverdue.offsetDays * pxPerDay,
                      width: segments.actualOverdue.widthDays * pxPerDay,
                    }}
                    title="Faktisk (utover plan)"
                  />
                )}
                {segments.progressFill && (
                  <div
                    className={cn('absolute top-8 h-3 rounded-sm bg-progress opacity-70')}
                    style={{
                      left: segments.progressFill.offsetDays * pxPerDay,
                      width: segments.progressFill.widthDays * pxPerDay,
                    }}
                    title={`${m.progress_percent}% fullført`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
