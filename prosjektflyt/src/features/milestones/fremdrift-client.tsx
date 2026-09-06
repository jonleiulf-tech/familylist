'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, Maximize2, SlidersHorizontal } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ActivityLogEntry, CalendarEvent, Milestone, ProjectMember, Task, TimeEntry } from '@/types/database';
import type { GanttResolution } from '@/types/enums';
import { isMilestoneDelayed } from '@/lib/calculations/milestone';
import { cn } from '@/lib/utils/cn';
import { GanttChart } from './gantt-chart';
import { MilestoneCardList } from './milestone-card-list';
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
  /** Åpner detaljvisningen for denne milepælen ved lasting (?milestone=<id>). */
  initialMilestoneId?: string;
  currentMemberId: string | null;
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
  initialMilestoneId,
  currentMemberId,
}: Props) {
  const [resolution, setResolution] = useState<GanttResolution>('week');
  const [search, setSearch] = useState('');
  const [responsibleFilter, setResponsibleFilter] = useState<string>('all');
  const [hideCompleted, setHideCompleted] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('sort_order');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(initialMilestoneId ?? null);
  const selected = selectedId ? milestones.find((m) => m.id === selectedId) ?? null : null;
  const setSelected = (m: Milestone | null) => setSelectedId(m?.id ?? null);

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
    if (responsibleFilter !== 'all') list = list.filter((m) => m.responsible_member_id === responsibleFilter);
    if (hideCompleted) list = list.filter((m) => m.status !== 'completed');
    return [...list].sort((a, b) => {
      if (sortKey === 'planned_start_date') return (a.planned_start_date ?? '').localeCompare(b.planned_start_date ?? '');
      if (sortKey === 'progress_percent') return b.progress_percent - a.progress_percent;
      return a.sort_order - b.sort_order;
    });
  }, [milestones, search, responsibleFilter, hideCompleted, sortKey, initialFilter]);

  const activeFilterCount = (responsibleFilter !== 'all' ? 1 : 0) + (hideCompleted ? 1 : 0) + (sortKey !== 'sort_order' ? 1 : 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Fremdrift</h1>
          <p className="text-sm text-muted-foreground">
            {milestones.length} milepæler · {milestones.filter((m) => m.status === 'completed').length} ferdige
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={`/gantt/${projectId}`} target="_blank" rel="noopener" title="Åpne Gantt i egen fane">
              <Maximize2 className="h-4 w-4" />
              <span className="hidden sm:inline">Gantt i fullskjerm</span>
              <span className="sm:hidden">Gantt</span>
            </Link>
          </Button>
          <MilestoneFormDialog projectId={projectId} members={members} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Søk i milepæler…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button
          variant={showFilters || activeFilterCount > 0 ? 'secondary' : 'outline'}
          size="sm"
          className="md:hidden"
          onClick={() => setShowFilters((v) => !v)}
        >
          <SlidersHorizontal className="h-4 w-4" /> Filtre{activeFilterCount > 0 && ` (${activeFilterCount})`}
        </Button>

        <div className={cn('flex w-full flex-wrap items-center gap-2 md:flex md:w-auto', showFilters ? 'flex' : 'hidden')}>
          <Select value={responsibleFilter} onValueChange={setResponsibleFilter}>
            <SelectTrigger className="w-full sm:w-48">
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
            <SelectTrigger className="w-full sm:w-48">
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
        </div>

        <div className="ml-auto hidden gap-1 md:flex">
          {(['day', 'week', 'month'] as const).map((r) => (
            <Button key={r} size="sm" variant={resolution === r ? 'default' : 'outline'} onClick={() => setResolution(r)}>
              {r === 'day' ? 'Dag' : r === 'week' ? 'Uke' : 'Måned'}
            </Button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Ingen milepæler matcher filteret.
        </p>
      ) : (
        <>
          {/* Mobil: kortliste. Gantt-en ligger i egen fullskjermside. */}
          <div className="md:hidden">
            <MilestoneCardList milestones={filtered} members={members} onSelect={setSelected} />
          </div>
          <div className="hidden md:block">
            <div className="mb-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
              <LegendDot className="bg-plan" label="Planlagt periode" />
              <LegendDot className="bg-actual" label="Faktisk (i tide)" />
              <LegendDot className="bg-overdue" label="Faktisk (utover plan)" />
              <LegendDot className="bg-progress" label="Fullført del" />
              <LegendDot className="bg-today" label="I dag" />
            </div>
            <GanttChart milestones={filtered} members={members} resolution={resolution} onSelectMilestone={setSelected} />
          </div>
        </>
      )}

      <MilestoneDetailDrawer
        projectId={projectId}
        milestone={selected}
        members={members}
        currentMemberId={currentMemberId}
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
