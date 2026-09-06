'use client';

import { useMemo, useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import type { Milestone, ProjectMember, Task } from '@/types/database';
import { TASK_STATUS, TASK_STATUS_LABELS } from '@/types/enums';
import { isDueSoon, isTaskOverdue } from '@/lib/calculations/tasks';
import { QuickTaskDialog } from './quick-task-dialog';
import { TaskCard } from './task-card';

interface Props {
  projectId: string;
  tasks: Task[];
  members: ProjectMember[];
  milestones: Milestone[];
  currentMemberId: string | null;
  initialFilter?: string;
}

export function OppgaverClient({ projectId, tasks, members, milestones, currentMemberId, initialFilter }: Props) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let list = tasks;
    if (initialFilter === 'overdue') list = list.filter((t) => isTaskOverdue(t));
    if (initialFilter === 'due_soon') list = list.filter((t) => isDueSoon(t));
    if (initialFilter && ['not_started', 'in_progress', 'blocked', 'done'].includes(initialFilter)) {
      list = list.filter((t) => t.status === initialFilter);
    }
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((t) => t.title.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q));
  }, [tasks, search, initialFilter]);

  const mine = filtered.filter((t) => t.assignee_id === currentMemberId);
  const overdue = filtered.filter((t) => isTaskOverdue(t));
  const dueSoon = filtered.filter((t) => isDueSoon(t));

  const withRefs = (list: Task[]) =>
    list.map((t) => ({
      task: t,
      assignee: members.find((m) => m.id === t.assignee_id),
      milestone: milestones.find((m) => m.id === t.milestone_id),
    }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Oppgaver</h1>
        <QuickTaskDialog projectId={projectId} members={members} milestones={milestones} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Forfalt" value={overdue.length} tone="destructive" />
        <StatCard label="Forfaller snart" value={dueSoon.length} tone="warning" />
        <StatCard label="Ikke startet" value={filtered.filter((t) => t.status === 'not_started').length} />
        <StatCard label="I gang" value={filtered.filter((t) => t.status === 'in_progress').length} />
      </div>

      <Input placeholder="Søk i oppgaver..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />

      <Tabs defaultValue="liste">
        <TabsList>
          <TabsTrigger value="liste">Liste</TabsTrigger>
          <TabsTrigger value="kanban">Kanban</TabsTrigger>
          <TabsTrigger value="mine">Mine oppgaver ({mine.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="liste">
          <div className="flex flex-col gap-2">
            {withRefs(filtered).map(({ task, assignee, milestone }) => (
              <TaskCard key={task.id} projectId={projectId} task={task} assignee={assignee} milestone={milestone} />
            ))}
            {filtered.length === 0 && <p className="text-sm text-muted-foreground">Ingen oppgaver ennå.</p>}
          </div>
        </TabsContent>

        <TabsContent value="kanban">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TASK_STATUS.map((status) => (
              <div key={status} className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-muted-foreground">{TASK_STATUS_LABELS[status]}</h3>
                {withRefs(filtered.filter((t) => t.status === status)).map(({ task, assignee, milestone }) => (
                  <TaskCard key={task.id} projectId={projectId} task={task} assignee={assignee} milestone={milestone} />
                ))}
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="mine">
          <div className="flex flex-col gap-2">
            {withRefs(mine).map(({ task, assignee, milestone }) => (
              <TaskCard key={task.id} projectId={projectId} task={task} assignee={assignee} milestone={milestone} />
            ))}
            {mine.length === 0 && <p className="text-sm text-muted-foreground">Du har ingen tildelte oppgaver.</p>}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: 'destructive' | 'warning' }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div
        className={`text-xl font-semibold ${tone === 'destructive' ? 'text-destructive' : tone === 'warning' ? 'text-warning' : ''}`}
      >
        {value}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
