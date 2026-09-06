'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ActivityLogEntry, CalendarEvent, Milestone, ProjectMember, Task, TimeEntry } from '@/types/database';
import type { GanttResolution } from '@/types/enums';
import { isMilestoneDelayed } from '@/lib/calculations/milestone';
import { GanttChart } from './gantt-chart';
import { MilestoneDetailDrawer } from './milestone-detail-drawer';
import { MilestoneFormDialog } from './milestone-form-dialog';

interface Props {
  projectId: string;
  milestones: Milestone[];
  members: ProjectMember[];
  tasks: Task[];
  timeEntries: TimeEntry[];
  calendarEvents: CalendarEvent[];
  activityLog: ActivityLogEntry[];
  initialFilter?: string;
}

type SortKey = 'sort_order' | 'planned_start_date' | 'progress_percent';

export function FremdriftClient({
  projectId,
  milestones,
  members,
  tasks,
  timeEntries,
  calendarEvents,
  activityLog,
  initialFilter,
}: Props) {
  const [resolution, setResolution] = useState<GanttResolution>('week');
  const [search, setSearch] = useState('');
  const [responsibleFilter, setResponsibleFilter] = useState<string>('all');
  const [hideCompleted, setHideCompleted] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('sort_order');
  const [selected, setSelected] = useState<Milestone | null>(null);

  const filtered = useMemo(() => {
    let list = milestones;
    if (initialFilter === 'delayed') {
      list = list.filter((m) => isMilestoneDelayed(m));
    } else if (initialFilter && ['not_started', 'in_progress', 'completed', 'delayed_status'].includes(initialFilter)) {
      list = list.filter((m) => m.status === initialFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((m) => m.title.toLowerCase().includes(q) || m.description?.toLowerCase().includes(q));
    }
    if (responsibleFilter !== 'all') {
      list = list.filter((m) => m.responsible_member_id === responsibleFilter);
    }
    if (hideCompleted) {
      list = list.filter((m) => m.status !== 'completed');
    }
    return [...list].sort((a, b) => {
      if (sortKey === 'planned_start_date') {
        return (a.planned_start_date ?? '').localeCompare(b.planned_start_date ?? '');
      }
      if (sortKey === 'progress_percent') {
        return b.progress_percent - a.progress_percent;
      }
      return a.sort_order - b.sort_order;
    });
  }, [milestones, search, responsibleFilter, hideCompleted, sortKey, initialFilter]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Fremdrift</h1>
        <MilestoneFormDialog projectId={projectId} members={members} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-56">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Søk i milepæler..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={responsibleFilter} onValueChange={setResponsibleFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Ansvarlig" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle ansvarlige</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.first_name} {m.last_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sort_order">Egendefinert rekkefølge</SelectItem>
            <SelectItem value="planned_start_date">Planlagt startdato</SelectItem>
            <SelectItem value="progress_percent">Fremdrift</SelectItem>
          </SelectContent>
        </Select>
        <Button variant={hideCompleted ? 'default' : 'outline'} size="sm" onClick={() => setHideCompleted((v) => !v)}>
          Skjul ferdige
        </Button>
        <div className="ml-auto flex gap-1">
          {(['day', 'week', 'month'] as const).map((r) => (
            <Button key={r} size="sm" variant={resolution === r ? 'default' : 'outline'} onClick={() => setResolution(r)}>
              {r === 'day' ? 'Dag' : r === 'week' ? 'Uke' : 'Måned'}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <LegendDot className="bg-plan" label="Planlagt periode" />
        <LegendDot className="bg-actual" label="Faktisk (i tide)" />
        <LegendDot className="bg-overdue" label="Faktisk (utover plan)" />
        <LegendDot className="bg-progress" label="Fullført del" />
        <LegendDot className="bg-today" label="I dag" />
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Ingen milepæler matcher filteret.
        </p>
      ) : (
        <GanttChart milestones={filtered} members={members} resolution={resolution} onSelectMilestone={setSelected} />
      )}

      <MilestoneDetailDrawer
        projectId={projectId}
        milestone={selected}
        members={members}
        tasks={tasks}
        timeEntries={timeEntries}
        calendarEvents={calendarEvents}
        activityLog={activityLog}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-sm ${className}`} />
      {label}
    </span>
  );
}
