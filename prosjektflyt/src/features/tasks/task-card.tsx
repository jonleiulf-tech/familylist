'use client';

import { useState, useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormError } from '@/components/ui/form-error';
import { formatDate } from '@/lib/utils/format';
import { isTaskOverdue } from '@/lib/calculations/tasks';
import { cn } from '@/lib/utils/cn';
import type { Task, ProjectMember, Milestone } from '@/types/database';
import { PRIORITY_LABELS, TASK_STATUS, TASK_STATUS_LABELS, type TaskStatus } from '@/types/enums';
import { updateTaskStatus, deleteTask } from './actions';
import { ConvertToMilestoneDialog } from './convert-to-milestone-dialog';

export function TaskCard({
  projectId,
  task,
  assignee,
  milestone,
}: {
  projectId: string;
  task: Task;
  assignee?: ProjectMember;
  milestone?: Milestone;
}) {
  const overdue = isTaskOverdue(task);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setError(null);
      const result = await fn();
      if (!result.ok) setError(result.error ?? 'Noe gikk galt');
    });

  return (
    <div className={cn('flex flex-col gap-2 rounded-md border border-border bg-card p-3', pending && 'opacity-60')}>
      <div className="flex items-start justify-between gap-2">
        <span className={cn('text-sm font-medium', task.status === 'done' && 'text-muted-foreground line-through')}>
          {task.title}
        </span>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Slette oppgaven «${task.title}»?`)) run(() => deleteTask(projectId, task.id));
          }}
          className="text-muted-foreground hover:text-destructive"
          title="Slett"
          aria-label="Slett oppgave"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {task.description && <p className="text-xs text-muted-foreground">{task.description}</p>}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {assignee && (
          <span>
            {assignee.first_name} {assignee.last_name}
          </span>
        )}
        {task.due_date && (
          <span className={overdue ? 'font-medium text-destructive' : ''}>Frist: {formatDate(task.due_date)}</span>
        )}
        <Badge variant="outline">{PRIORITY_LABELS[task.priority]}</Badge>
        {milestone && <Badge variant="secondary">{milestone.title}</Badge>}
      </div>
      <div className="flex items-center justify-between gap-2">
        <Select
          value={task.status}
          onValueChange={(v) => run(() => updateTaskStatus(projectId, task.id, v as TaskStatus))}
        >
          <SelectTrigger className="h-7 w-36 text-xs" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TASK_STATUS.map((s) => (
              <SelectItem key={s} value={s}>
                {TASK_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!task.milestone_id && <ConvertToMilestoneDialog projectId={projectId} task={task} />}
      </div>
      <FormError message={error} />
    </div>
  );
}
